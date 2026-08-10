# Receipt ingestion with serialized processing (filesystem queue)

A worked example produced from the AI capability reference
(`GET /api/ai/reference.md`). It ingests receipt photos from WhatsApp and
processes them **one at a time** — bursts never spawn parallel runs — using a
**filesystem queue**.

## Why two workflows

The engine runs triggered workflows in parallel (worker pool, default 2–8). If
heavy work ran directly on the WhatsApp webhook, a burst of photos would spawn
parallel runs. So we split intake from processing:

- **`intake.json`** (webhook) — drops a small job file into `queue/` and replies.
  Fast, no heavy work.
- **`drainer.json`** (schedule) — every minute, claims and processes **one** job.

## How serialization holds (no lock table needed)

The drainer lists `queue/`, then uses **move-file** to atomically rename the
oldest job into `processing/`. `rename` is atomic, so if two ticks ever overlap,
only one wins the move — the loser gets `moved:false` and stops (the `Claimed?`
condition routes nowhere on `false`). The winner reads the job, runs vision,
writes the result to `results/`, and deletes the claimed file. Lock-free mutual
exclusion via the filesystem itself.

## The file nodes used

| Node | Role |
|---|---|
| `write-file` | intake drops `queue/<ts>-<pn>.json`; drainer writes `results/...` (subdirectories allowed) |
| `list-files` | enumerate `queue/`, oldest first |
| `move-file` | atomically claim a job (`queue/` → `processing/`); `moved:false` if already taken |
| `read-local-file` | load the claimed job JSON |
| `delete-file` | remove the job after processing |

## Setup (you do these — the AI never touches your system)

1. **Import** both workflows: Workflows → Import → `intake.json`, then `drainer.json`.
2. **Webhook trigger** → path `receipt` → target **Receipt intake** (reached via a
   `/receipt` WhatsApp message with a photo).
3. **Schedule trigger** → cron `* * * * *` → target **Receipt drainer**. Lower the
   frequency if a single receipt takes longer than a minute to process.
4. **Vision model**: ensure Ollama is running and `llava:7b` is pulled, or swap the
   `vision` node for `ai-completion`.

No Data Store tables are required — the queue, in-flight, and results all live on
the filesystem under the server's data files area (served at `/files/`).
