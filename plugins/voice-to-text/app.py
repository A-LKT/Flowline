#!/usr/bin/env python3
"""
Voice-to-text HTTP service.
POST /transcribe { url, language? } → { text }
GET  /health → { status: "ok" }
"""

import asyncio
import functools
import json as json_mod
import logging
import os
import tempfile
import urllib.request
from contextlib import asynccontextmanager

from fastapi import FastAPI
from pydantic import BaseModel
from starlette.responses import StreamingResponse

WHISPER_MODEL = os.environ.get("WHISPER_MODEL", "base")
WHISPER_LANG  = os.environ.get("WHISPER_LANG", "")   # empty = auto-detect

# Hardware selection. device=cuda + compute_type=float16 runs on an NVIDIA GPU
# and is ~10-30x faster than CPU; device=cpu is the portable default. When
# compute_type is left blank we pick a sensible default per device.
WHISPER_DEVICE       = os.environ.get("WHISPER_DEVICE", "cpu")        # cpu | cuda
WHISPER_COMPUTE_TYPE = os.environ.get("WHISPER_COMPUTE_TYPE", "")     # blank = auto
# CPU-only knob: number of worker threads (0 = CTranslate2 auto-detect). Set to
# your physical core count to use a multi-core box. Ignored on cuda.
WHISPER_CPU_THREADS  = int(os.environ.get("WHISPER_CPU_THREADS", "0"))
# Decoding beam width. 5 is the accuracy default; drop to 1 on CPU for ~Nx less
# work at a small quality cost on clear speech.
WHISPER_BEAM_SIZE    = int(os.environ.get("WHISPER_BEAM_SIZE", "5"))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [V2T] %(levelname)s %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
log = logging.getLogger(__name__)

_model = None


def _compute_type() -> str:
    if WHISPER_COMPUTE_TYPE:
        return WHISPER_COMPUTE_TYPE
    return "float16" if WHISPER_DEVICE == "cuda" else "int8"


def get_model():
    global _model
    if _model is None:
        from faster_whisper import WhisperModel
        compute = _compute_type()
        log.info(
            f"Loading Whisper model '{WHISPER_MODEL}' on {WHISPER_DEVICE} "
            f"({compute}); first run downloads weights..."
        )
        _model = WhisperModel(
            WHISPER_MODEL,
            device=WHISPER_DEVICE,
            compute_type=compute,
            cpu_threads=WHISPER_CPU_THREADS,
        )
        log.info("Whisper model ready.")
    return _model


def _prewarm():
    # Load the model at boot so the (potentially multi-GB) weight download and
    # GPU kernel warmup happen here — not inside the first /transcribe call,
    # where they would run against the workflow node's request deadline. Then
    # run one throwaway inference: on a GPU the first real transcription
    # otherwise pays a ~40-60s one-time cost compiling CUDA kernels for the
    # audio shapes. A second of silence is enough to trigger that here.
    try:
        model = get_model()
        import numpy as np
        model.transcribe(np.zeros(16000, dtype=np.float32), beam_size=1)
        log.info("Model warmed (kernels compiled).")
    except Exception as exc:  # keep /health serving so the misconfig is visible
        log.error(f"Model pre-warm failed: {exc}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    _prewarm()
    yield


app = FastAPI(lifespan=lifespan)


class TranscribeRequest(BaseModel):
    url: str
    language: str = ""


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/transcribe")
async def transcribe(req: TranscribeRequest):
    log.info(f"Transcribe request: {req.url!r} lang={req.language or 'auto'}")
    loop = asyncio.get_event_loop()

    async def generate():
        with tempfile.NamedTemporaryFile(suffix=".audio", delete=False) as tmp:
            tmp_path = tmp.name
        try:
            log.info(f"Downloading audio from {req.url}")
            await loop.run_in_executor(
                None, functools.partial(urllib.request.urlretrieve, req.url, tmp_path)
            )

            model = get_model()
            lang  = req.language or WHISPER_LANG or None

            def _run():
                segments, _ = model.transcribe(
                    tmp_path, language=lang, beam_size=WHISPER_BEAM_SIZE
                )
                return " ".join(seg.text.strip() for seg in segments).strip()

            future = loop.run_in_executor(None, _run)

            # Keep the connection alive while the CPU-bound transcription runs.
            # JSON.parse on the Node.js side ignores leading whitespace, so the
            # final JSON chunk is still parsed correctly.
            while not future.done():
                yield b"\n"
                await asyncio.sleep(5)

            text = await future
            log.info(f"Transcription done: {len(text)} chars")
            yield json_mod.dumps({"text": text}).encode()

        except Exception as exc:
            log.error(f"Transcription failed: {exc}")
            yield json_mod.dumps({"error": str(exc)}).encode()
        finally:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass

    return StreamingResponse(generate(), media_type="application/json")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=9000)
