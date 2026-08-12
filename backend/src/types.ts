// Core domain types — mirrors the frontend types/workflow.ts + types/script.ts

export type NodeId = string;

export type Workflow = {
  id: string;
  name: string;
  description: string;
  version: number;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  variables: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
  layoutDirection: 'TB' | 'LR';
  onErrorWorkflowId?: string;
  // Soft-delete marker. A workflow that has run history is deprecated instead of
  // hard-deleted (its runs would cascade away), so past runs stay reviewable.
  // Deprecated workflows cannot be run or edited.
  deprecated?: boolean;
};

export type WorkflowNode = {
  id: NodeId;
  type: string;
  name?: string;
  description?: string;
  timeoutSecs?: number;
  enabled?: boolean;
  config: Record<string, unknown>;
  position: { x: number; y: number };
};

export type WorkflowEdge = {
  id: string;
  from: NodeId;
  to: NodeId;
  condition?: string;
  fromHandle?: string;
};

export type ExecutionStatus = 'idle' | 'running' | 'success' | 'error';

export type NodeExecutionResult = {
  nodeId: NodeId;
  status: ExecutionStatus;
  input?: unknown;
  resolvedConfig?: Record<string, unknown>;
  output: unknown;
  error?: string;
  startedAt: number;
  finishedAt: number;
  iterations?: Omit<NodeExecutionResult, 'iterations'>[];
};

export type ExecutionContext = {
  runId: string;
  results: Record<NodeId, NodeExecutionResult>;
  variables: Record<string, unknown>;
  scripts: Script[];
  secrets: Record<string, string>;
  log: (msg: string) => void;
  input?: unknown;
};

export type ScriptInputType = 'string' | 'number' | 'boolean';

export type ScriptInput = {
  name: string;
  description?: string;
  type?: ScriptInputType;
};

export type InputBinding =
  | { kind: 'node'; nodeId: string }
  | { kind: 'primitive'; value: string | number | boolean }
  | { kind: 'variable'; varName: string };

export type Script = {
  id: string;
  name: string;
  description?: string;
  code: string;
  timeout: number;
  inputs?: ScriptInput[];
  sandbox?: boolean;
  dockerImage?: string;
  npmInstall?: string;
  createdAt: number;
  updatedAt: number;
};

export type RunStatus = 'queued' | 'running' | 'success' | 'error' | 'cancelled';

export type RunTriggerType = 'manual' | 'schedule' | 'schedule-catchup' | 'webhook' | 'file-watch' | 'email';

/**
 * One line of a run's domain log. `ts` is the wall-clock time the line was
 * emitted (stamped in the worker at `onLog`). `ts` is null only for legacy runs
 * persisted before timestamps existed — see rowToRun's back-compat normaliser.
 */
export type RunLogEntry = { ts: number | null; text: string };

export type Run = {
  id: string;
  workflowId: string;
  status: RunStatus;
  triggerType: RunTriggerType;
  triggerId: string | null;
  results: Record<string, NodeExecutionResult> | null;
  logs: RunLogEntry[] | null;
  startedAt: number | null;
  finishedAt: number | null;
  createdAt: number;
  workflowVersion: number | null;
  /** Content hash into workflow_snapshots — the exact graph this run executed. */
  workflowSnapshotHash: string | null;
};

// ─── Triggers ────────────────────────────────────────────────────────────────

// Built-in kinds. Plugin-registered adapters may use any string kind.
export type TriggerKind = 'schedule' | 'webhook' | 'file-watch' | 'email';

export type TriggerTarget = {
  type: 'workflow';
  id: string;
};

export type ScheduleConfig = {
  cron: string;
  timezone?: string;
  catchup?: boolean; // default true — set false to disable missed-run catch-up for this trigger
};

export type WebhookConfig = {
  path: string;
  secret?: string;
  filter?: string;
};

export type FileWatchConfig = {
  watchPath: string;             // directory to watch
  pattern?: string;              // glob pattern relative to watchPath, e.g. "*.csv"
  events: ('add' | 'change' | 'unlink')[];
  debounceMs?: number;           // coalesce rapid events (default 500ms)
};

// Password / sensitive fields may reference a secret by name using $SECRET_NAME syntax.
export type EmailConfig = {
  host: string;
  port: number;
  tls: boolean;
  user: string;
  password: string;      // literal or $SECRET_NAME
  folder?: string;       // default "INBOX"
  markSeen?: boolean;    // default true
  fromFilter?: string;   // substring match on sender address
  subjectFilter?: string;
};

export type Trigger = {
  id: string;
  name: string;
  description?: string;
  kind: string;          // TriggerKind for built-ins; arbitrary string for plugin adapters
  target: TriggerTarget;
  enabled: boolean;
  config: ScheduleConfig | WebhookConfig | FileWatchConfig | EmailConfig | Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
};

// Worker thread message protocol

export type WorkerInbound =
  | { type: 'run'; runId: string; workflow: Workflow; scripts: Script[]; secrets: Record<string, string>; initialVariables?: Record<string, unknown> }
  | { type: 'cancel'; runId: string };

export type WorkerEvent =
  | { type: 'ready' }
  | { type: 'node:start'; runId: string; nodeId: string; nodeName: string; resolvedConfig: Record<string, unknown>; startedAt: number }
  | { type: 'node:complete'; runId: string; nodeId: string; nodeName: string; status: 'success' | 'error'; input: unknown; output: unknown; error?: string; startedAt: number; finishedAt: number }
  | { type: 'log'; runId: string; ts: number; message: string }
  | { type: 'done'; runId: string; status: 'success' | 'error' | 'cancelled'; results: Record<string, NodeExecutionResult>; logs: RunLogEntry[] }
  | { type: 'error'; runId: string; error: string };
