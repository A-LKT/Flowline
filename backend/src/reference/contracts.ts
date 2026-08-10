/**
 * Structural contracts for authoring a workflow file. These describe the parts
 * of the system that are NOT per-node: the workflow JSON envelope, how edges
 * route execution, the expression language, scripts, and concurrency. They are
 * authored here (mirroring ../types.ts and the executor) because they are
 * structural and change rarely; the per-node and per-trigger capabilities are
 * generated from live registries elsewhere.
 */
import { z } from 'zod';

// ─── Workflow JSON envelope (what the AI must emit as a file) ─────────────────

export const workflowNodeSchema = z.object({
  id: z.string().describe('Unique within the workflow. Any stable string; referenced by edges and in outputs["id"].'),
  type: z.string().describe('A node type from nodeTypes[].type.'),
  name: z.string().optional().describe('Human label shown on canvas. Also the key used when this node feeds a multi-input node.'),
  description: z.string().optional(),
  enabled: z.boolean().optional().describe('false = node is skipped, input passes through unchanged. Default true.'),
  timeoutSecs: z.number().optional().describe('Per-node timeout. Default 300.'),
  config: z.record(z.unknown()).describe('Type-specific config — must satisfy that node type\'s configSchema. String fields support {{expressions}}.'),
  position: z.object({ x: z.number(), y: z.number() }).describe('Canvas coordinates. Use a tidy layout; the user can Auto-Layout later.'),
});

export const workflowEdgeSchema = z.object({
  id: z.string(),
  from: z.string().describe('Source node id.'),
  to: z.string().describe('Target node id.'),
  fromHandle: z.string().optional().describe('Source output handle. Required to pick a branch on branch nodes, and to mark loop back-edges ("loop"/"iterator"). Omit for a node\'s single default output.'),
  condition: z.string().optional().describe('Optional JS expression; if it evaluates falsy at runtime the edge is not followed.'),
});

export const workflowSchema = z.object({
  id: z.string().describe('Assigned a fresh value on Import — any placeholder is fine in the file you produce.'),
  name: z.string(),
  description: z.string().default(''),
  version: z.number().default(1),
  nodes: z.array(workflowNodeSchema),
  edges: z.array(workflowEdgeSchema),
  variables: z.record(z.unknown()).default({}).describe('Initial workflow variables, readable as variables.name.'),
  layoutDirection: z.enum(['TB', 'LR']).default('TB'),
  onErrorWorkflowId: z.string().optional().describe('Another workflow to fire if any node errors. Cannot be itself.'),
});

// ─── Control flow & routing (from the executor) ───────────────────────────────

export const CONTROL_FLOW = {
  entrypoints:
    'Any node with no incoming forward edges is a root. All roots fire simultaneously at run start.',
  executionOrder:
    'Topological. A node with multiple incoming edges waits until all its predecessors complete. Independent branches run concurrently (Promise.all).',
  multiInput:
    'With one incoming edge, a node receives the upstream node\'s output as its input. With multiple incoming edges, it receives an object keyed by each upstream node\'s name (or id).',
  branchRouting:
    'Branch nodes (condition, fork, switch) put the chosen handle id in output.branch. A forward edge with a fromHandle is followed ONLY if its fromHandle equals output.branch. Edges without a fromHandle are always followed. For non-branch nodes, fromHandle is ignored and all forward edges fire.',
  handles:
    'condition/fork: "true"/"false". switch: "1"/"2"/"3"/"4"/"default". loop body: "loop", exit: "done". iterator body: "iterator", exit: "done".',
  loops:
    'A loop/iterator is formed by a back-edge: an edge whose fromHandle is "loop" or "iterator", going from the loop node back to the first node of the loop body. While the loop/iterator output.continue is true, the body runs and the loop re-evaluates; when false (or maxIterations reached) the forward "done" edge fires. loop maxIterations defaults to 100.',
  edgeCondition:
    'Any edge may carry a `condition` JS expression; if it evaluates falsy at runtime, that edge is skipped.',
  errorHandling:
    'If a node errors and the workflow has onErrorWorkflowId set, that workflow is fired asynchronously; the current run stops at the failed node.',
  concurrency:
    'CRITICAL for rate control: each run executes in one worker thread from a fixed pool (size = WORKER_COUNT, default max(2, min(cpuCount, 8))). Triggers do NOT serialize — N events arriving close together start up to poolSize runs in PARALLEL, with the rest queued. There is no built-in "one run at a time per workflow" guarantee. To process items at a steady, non-parallel rate use the enqueue + locked-drainer pattern (see queueing).',
  queueing:
    'Pattern for "do not spawn parallel workflows; process at a steady rate": (1) INTAKE — a lightweight workflow on the event trigger (e.g. WhatsApp webhook) records each item and returns fast, doing no heavy work. (2) DRAINER — a separate schedule-triggered workflow processes the backlog one item at a time. ' +
    'FILESYSTEM QUEUE (preferred when payloads are files): INTAKE uses write-file to drop one job file into a "queue/" subdirectory (e.g. queue/{{trigger.timestamp}}.json holding the receipt media path). DRAINER uses list-files (dir "queue", oldest first) to find the next job, then move-file to atomically claim it into a per-run "processing/" path — move-file returns moved:false if another run already took it, giving lock-free mutual exclusion, so even overlapping ticks never double-process. The drainer then read-local-file the claimed job, does the work, and delete-file to remove it. No Data Store lock table needed; the atomic move IS the lock. ' +
    'DATA STORE QUEUE (alternative): store rows with a status column (pending/done) via datastore-upsert / datastore-query, serialized with a Data Store "lock" row checked at the top of each tick. ' +
    'Either way, run the drainer on a modest cron and process one item per tick for steady, effectively serial throughput regardless of intake burst rate.',
} as const;

// ─── Expression language ──────────────────────────────────────────────────────

export const EXPRESSIONS = {
  interpolation:
    'Every string field in a node config supports {{ expression }} interpolation, resolved at run time. Example URL: "https://api.example.com/{{variables.id}}".',
  scope: {
    outputs: 'outputs["nodeId"] → that node\'s full output object. Nested access: outputs["n1"].data.items[0].',
    variables: 'variables.name → the workflow variable store. Trigger payload is at variables.trigger (alias {{trigger.field}}).',
    log: 'log(msg) → write to the run log (available in Script and Transform code).',
  },
  contexts: [
    { context: 'condition / fork / loop / iterator / filter predicate', syntax: 'JS expression', example: 'outputs["n1"].count > 0' },
    { context: 'switch expression', syntax: 'JS expression → string', example: 'outputs["n1"].status' },
    { context: 'transform / math code', syntax: 'JS function body (use return)', example: 'return outputs["n1"].items.length * 2' },
    { context: 'render-template / URL / any string field', syntax: '{{ }} interpolation', example: 'Hello {{variables.name}}' },
  ],
  note: 'An expression can only reference outputs of nodes that have already executed upstream of it.',
} as const;

// ─── Scripts (authored as a separate resource) ────────────────────────────────

export const SCRIPTS = {
  description:
    'Reusable JS functions stored in the Scripts space and called by name from a Script node. The AI emits a script as a file (code + metadata); the human pastes it into the Scripts space.',
  signature:
    'A script body runs as an async function with two args: input (resolved from the Script node\'s input bindings, or the variable store if no inputs declared) and context ({ outputs, variables, log }). Its return value becomes the Script node output.',
  metadata: {
    name: 'string — referenced by the Script node\'s scriptName.',
    inputs: 'optional [{ name, type? }] — declared inputs, bound per Script node.',
    timeout: 'seconds (default 300).',
    sandbox: 'boolean — if true, runs in Docker (dockerImage, npmInstall), can use fs/require and write files to its output dir; emitted files are captured and served under /files/. If false, runs in-process with only input/context in scope (no fs/require).',
  },
  note: 'Non-sandbox scripts cannot access the filesystem. For filesystem work (listing a queue directory, moving files) use a sandbox script or the write-file node.',
} as const;

export const OVERVIEW =
  'This reference describes everything needed to author a workflow as a JSON file for this engine. ' +
  'Produce a workflow object matching workflowFormat.workflow, using node types from nodeTypes and wiring per controlFlow. ' +
  'The user imports the file via the Workflows → Import button (a fresh id is assigned). ' +
  'You (the AI) never create resources directly; for triggers and Data Store tables, output step-by-step instructions for the human using triggerKinds / the data-store node contracts.';
