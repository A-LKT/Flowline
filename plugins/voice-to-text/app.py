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

from fastapi import FastAPI
from pydantic import BaseModel
from starlette.responses import StreamingResponse

WHISPER_MODEL = os.environ.get("WHISPER_MODEL", "base")
WHISPER_LANG  = os.environ.get("WHISPER_LANG", "")   # empty = auto-detect

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [V2T] %(levelname)s %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
log = logging.getLogger(__name__)

app = FastAPI()

_model = None

def get_model():
    global _model
    if _model is None:
        from faster_whisper import WhisperModel
        log.info(f"Loading Whisper model '{WHISPER_MODEL}' (first run downloads weights)...")
        _model = WhisperModel(WHISPER_MODEL, device="cpu", compute_type="int8")
        log.info("Whisper model ready.")
    return _model


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
                segments, _ = model.transcribe(tmp_path, language=lang, beam_size=5)
                return " ".join(seg.text.strip() for seg in segments).strip()

            future = loop.run_in_executor(None, _run)

            # Keep the connection alive while the CPU-bound transcription runs.
            # JSON.parse on the Node.js side ignores leading whitespace, so the
            # final JSON chunk is still parsed correctly.
            while not future.done():
                yield b"\n"
                await asyncio.sleep(30)

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
