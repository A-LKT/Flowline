# Receipt ingestion workflow pair

Two workflows that let you keep snapping receipt photos to a WhatsApp chat while
they're parsed asynchronously by a local Ollama vision model — never blocking,
never double-processing.

```
WhatsApp photo ──► [1] Intake (webhook)        ──► queue/*.json  ──┐
                       └─ instant "received ✅"                     │
                                                                   ▼
   nvidia GPU ◄── Ollama vision ◄── [2] Drainer (cron, 1 job/tick, FIFO)
                                        └─ receipts/*.json + WhatsApp reply
```

## Import

Workflows → **Import** for each file (a fresh id is assigned on import):

1. `1-whatsapp-receipt-intake.json`
2. `2-receipt-queue-drainer.json` — the plain drainer, **or**
2b. `2b-receipt-queue-drainer-preprocess.json` — same logic + image preprocessing (see below)

Use **one** drainer, not both (they'd race on the same queue — harmless thanks to
the atomic claim, but pointless). Point your schedule trigger at whichever you pick.

## Variant 2b: image preprocessing before vision

Downscaling + grayscale + contrast normalization often lifts OCR accuracy on faded
B&W thermal receipts, and downscaling cuts vision tokens (less VRAM, faster). This
variant inserts three nodes before vision: `fetch` (image → base64) → `preprocess`
(sandbox `sharp` script) → vision now reads the cleaned `receipt-pre.jpg`.

The `sharp` step does: auto-orient (EXIF) → grayscale → `normalize()` (tonal stretch)
→ mild `linear(1.15,-15)` contrast + `sharpen()` → downscale long edge to `maxEdge`
(default 1600, a workflow variable). Tune `maxEdge` and the `linear()` constants in
`preprocess-receipt-image.script.json` if needed.

**Extra prerequisites for 2b:**
- **Docker must be running** — the sandbox script shells out to `docker run`
  (`node:22-slim`, `npm install sharp`). First run pulls the image + installs sharp
  (~30–60 s) *inside the script timeout*, then it's cached. **Pre-warm to avoid a
  cold-start timeout:** `docker pull node:22-slim`. *(Verified: Docker 29.5.3 present.)*
- **Import the script:** the script isn't part of the workflow file. Add it via the
  Scripts space, or POST it:
  ```bash
  curl -X POST http://localhost:3001/scripts \
    -H 'Content-Type: application/json' \
    --data @receipt-workflows/preprocess-receipt-image.script.json
  ```
  The drainer references it by name (`preprocess-receipt-image`).

Why base64 in / file-URL out: the script runs in a container that can't see the
host's wa-media folder, so we hand it the image as base64 and let it emit a file the
engine serves under `/files/`. No container↔engine path or network assumptions.

## Triggers (create these in the Triggers UI — they are not part of the files)

**Intake → webhook**
- Kind: `webhook`
- Path: `receipts` (the WhatsApp bridge forwards `/command` messages here → `POST /webhooks/receipts`)
- Target workflow: *WhatsApp Receipt Intake*
- Leave secret optional for local use.

**Drainer → schedule**
- Kind: `schedule`
- Cron: `*/1 * * * *` (every minute). Vision takes ~10–30 s/receipt, so one
  job/minute is a safe start; tighten to `*/20 * * * * *` (6-field, every 20 s)
  if photos pile up.
- Timezone: `Europe/Warsaw`
- Target workflow: *Receipt Queue Drainer*

## The vision model (your 8 GB constraint)

Set as the workflow variable `model` in workflow 2 — change it in one place.

| Model | ~VRAM | Notes |
|-------|-------|-------|
| **`qwen2.5vl:3b`** *(default)* | ~3–4 GB | Best receipt-OCR-per-VRAM. Headroom matters: high-res receipts produce many vision tokens whose KV cache stacks on top of the weights. |
| `minicpm-v` (2.6) | ~5–6 GB | Strong OCR fallback if 3B struggles on dense/faded receipts. |
| `qwen2.5vl:7b` | ~6 GB weights, borderline | Only if you cap image resolution/context — test against `nvidia-smi` before relying on it. |

```bash
ollama pull qwen2.5vl:3b
```
Verify exact tags at https://ollama.com/library and watch `nvidia-smi` on the
first real receipt to confirm it fits without spilling to CPU.

## How it satisfies the design

- **Async / non-blocking** — intake only writes a job file and acks; all heavy
  work is in the drainer.
- **FIFO** — `list-files` returns oldest-first; the drainer always takes `files[0]`.
- **No parallel double-processing** — `move-file` is an atomic claim. If two ticks
  overlap, the loser gets `moved:false` and stops. The move *is* the lock.
- **Feedback** — intake replies "Receipt received ✅" instantly (and asks for a
  photo if none was attached); the drainer sends the extracted JSON back when done.

## Image path: why the drainer fetches by URL, not the stored path

The WhatsApp bridge runs in a container and stamps each media path as **it** sees
it — `/app/media/wa_xxx.jpeg`. But `docker-compose.yml` mounts the *same* host
folder `./wa-media` at a *different* path in each service:

```yaml
- ./wa-media:/app/wa-media   # engine
- ./wa-media:/app/media      # bridge  ← path the job records
```

The engine runs natively on Windows (`backend/.env: WA_MEDIA_DIR=../wa-media`), so
it can't open `/app/media/...` → it became `D:\app\media\...` → **ENOENT**.

Fix: the engine serves every media file by basename at `/media/<name>` (verified
200), and `ollama-vision` accepts an `http(s)` URL (it fetches + base64-encodes).
So the drainer's `url` node derives the basename and builds
`{{variables.engineBaseUrl}}/media/<name>` and feeds that to vision. Robust to the
container/host path split; no shared-path assumptions.

## Before the first successful run

- **Pull the vision model** — only `qwen3:14b` (text-only) is installed:
  `ollama pull qwen2.5vl:3b`. `OLLAMA_URL` is already `http://localhost:11434` ✓.
- **Stuck jobs live in `backend/data/files/processing/`.** A run that errors at
  vision leaves its claimed job there (see limitation below). Move it back to
  `queue/` to retry.

## Known v1 limitations (not blockers)

- **Error path leaks jobs.** If `ollama-vision` errors, the job stays in
  `processing/` and is neither retried nor deleted. To handle: set the drainer's
  `onErrorWorkflowId` to a tiny workflow that moves `processing/*` → `failed/`.
- **One photo per message** — only `media[0]` is processed.
- **One job/tick** — bursts back up until drained. For burst drain, wrap the
  drainer body in a `loop` (adds complexity) or use a tighter cron.

## First test (verify the load-bearing assumption)

The whole chain depends on the job file being valid JSON (not `[object Object]`).
1. Import both, create the webhook trigger.
2. Send one receipt photo on WhatsApp.
3. Confirm the "received ✅" reply, then open the newest file in `queue/` — it must
   be real JSON with `sender`, `image`, `ts`, `uid`.
4. Wait for the next cron tick; confirm a file appears in `receipts/` and you get
   the parsed reply on WhatsApp.
