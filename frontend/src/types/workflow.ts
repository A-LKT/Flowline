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
  layoutDirection: LayoutDirection;
  onErrorWorkflowId?: string;
  /** Soft-deleted: kept only so its run history stays reviewable. Cannot be run or edited. */
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

export type LayoutDirection = 'TB' | 'LR';

export type RunStatus = 'queued' | 'running' | 'success' | 'error' | 'cancelled';

export type RunTriggerType = 'manual' | 'schedule' | 'webhook';

export type Run = {
  id: string;
  workflowId: string;
  status: RunStatus;
  triggerType: RunTriggerType;
  results: Record<string, NodeExecutionResult> | null;
  logs: string[] | null;
  workflowVersion: number | null;
  startedAt: number | null;
  finishedAt: number | null;
  createdAt: number;
};
