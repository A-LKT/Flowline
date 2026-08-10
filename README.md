# Flowline

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/Node-22-339933.svg?logo=node.js&logoColor=white)](https://nodejs.org)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED.svg?logo=docker&logoColor=white)](docker-compose.yml)

A visual, node-based automation platform for building, running, and monitoring
multi-step workflows. Wire together reusable **nodes** on a drag-and-drop canvas —
call APIs, transform data, branch and loop, run scripts, and send notifications — then
schedule them, trigger them from webhooks/email/files, and inspect every run.

- **Frontend** — React 19 + Vite, ReactFlow canvas, Zustand, Monaco editor
- **Backend** — Node.js 22 + Fastify 5, SQLite (better-sqlite3), a worker-thread run
  engine with 34 built-in node types
- **Sidecars** — WhatsApp bridge, Whisper voice-to-text, optional Ollama / cloud LLMs

See **[DOCS.md](DOCS.md)** for the full user guide and node reference.

## Quick start (Docker)

```bash
git clone <your-repo-url> flowline && cd flowline
cp .env.example .env    # then edit secrets/URLs as needed
docker compose up --build
```

Then open **http://localhost:3001**. Services:

| Service | Port | Purpose |
|---|---|---|
| `app` | 3001 | Backend API + built frontend |
| `whatsapp-bridge` | 3002 | WhatsApp send/receive bridge |
| `voice-to-text` | 9000 | Whisper transcription sidecar |

Data (SQLite DB, files, license/instance state) persists in the `workflow_data`
volume mounted at `/app/data`.

> **Secure your instance.** Set `API_TOKEN` in `docker-compose.yml` — without it,
> anyone who can reach port 3001 can read workflows, run them, and export decrypted
> secrets. See the "Admin & Backup" section of [DOCS.md](DOCS.md).

## Local development

```bash
# backend  (http://localhost:3001)
cd backend && npm install && npm run dev

# frontend (Vite dev server)
cd frontend && npm install && npm run dev
```

Tests and build: `cd backend && npm test && npm run build`, and
`cd frontend && npm run build`.

## Editions & licensing

Flowline is **open-core**:

- The **core** — everything except the premium directories below — is free software
  under the **[GNU AGPL-3.0](LICENSE)**. You may self-host, modify, and use it for any
  purpose, including commercially, subject to AGPL's terms (notably: if you offer a
  modified version as a network service, you must publish your source changes).
- The **premium tier** is a paid add-on under a separate commercial license
  ([LICENSE-PREMIUM](LICENSE-PREMIUM)), unlocked at runtime by a signed license key:

  | Premium feature | Directory |
  |---|---|
  | LLM Assistant | `backend/src/plugins/assistant/` |
  | Housekeeping | `backend/src/plugins/housekeeping/` |
  | Artifact History | `backend/src/plugins/artifact-history/` |

  Premium source ships in this repo for transparency, but using or enabling it requires
  a commercial license and key. How the key gate works (Ed25519-signed, instance-bound,
  expiring) is documented in **[PREMIUM-LICENSING.md](PREMIUM-LICENSING.md)**.

Running without a license key gives you the full free edition — no premium surfaces,
everything else works.

## Documentation

- [DOCS.md](DOCS.md) — user guide, node reference, keyboard shortcuts
- [PREMIUM-LICENSING.md](PREMIUM-LICENSING.md) — premium licensing & key enforcement
- [CONTRIBUTING.md](CONTRIBUTING.md) — how to contribute (note the CLA)
