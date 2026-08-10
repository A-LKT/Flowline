# Flowline — Documentation

> Generated from the in-app documentation. Last updated: 2026-05-11.

---

## Table of Contents

- [Introduction](#introduction)
- [Getting Started](#getting-started)
- **Core Concepts**
  - [Workflows](#workflows)
  - [Nodes & Edges](#nodes--edges)
  - [Variables & Expressions](#variables--expressions)
  - [Scripts](#scripts)
  - [Triggers](#triggers)
  - [Run Panel](#run-panel)
- **Guides**
  - [Data Store](#data-store)
  - [Jobs](#jobs)
  - [Run Workflow Node](#run-workflow-node)
  - [WhatsApp Bridge](#whatsapp-bridge)
  - [Plugin Modules](#plugin-modules)
  - [AI Completion](#ai-completion)
  - [Admin & Backup](#admin--backup)
- **Node Reference**
  - [Logic Nodes](#logic-nodes)
  - [Control Nodes](#control-nodes)
  - [Data Nodes](#data-nodes)
  - [Data Store Nodes](#data-store-nodes)
  - [File Nodes](#file-nodes)
  - [Integration Nodes](#integration-nodes)
  - [Notification Nodes](#notification-nodes)
  - [AI Nodes](#ai-nodes)
- [Keyboard Shortcuts](#keyboard-shortcuts)

---

## Introduction

A visual, node-based automation platform for building, running, and monitoring multi-step workflows.

### What is it?

Flowline lets you wire together reusable building blocks — called **nodes** — on a drag-and-drop canvas to define automated processes. Nodes communicate by passing data along directed edges. A workflow can read from APIs, transform data, make decisions, loop over collections, send notifications, and more — all without writing a deployment pipeline.

### Key concepts

| Concept | Description |
|---|---|
| **Workflow** | A named, versioned graph of nodes and edges. |
| **Node** | A typed building block that performs one unit of work. |
| **Edge** | A directed connection that carries data from one node to the next. |
| **Variable** | A named value shared across an entire workflow run. |
| **Script** | A reusable JavaScript function callable from any Script node. |
| **Trigger** | A schedule or webhook that starts a workflow automatically. |
| **Run** | A single execution instance with its own results and logs. |

### Spaces

| Space | Purpose |
|---|---|
| **Workflows** | Build and run automation graphs on the canvas. |
| **Scripts** | Write reusable JavaScript functions for Script nodes. |
| **Triggers** | Schedule workflows or expose them as webhooks. |
| **Data Store** | Manage persistent user-defined tables — create, edit, and inspect rows. |
| **Jobs** | Browse run history, inspect results and logs, and replay past runs on the canvas. |
| **Secrets** | Store encrypted credentials used by backend nodes. |
| **Documentation** | The documentation space. |
| **Admin** | System backup, restore, run statistics, and service health. |

### Execution model

Nodes execute in topological order. Independent branches run concurrently using `Promise.all` — a workflow with parallel arms executes them simultaneously on the backend worker thread. When a branch node (Condition, Fork, Switch) fires, only the matching branch continues. The results of each node are stored in an immutable results map for the duration of the run, accessible in downstream expressions as `outputs["nodeId"]`.

> All workflow execution happens on the backend. Some nodes — HTTP Request, Ping, DataStore, AI Completion, Ollama, Send WhatsApp, Transcribe Audio — require the backend by design (network access, secrets, database). The canvas Run panel streams live results from the server via SSE.

### Data persistence

Workflows, scripts, and triggers are persisted to a SQLite database through the Fastify backend. Settings (theme, editor font size) are stored in `localStorage` and are browser-local.

---

## Getting Started

Build and run your first workflow in five steps.

**1. Create a workflow**
From the home screen, open **Workflows**. Click **New Workflow**, give it a name, and press Create. The canvas opens automatically.

**2. Add nodes**
Drag any node from the left palette onto the canvas, or double-click a blank area to open the node picker. Each node type has an icon and a category label. Nodes snap to a 16 px grid.

**3. Connect nodes**
Hover over a node to reveal its handles (small circles). Drag from an output handle to an input handle on another node to create an edge. Fork, Loop, and Switch nodes have multiple output handles for each branch.

**4. Configure nodes**
Click any node to open the **Config panel** on the right. Fill in the fields — most fields support expression interpolation: type `{{outputs["nodeId"].field}}` to reference upstream data.

**5. Run and inspect**
Open the **Run panel** at the bottom and press **Run**. Node status badges update in real time (idle → running → success/error). Click any completed node to view its input and output in the Config panel.

### Your first useful workflow

1. Add an **HTTP Request** node. Set URL to `https://httpbin.org/get`, method GET.
2. Add a **Log** node and connect the HTTP node to it.
3. Set the Log message to `{{outputs["httpNode"].data.url}}`.
4. Press Run and watch the log tab populate.

### Saving and version control

Press `Ctrl+S` (or the Save button) to persist changes to the database. The toolbar shows an unsaved indicator (•) when there are uncommitted edits. Use `Ctrl+Z` / `Ctrl+R` for local undo/redo within a session.

> **Unsaved changes are not auto-saved.** If you navigate away with unsaved edits, a Save / Discard / Cancel dialog will appear.

### Import and export

In the Workflows manager, use the **Import** button to load a workflow JSON file. Any open workflow can be exported via the ⚙ cog menu → Export. Exported files include all nodes, edges, and metadata but not run history.

---

## Workflows

A workflow is a versioned, named directed graph that describes an automated process.

### Structure

Every workflow contains:
- **Nodes** — typed building blocks, each with a unique ID, a position on the canvas, and a config object.
- **Edges** — directed connections from one node's output handle to another node's input handle.
- **Variables** — a key/value store initialised before the run starts.
- **Layout direction** — top-to-bottom (TB) or left-to-right (LR); affects auto-layout.

### Workflow lifecycle

```
create → edit (add nodes, edges, config) → save → run → inspect results
```

### Entrypoint nodes

Any node with no incoming edges is treated as an entrypoint. A workflow can have multiple entrypoints; they all fire simultaneously at run start.

### Versioning

Each workflow carries an integer version that increments on every save.

### Variables initialisation

Pre-populate workflow variables from the Run panel before running. These initial values are accessible to all nodes as `variables.name`. Use Set Variable nodes to create or update variables during execution.

### Auto-layout

The **Auto Layout** button rearranges all nodes using a hierarchical algorithm (Sugiyama). This is non-destructive and can be undone with `Ctrl+Z`. Toggle between TB and LR layout directions in the toolbar.

### Error handler

Every workflow can designate another workflow as its **error handler**. Open the settings cog (⚙) → *On error…* and select the target workflow. When any node in the main workflow fails, the engine fires the error handler workflow asynchronously in the background.

> **Avoid error-handler cycles.** A workflow cannot designate itself as its own error handler.

### Cloning and importing

Clone a workflow from the manager to create an independent copy with a new ID. Import accepts workflow JSON files, assigning a new ID on import so the original is preserved.

### Deleting and deprecation

Deleting a workflow that has **no run history** removes it permanently. Deleting one that **has runs** instead **deprecates** it — a soft delete that keeps the workflow (and its runs) in the database so past runs stay reviewable, since a hard delete would cascade its run history away.

A deprecated workflow is read-only history: it is shown in the manager with a **Deprecated** badge, cannot be run or edited (nor targeted by triggers, Run Workflow nodes, or error handlers), and its runs can still be opened for review. Use **Clone** to make a fresh, editable copy, or **Delete permanently** to remove it and its runs for good. If run retention later prunes all of a deprecated workflow's runs, the empty workflow is removed automatically.

---

## Nodes & Edges

Nodes are the fundamental units of work; edges are the data channels between them.

### Node anatomy

| Property | Description |
|---|---|
| type | Determines which registered node definition handles this node. |
| id | Auto-generated UUID unique within the workflow. |
| name | Optional human-readable label shown on the canvas. |
| description | Optional freetext description visible in the Config panel. |
| config | Type-specific configuration object (validated with Zod on run). |
| position | x/y canvas coordinates; snapped to the 16 px grid. |

### Node categories

- **Logic** — Condition, Fork, Switch, Script, Loop: control flow and computation.
- **Control** — Run Workflow, Delay, Set Variable, Log, Label, Junction: execution control and annotation.
- **Data** — Transform, Filter, Sort, Aggregate, Render Template, Math, Datetime: data manipulation.
- **Data Store** — DataStore Query, DataStore Upsert: read from and write to persistent tables.
- **File** — Parse CSV, Format CSV, Read File, Write File: file I/O.
- **Integration** — HTTP Request, GraphQL, Ping: external system communication.
- **Notification** — Send Email, Send Slack, Send Teams, Send WhatsApp: outbound alerts.
- **AI** — AI Completion, Ollama Completion, Ollama Vision, Transcribe Audio: language models and speech.

### Handles

Most nodes have one input handle and one output handle. Branch nodes expose multiple output handles:

- **Fork / Condition** — `true` and `false` handles.
- **Switch** — one handle per named case plus `default`.
- **Loop** — `loop` (body, repeats) and main output (exits).

### Edges

An edge carries the full output object of the source node. An edge's optional *condition* property is a JS expression evaluated at runtime — if falsy, the edge is not followed. Leave empty for unconditional flow.

### Execution order

Nodes execute in topological order. When a node has multiple incoming edges, it waits until all predecessor nodes have completed. Nodes in independent branches execute concurrently.

### Node status

| Status | Badge | Meaning |
|---|---|---|
| idle | — | Not yet executed this run. |
| running | Blue pulse | Currently executing. |
| success | Green | Completed without error. |
| error | Red | Threw an exception. |
| cancelled | Grey | Run was cancelled before this node executed. |

---

## Variables & Expressions

Variables store state across a run; expressions read from nodes and variables inline.

### Workflow variables

Variables are a flat key/value store scoped to a single workflow run. Any node can read any variable; only Set Variable nodes can write to them.

```js
// Read a variable in an expression field
variables.myVar

// Write a variable with the Set Variable node
name:  "myVar"
value: outputs["computeNode"].result
```

### Accessing node outputs

```js
outputs["a1b2c3d4"]          // full output object of a node
outputs["a1b2c3d4"].body     // nested field access
outputs["a1b2c3d4"].items[0] // array element
```

### Expression syntax

| Context | Syntax | Example |
|---|---|---|
| Condition / Filter predicate | JS expression | `outputs["n1"].count > 0` |
| Render Template body | `{{}}` interpolation | `Hello {{variables.name}}!` |
| Transform / Math body | JS function body (use return) | `return outputs["n1"].items.length * 2` |
| URL fields | `{{}}` interpolation | `https://api.example.com/{{variables.id}}` |

### Available context in expressions

- `outputs` — map of all upstream node results (`Record<nodeId, output>`).
- `variables` — current variable store (`Record<string, unknown>`).
- `log(msg)` — write to the execution log (available in Script and Transform).

> **Execution order matters.** An expression can only reference outputs of nodes that have already executed.

---

## Scripts

Reusable JavaScript functions that can be invoked from any Script node in any workflow.

### What is a script?

A script is a named JavaScript function stored separately from any workflow. Scripts are useful when you need the same logic in multiple workflows, or when the logic is too complex for an inline Transform node. The Scripts space provides a full Monaco code editor with autocompletion.

### Script structure

```js
// Scripts receive two arguments:
// - input: object resolved from the node's input bindings
// - context: { outputs, variables, log }

const { items } = input;
const filtered = items.filter(item => item.active);
return { items: filtered, count: filtered.length };
```

> Scripts must use synchronous code. `async/await` is not supported.

### Input bindings

Each input declared by the script can be bound to:
- **Node output** — the full output of any upstream node.
- **Primitive value** — a hardcoded string, number, or boolean.
- **Variable** — the current value of a named workflow variable.

### Timeout

Each script has a configurable timeout in seconds (default 300).

---

## Triggers

Automate workflow execution via cron schedules or incoming HTTP webhooks.

### Trigger types

| Type | How it fires |
|---|---|
| **Schedule** | A cron expression evaluated by the backend on the configured timezone. |
| **Webhook** | An HTTP POST to `/webhooks/:path` with an optional HMAC secret for verification. |

### Creating a trigger

1. Open the **Triggers** space from the home screen.
2. Click **New Trigger** and select the type (Schedule or Webhook).
3. Configure the target workflow, the cron expression or webhook path, and optionally a secret.
4. Enable the trigger.

### Cron syntax

```
┌──── second (0-59, optional)
│ ┌── minute (0-59)
│ │ ┌─ hour (0-23)
│ │ │ ┌─ day-of-month (1-31)
│ │ │ │ ┌─ month (1-12)
│ │ │ │ │ ┌─ day-of-week (0-7, 0=Sunday)
│ │ │ │ │ │
* * * * * *

Examples:
0 9 * * 1-5   — 9:00 AM every weekday
*/15 * * * *  — every 15 minutes
0 0 1 * *     — midnight on the 1st of every month
```

### Webhook security

When a secret is configured, the backend verifies an `X-Webhook-Signature` header (`sha256=<hex>`, HMAC-SHA256 of the raw request body; the GitHub-style `X-Hub-Signature-256` header is also accepted). Leave secret empty to accept all POST requests.

> **Keep webhook secrets private.** Always set a secret in production environments.

### Webhook payload

The JSON body of the webhook POST is merged into the workflow's variable store under the key `trigger`. Reference fields with `{{trigger.myField}}` or `variables.trigger.myField`.

---

## Run Panel

Run, observe, and debug workflows directly from the canvas editor.

### The Run panel

The Run panel lives at the bottom of the canvas editor (drag the handle to resize). Two tabs:
- **Run** — trigger an execution, set initial variables, and watch live status.
- **History** — browse past runs with status, timing, results, and logs. **View** opens a run at `#/jobs/<runId>` in read-only review mode (the palette is replaced by the run's Nodes/Log tabs and the canvas is locked).

> All execution happens on the backend. The Run panel streams live results via SSE — node badges and the log update in real time.

### Running a workflow

1. Open the Run panel (drag handle at the bottom of the canvas).
2. Optionally add initial variable values as JSON key/value pairs.
3. Press **Run**. The workflow is submitted to the backend queue.
4. Node badges update as execution progresses.
5. Click any completed node to view its input/output in the Config panel.

### Cancelling a run

While running, the **Cancel** button (red, far right of the toolbar) sends a cancellation signal:
- The currently executing node is allowed to finish naturally.
- All pending nodes are skipped and set to `cancelled`.
- The run record is finalised with status `cancelled`.

### Node timing display

Enable **Show node timing** in Settings → Canvas. The badge floats to the bottom-right corner of each node:
- **Running** — counts up live from the node's start time.
- **Completed** — shows total wall-clock duration.
- Times are formatted as `<1s`, `5s`, or `2m 14s`.

### Debugging tips

- Insert **Log** nodes at key points to trace data values mid-execution.
- Click a failed node (red badge) to read the error message in the Config panel.
- Use the History tab to compare results across multiple runs.

> **Running saves first.** The backend executes the last saved version of the workflow, so pressing Run automatically saves any unsaved canvas edits before starting.

---

## Data Store

A built-in relational store for persistent, structured data — no external database required.

### What is the Data Store?

The Data Store lets you create user-defined tables inside the workflow engine. Each table has named, typed columns and an unlimited number of rows backed by SQLite.

### Managing tables

Open **Data Store** from the home screen.
- Click **+ New table** to create a table.
- Use **Export SQL** to download the table as a SQL dump.
- Delete a table with the trash icon (irreversible).

### Managing columns

- Click **Add column**, enter a name, and choose a type: `text`, `number`, or `boolean`.
- Double-click a column header to rename it inline.
- Click the **🔑 key icon** to mark a column as a key (used for upsert matching).
- Trash icon deletes a column and all its data.

### Managing rows

- Click **Add row** to insert an empty row.
- Double-click any cell to edit it inline. Press Enter or click away to commit.
- Trash icon on the right of each row deletes that row.

### Copy schema

The **Copy schema** button copies a JSON sample describing column names and types — e.g. `{"name":"text","amount":"number"}`. Use it as a starting point for the DataStore Upsert node's data field.

### Using Data Store from workflows

| Node | What it does |
|---|---|
| **DataStore Query** | Reads rows from a table. Optionally filter by key/value pairs and limit the row count. |
| **DataStore Upsert** | Inserts or updates a row. If key columns are defined and the data matches an existing row, it updates; otherwise it inserts. |

> Both DataStore nodes are **backend-only** — they require the backend to run. Press Run from the canvas to test them.

### Example — append a WhatsApp message to a log table

```json
// Table "messages" with columns: sender (text, key), content (text), timestamp (number)

// DataStore Upsert data field:
{
  "sender":    "{{trigger.sender}}",
  "content":   "{{trigger.content}}",
  "timestamp": "{{variables.ts}}"
}
```

---

## Jobs

A full history of every workflow execution — browse, filter, inspect, and replay runs.

### The Jobs view

Open **Jobs** from the home screen. Each row shows the workflow name, trigger type, status, start time, and duration.

### Filtering

The filter bar combines multiple conditions (AND-combined), and the active filter is
carried in the URL so a filtered list is a shareable link:

- **Workflow** — select a specific workflow from the dropdown.
- **Status** — multi-select any of queued, running, success, error, cancelled.
- **Trigger** — multi-select by trigger type (manual, schedule, webhook, file-watch, email, …).
- **Time range** — a preset (last 1h / 24h / 7d / all).
- **Search** — free-text matching a run-id prefix or workflow name.

Use **Clear** to reset all conditions.

### Reviewing a run on the canvas

**Click any run row** (or **View** on the editor's History tab) to open that run at `#/jobs/<runId>` in a **read-only review mode** — the workflow canvas with the run's results overlaid, locked so a past run can't be accidentally edited. On open, the run's start node is focused automatically. The left column swaps the node palette for two tabs: **Nodes** (per-node execution list; click a node to focus it on the canvas) and **Log** (full execution log). The right column is a read-only inspector for the selected node: a **Re-run node** control on top, and the recorded config, resolved config, input, and output below. Use the toolbar's **Exit** control to leave review mode, or **← Jobs** to return to the list.

Node badges show the recorded status from the historical run. A warning appears if the workflow was modified (or has unsaved edits) since the run, since the canvas may no longer match what executed; the node results always reflect the run. A node deleted since the run still appears, marked *removed*, with its results intact.

### Re-running a single node

From the inspector's **Re-run node** button, re-execute just the selected node against the stored run. A dialog shows the node's recorded input as editable JSON: leave it unchanged to re-run with the same arguments, or edit it to try different ones. Each re-run is appended as a new iteration you can page through.

### Live runs

Runs with status `running` or `queued` stream live updates via SSE. A Cancel button appears for live runs.

---

## Run Workflow Node

Trigger another workflow from within a workflow — synchronously or asynchronously.

**Type:** `run-workflow` | **Category:** Control | **Backend only**

### Sync vs async mode

| Mode | Behaviour | Output |
|---|---|---|
| **sync** | Waits for the child workflow to complete. | Full child node results map. |
| **async** | Fires the child workflow and returns immediately. | `{ runId: string, mode: "async" }` |

### Passing variables to the child

```json
{
  "userId":  "{{variables.userId}}",
  "payload": "{{outputs['fetchNode'].body}}"
}
```

### Accessing child results (sync mode)

```js
// Run Workflow node id = "runNode", child node id = "summarise"
outputs["runNode"]["summarise"].output.text
```

### Depth guard

Maximum nesting depth is **5** (tracked via `__workflowDepth__` in variables). Calls that exceed this fail immediately.

> **Sync mode holds a worker thread.** For fire-and-forget use cases, prefer async mode.

---

## WhatsApp Bridge

Trigger workflows from WhatsApp messages using slash commands.

### Architecture

```
WhatsApp message "/voicelog great meeting today"
  → whatsapp-bridge
  → POST /webhooks/voicelog  { sender, pn, content, command, args, media, ... }
  → fires the workflow linked to the "voicelog" webhook trigger
  → Send WhatsApp node replies to trigger.sender
```

### Setup

1. Run `docker compose up`. Watch bridge logs for a QR code on first run.
2. Open WhatsApp → Settings → Linked Devices → Link a Device → scan the QR code.
3. In Triggers, create a **Webhook** trigger. Set path to the command name (e.g. `voicelog` for `/voicelog`).
4. Build the workflow. Use `{{trigger.sender}}` as the `to` field in Send WhatsApp to reply.
5. Send a test command from WhatsApp.

### Trigger variables

| Variable | Type | Description |
|---|---|---|
| `trigger.sender` | string | Full WhatsApp JID — pass to Send WhatsApp to reply. |
| `trigger.pn` | string | Phone number without the `@s.whatsapp.net` suffix. |
| `trigger.content` | string | Full message text including the command. |
| `trigger.command` | string | Command name without the slash. |
| `trigger.args` | string | Everything after the command name. |
| `trigger.media` | string[] | Paths to downloaded media attachments in the `wa_media` volume. |
| `trigger.isAudio` | boolean | `true` when the message contains a voice note. |
| `trigger.timestamp` | number | Unix timestamp (seconds) of the original message. |

### Security

- **ALLOW_FROM** — comma-separated phone numbers permitted to trigger workflows. Unset = allow all.
- **WEBHOOK_SECRET** — if set, the bridge signs every forwarded request with HMAC-SHA256.

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `AUTH_DIR` | `/app/auth` | Where Baileys stores session credentials. |
| `SEND_PORT` | `3002` | Port the bridge send API listens on. |
| `WORKFLOW_ENGINE_URL` | `http://app:3001` | Base URL of the workflow engine backend. |
| `WEBHOOK_SECRET` | — | Shared HMAC secret. Must match the webhook trigger config. |
| `ALLOW_FROM` | — | Comma-separated phone number whitelist. |
| `WHATSAPP_BRIDGE_URL` | `http://whatsapp-bridge:3002` | Set in the `app` service for Send WhatsApp node. |

### Re-pairing the device

```sh
docker compose down
docker volume rm workflow_wa_auth
docker compose up whatsapp-bridge
```

---

## Plugin Modules

A convention for adding custom nodes and sidecar services as self-contained drop-in modules.

### Directory layout

```
backend/src/plugins/
  index.ts                  ← barrel: imports plugins, exports getPluginServices()
  types.ts                  ← shared PluginManifest type
  <name>/
    index.ts                ← registers backend node(s), exports manifest

frontend/src/plugins/
  <name>/
    index.ts                ← registers frontend node(s)
```

### The plugin manifest

```ts
export const manifest: PluginManifest = {
  service: {
    displayName: 'Voice to Text',
    envVar:      'VOICE_TO_TEXT_URL',
    defaultUrl:  'http://voice-to-text:9000',
    healthPath:  '/health',
  },
};
```

### How nodes are registered

| Layer | Mechanism |
|---|---|
| Backend | Explicit import in `backend/src/plugins/index.ts` |
| Frontend | Vite glob: `import.meta.glob('./plugins/*/index.ts', { eager: true })` — adding a folder is enough |

### Adding a new plugin — step by step

**1. Create the backend node** (`backend/src/plugins/<name>/<node>Node.ts`)

```ts
import { registerNode } from '../../engine/nodeRegistry';

const execute = async (node, context) => {
  const startedAt = Date.now();
  try {
    // ... your logic ...
    return { nodeId: node.id, status: 'success', output: result, startedAt, finishedAt: Date.now() };
  } catch (err) {
    return { nodeId: node.id, status: 'error', output: null,
      error: err instanceof Error ? err.message : String(err), startedAt, finishedAt: Date.now() };
  }
};

registerNode({ type: 'my-node', label: 'My Node', execute });
```

**2. Create the backend plugin index** (`backend/src/plugins/<name>/index.ts`)

```ts
import './myNode';
import type { PluginManifest } from '../types';

export const manifest: PluginManifest = {
  service: { displayName: 'My Service', envVar: 'MY_SERVICE_URL', defaultUrl: 'http://my-service:8080', healthPath: '/health' },
};
```

**3. Register in the barrel** (`backend/src/plugins/index.ts`)

Add import and include the manifest in the manifests array.

**4. Create the frontend node** (`frontend/src/plugins/<name>/index.ts`)

```ts
import { registerNode } from '../../engine/nodeRegistry';
registerNode({
  type: 'my-node', label: 'My Node', description: '...', category: 'Integration',
  configSchema: z.object({ inputField: z.string().min(1) }),
  defaultConfig: { inputField: '' },
  execute: () => { throw new Error('my-node executes on the backend only.'); },
});
```

**5. Add the service to Docker Compose**

```yaml
my-service:
  image: my-service-image:latest
  ports:
    - "8080:8080"
  restart: unless-stopped
```

### Built-in plugins

| Plugin | Node | Env var |
|---|---|---|
| Voice to Text | Transcribe Audio | `VOICE_TO_TEXT_URL` (default `http://voice-to-text:9000`) |
| Ollama | Ollama Completion, Ollama Vision | `OLLAMA_URL` (default `http://host.docker.internal:11434`) |
| AI LLM | AI Completion | `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `PERPLEXITY_API_KEY` (via Secrets) |

---

## AI Completion

Send prompts to OpenAI, Anthropic Claude, or Perplexity from any workflow.

### Supported providers

| Provider | Secret key | Default model |
|---|---|---|
| OpenAI | `OPENAI_API_KEY` | `gpt-4o-mini` |
| Anthropic | `ANTHROPIC_API_KEY` | `claude-sonnet-4-6` |
| Perplexity | `PERPLEXITY_API_KEY` | `llama-3.1-sonar-small-128k-online` |

### Setup

1. Open **Admin → Secrets** (or the Secrets space) and add the API key for your chosen provider.
2. Add an **AI Completion** node to your workflow.
3. Select provider, model, write a system instruction (optional) and prompt.

### Configuration fields

| Field | Description |
|---|---|
| `provider` | `openai`, `anthropic`, or `perplexity`. |
| `model` | Model ID. |
| `system` | Optional system instruction. Supports `{{}}` interpolation. |
| `prompt` | User prompt. Supports `{{}}` interpolation. |
| `temperature` | 0–2. 0 = deterministic. Default 0.7. |
| `maxTokens` | 0 = provider default. |

### Output shape

```json
{
  "text":     "generated text",
  "model":    "model-id",
  "provider": "openai",
  "usage": { "inputTokens": 120, "outputTokens": 85 }
}
```

### Local LLMs with Ollama

Use the **Ollama Completion** node (`ollama-completion`) for on-premise inference with no external API calls. Requires a running Ollama instance. For image analysis, use **Ollama Vision** (`ollama-vision`) with a vision-capable model such as `llava`.

---

## Admin & Backup

Export a full system backup, restore from a backup file, and monitor system health.

### API authentication

Set `API_TOKEN` in the server environment to require a shared token on every API request (`Authorization: Bearer <token>`; SSE streams append `?token=…`). On first load the UI asks for the token and remembers it in the browser. Webhooks (protected by their own HMAC secrets), `/health`, the AI capability reference (`/api/ai/*`), and served media files (`/files/`, `/media/`) stay open by design. Cross-origin requests are refused unless `CORS_ORIGIN` lists the allowed origins.

> **Without API_TOKEN the API is open.** Anyone who can reach the port can read workflows, run them, and export decrypted secrets. Always set it outside trusted networks.

### Export backup

Select which datasets to include:

| Dataset | What it includes |
|---|---|
| Workflows | All workflow definitions. |
| Scripts | All saved scripts. |
| Triggers | All trigger configurations. |
| Job runs | Full run history with results and logs. |
| Secrets | All secrets — **stored as plaintext** in the backup file. |

Click **Download backup**. The file is named `workflow-backup-YYYY-MM-DD-HH-MM-SS.json`.

> **Warning:** Secrets are stored as plaintext. Store backup files securely and never commit them to version control.

### Import / restore

1. Click **Choose backup file…** and select a `.json` backup.
2. The UI shows which datasets are available with item counts.
3. Select the datasets to restore and click **Import selected**.

| Dataset | Import behaviour |
|---|---|
| Workflows / Scripts / Triggers | Upsert by ID — existing records with the same ID are overwritten. |
| Job runs | Insert-only (`INSERT OR IGNORE`) — existing records are never modified. |
| Secrets | Overwrite by name. |

### Backup file format

```json
{
  "version":    1,
  "exportedAt": "2026-05-11T10:00:00.000Z",
  "data": {
    "workflows": [...],
    "scripts":   [...],
    "triggers":  [...],
    "runs":      [...],
    "secrets":   [{ "name": "MY_KEY", "value": "plaintext!" }]
  }
}
```

---

## Node Reference

### Logic Nodes

#### Condition
**Type:** `condition`

Evaluates a JavaScript expression and routes execution to either the `true` or `false` output handle. Access upstream results with `outputs["nodeId"]`, workflow variables with `variables.name`.

**Output:** `{ result: boolean }`

#### Fork
**Type:** `fork`

Functionally identical to Condition but rendered as a diamond shape on the canvas. Use Fork to make branching logic visually prominent.

**Output:** `{ result: boolean }`

#### Switch
**Type:** `switch`

Evaluates an expression to a string value and routes to the matching case handle. Up to 4 named cases plus a `default` handle. Cases are compared with strict string equality.

**Output:** `{ matched: string }`

#### Script
**Type:** `script`

Executes a named script defined in the Scripts space. Scripts receive an `input` object (from input bindings) and a `context` object (`{ outputs, variables, log }`). The return value becomes this node's output.

**Output:** whatever value the script returns

**Tips:**
- Define input bindings to map node outputs or variables into named script inputs.
- Scripts time out after the configured duration (default 300 s).

#### Loop
**Type:** `loop`

Repeats a sub-graph while a boolean condition expression remains true. The `loop` handle fires the body each iteration; the main output fires when the condition becomes false. maxIterations: default 100, max 10,000.

**Output:** `{ iteration: number }`

---

### Control Nodes

#### Run Workflow
**Type:** `run-workflow` | **Backend only**

Triggers another workflow synchronously (waits for completion) or asynchronously (fire-and-forget). Depth guard: MAX_DEPTH = 5.

**Output (sync):** `Record<nodeId, NodeExecutionResult>` | **Output (async):** `{ runId: string, mode: "async" }`

#### Delay
**Type:** `delay`

Pauses workflow execution for a fixed number of milliseconds (max 300,000 ms / 5 minutes).

**Output:** `{ delayMs: number }`

#### Set Variable
**Type:** `set-variable`

Creates or updates a named workflow variable. Variables are visible to all downstream nodes.

**Output:** `{ name: string, value: unknown }`

#### Log
**Type:** `log`

Emits a message to the execution log at `info`, `warn`, or `error` level. Pass-through — does not modify the data flowing through the workflow.

**Output:** passes input through unchanged

#### Label
**Type:** `label`

A purely decorative annotation node. No handles, no execution effect. Use for section headings or comments on the canvas.

#### Junction
**Type:** `junction`

An invisible routing waypoint (18 × 18 px dot). Junctions allow structured edge paths without adding logic. Snaps to the 8 px sub-grid.

---

### Data Nodes

#### Transform
**Type:** `transform`

Executes arbitrary JavaScript to produce a new value. Write the function body — the last expression or `return` statement becomes the output. Context: `outputs`, `variables`, `log`.

**Output:** whatever the transform body returns

#### Filter
**Type:** `filter`

Filters an array using a predicate expression. Predicate scope: `item`, `index`, `array`, `outputs`, `variables`.

**Output:** `{ result: unknown[], count: number }`

#### Sort
**Type:** `sort`

Sorts an array of objects by a specified field. Supports ascending/descending order. Returns a new sorted copy.

**Output:** `{ result: unknown[], count: number }`

#### Aggregate
**Type:** `aggregate`

Reduces an array to a single value. Operations: `count`, `sum`, `avg`, `min`, `max`, `first`, `last`, `join`.

**Output:** `{ result: unknown, operation: string, count: number }`

#### Render Template
**Type:** `render-template`

Interpolates a template string using `{{expression}}` placeholders. Use to assemble URLs, email bodies, Slack messages, or any dynamic string.

**Output:** `{ text: string }`

#### Math
**Type:** `math`

Evaluates a mathematical expression. Environment: `Math`, `Number`, `parseInt`, `parseFloat`, `outputs`, `variables`.

**Output:** `{ result: number }`

#### Datetime
**Type:** `datetime`

Returns the current date and/or time, optionally offset by a number of minutes. Modes: `date`, `time`, `datetime`.

**Output:** `{ value: string, iso: string, timestamp: number }`

---

### Data Store Nodes

#### DataStore Query
**Type:** `datastore-query` | **Backend only**

Queries rows from a Data Store table. Optional equality filter and row limit (max 1000).

**Output:** `{ rows: object[], count: number }`

**Tips:**
- Leave filter empty to return all rows up to the limit.
- Use an expression in the filter field: `{"userId": "{{variables.userId}}"}`.

#### DataStore Upsert
**Type:** `datastore-upsert` | **Backend only**

Inserts or updates a row in a Data Store table. Key columns (marked with 🔑) enable upsert matching.

**Output:** `{ action: "inserted" | "updated", row: object }`

**Tips:**
- Without a key column, every call inserts a new row — useful for append-only logs.
- Column names in the data object must match the table schema exactly.

---

### File Nodes

#### Parse CSV
**Type:** `parse-csv`

Parses a CSV string into an array of row objects. The first row is treated as a header row.

**Output:** `{ rows: object[], count: number }`

#### Format CSV
**Type:** `format-csv`

Converts an array of objects to a CSV string. Header row is derived from the keys of the first element.

**Output:** `{ csv: string, count: number }`

#### Read File
**Type:** `read-file`

Fetches a resource from a URL. Format: `text`, `json`, or `base64`.

**Output:** `{ content: string | object, url: string }`

#### Write File
**Type:** `write-file`

Triggers a browser file download by creating a Blob from the provided content string.

**Output:** `{ filename: string }`

---

### Integration Nodes

#### HTTP Request
**Type:** `http` | **Backend only**

Sends an HTTP request (GET, POST, PUT, DELETE, PATCH). Headers: JSON object. Body: raw string.

**Output:** `{ status: number, data: unknown, url: string }`

#### GraphQL
**Type:** `graphql` | **Backend only**

Executes a GraphQL query or mutation. Variables as JSON object, headers support expression placeholders.

**Output:** `{ data: object, errors?: object[] }`

#### Ping
**Type:** `ping` | **Backend only**

Sends an ICMP echo request and reports whether the host responded and the round-trip time.

**Output:** `{ host: string, alive: boolean, time: number | null }`

---

### Notification Nodes

#### Send Email
**Type:** `send-email`

Posts an email payload to a configured HTTP endpoint (SendGrid, Mailgun, Postmark, or a custom relay).

**Output:** `{ status: number, response: unknown }`

#### Send Slack
**Type:** `send-slack`

Posts a message to a Slack channel via an Incoming Webhook URL. Supports Slack mrkdwn formatting.

**Output:** `{ status: number }`

#### Send Teams
**Type:** `send-teams`

Posts a MessageCard to a Microsoft Teams channel via an Incoming Webhook URL.

**Output:** `{ status: number }`

#### Send WhatsApp
**Type:** `send-whatsapp` | **Backend only**

Sends a WhatsApp message via the local WhatsApp Bridge service. Default `to` field: `{{trigger.sender}}`.

**Output:** `{ to: string, text: string }`

---

### AI Nodes

#### AI Completion
**Type:** `ai-completion` | **Backend only**

Sends a prompt to OpenAI, Anthropic Claude, or Perplexity. API credentials from Secrets store. Supports `{{}}` interpolation in system and prompt fields.

**Output:** `{ text: string, model: string, provider: string, usage: { inputTokens: number, outputTokens: number } }`

**Secrets required:** `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or `PERPLEXITY_API_KEY`

#### Ollama Completion
**Type:** `ollama-completion` | **Backend only**

Sends a prompt to a locally-running Ollama model. No API keys required.

**Output:** `{ text: string, model: string }`

**Env var:** `OLLAMA_URL` (default: `http://host.docker.internal:11434`)

#### Ollama Vision
**Type:** `ollama-vision` | **Backend only**

Sends an image and a text prompt to a vision-capable Ollama model (e.g. `llava`, `moondream`). The image can be a file path or base64-encoded string.

**Output:** `{ text: string, model: string }`

**Tips:**
- Use `trigger.media[0]` as the image field to process photos from WhatsApp messages.
- The model must support vision — pull e.g. `llava:7b`.

#### Transcribe Audio
**Type:** `transcribe-audio` | **Backend only**

Sends an audio URL to the Voice to Text sidecar service and returns the transcript. Default `audioUrl`: `{{trigger.media[0].url}}`.

**Output:** `{ text: string }`

**Env var:** `VOICE_TO_TEXT_URL` (default: `http://voice-to-text:9000`)

---

## Keyboard Shortcuts

### Canvas shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+S` | Save the current workflow |
| `Ctrl+Z` | Undo last canvas change |
| `Ctrl+R` | Redo |
| `Ctrl+C` | Copy selected nodes (and their internal edges) |
| `Ctrl+X` | Cut selected nodes |
| `Ctrl+V` | Paste copied/cut nodes |
| `Delete` / `Backspace` | Delete selected nodes or edges |
| `Escape` | Deselect all / close modal |
| `Ctrl+A` | Select all nodes |
| Right-drag | Rectangle-select multiple nodes |
| Scroll | Zoom in/out on the canvas |
| Middle-drag | Pan the canvas |
| `Space` + drag | Pan the canvas (alternative) |

### Monaco editor shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+Space` | Trigger autocomplete |
| `Ctrl+/` | Toggle line comment |
| `Alt+↑/↓` | Move line up/down |
| `Ctrl+D` | Duplicate line |
| `Shift+Alt+F` | Format document |
