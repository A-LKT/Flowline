import { create } from 'zustand';
import type {
  LayoutDirection,
  NodeExecutionResult,
  Workflow,
  WorkflowEdge,
  WorkflowNode,
} from '../types/workflow';
import { computeLayout } from '../engine/autoLayout';

const HISTORY_LIMIT = 50;

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

const api = {
  list: (): Promise<Workflow[]> =>
    fetch('/workflows').then((r) => r.json() as Promise<Workflow[]>),

  save: (wf: Workflow): Promise<void> =>
    fetch('/workflows', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(wf) }).then((r) => {
      if (!r.ok) throw new Error(`Save failed: HTTP ${r.status}`);
    }),

  remove: (id: string, purge = false): Promise<{ deprecated: boolean }> =>
    fetch(`/workflows/${id}${purge ? '?purge=1' : ''}`, { method: 'DELETE' }).then(async (r) => {
      if (!r.ok) throw new Error(`Delete failed: HTTP ${r.status}`);
      return await r.json() as { deprecated: boolean };
    }),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const pushHistory = (past: Workflow[], current: Workflow): Workflow[] =>
  [...past, current].slice(-HISTORY_LIMIT);

const makeWorkflow = (name = 'Untitled Workflow'): Workflow => ({
  id: crypto.randomUUID(),
  name,
  description: '',
  version: 1,
  nodes: [],
  edges: [],
  variables: {},
  createdAt: Date.now(),
  updatedAt: Date.now(),
  layoutDirection: 'TB',
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LogEntry = { text: string; kind: 'node' | 'log' | 'system'; ts: number | null };

type ExecutionState = {
  running: boolean;
  results: Record<string, NodeExecutionResult>;
  activeNodeIds: string[];
  logs: LogEntry[];
};

type WorkflowStore = {
  workflows: Workflow[];
  activeWorkflowId: string | null;
  past: Workflow[];
  future: Workflow[];
  execution: ExecutionState;
  focusedNodeId: string | null;
  isDirty: boolean;
  isLoading: boolean;
  backendOffline: boolean;

  // Collection
  loadWorkflows: () => Promise<void>;
  createWorkflow: (name?: string) => string;
  deleteWorkflow: (id: string, purge?: boolean) => Promise<void>;
  cloneWorkflow: (id: string) => void;
  importWorkflow: (wf: Workflow) => Promise<void>;
  updateWorkflowMeta: (id: string, patch: Partial<Pick<Workflow, 'name' | 'description' | 'onErrorWorkflowId'>>) => void;
  restoreWorkflow: (id: string, data: Workflow) => Promise<void>;
  setActiveWorkflow: (id: string | null) => void;
  saveWorkflows: () => Promise<void>;
  discardChanges: () => void;

  // Editor settings
  setLayoutDirection: (v: LayoutDirection) => void;
  applyAutoLayout: () => void;

  // Active workflow mutations
  addNode: (node: WorkflowNode) => void;
  addNodes: (nodes: WorkflowNode[], edges: WorkflowEdge[]) => void;
  updateNode: (id: string, patch: Partial<WorkflowNode>) => void;
  updateNodeSilent: (id: string, patch: Partial<WorkflowNode>) => void;
  snapshotHistory: () => void;
  moveNodeSilent: (id: string, position: { x: number; y: number }) => void;
  removeNode: (id: string) => void;
  addEdge: (edge: WorkflowEdge) => void;
  removeEdge: (id: string) => void;
  undo: () => void;
  redo: () => void;

  // Execution
  setExecution: (state: Partial<ExecutionState>) => void;
  addActiveNode: (id: string) => void;
  removeActiveNode: (id: string) => void;
  setNodeResult: (result: NodeExecutionResult) => void;
  addLog: (msg: string, kind?: LogEntry['kind'], ts?: number | null) => void;
  resetExecution: () => void;
  focusNode: (id: string | null) => void;

  // Currently-replaying run (null when not viewing a past job)
  replayRunId: string | null;
  setReplayRunId: (id: string | null) => void;

  // The workflow graph as it existed when the reviewed run fired, fetched from
  // /runs/:id/workflow-snapshot. When set, the review canvas renders THIS instead
  // of the live (possibly since-edited) workflow. Null when reviewing a run that
  // predates snapshotting, or when not reviewing.
  reviewSnapshot: Workflow | null;
  setReviewSnapshot: (wf: Workflow | null) => void;
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

const EMPTY_EXECUTION: ExecutionState = {
  running:      false,
  results:      {},
  activeNodeIds: [],
  logs: [],
};

export const useWorkflowStore = create<WorkflowStore>((set, get) => {
  const mutateActive = (fn: (wf: Workflow) => Workflow) => {
    const { activeWorkflowId, workflows, past } = get();
    if (!activeWorkflowId) return;
    const idx = workflows.findIndex((w) => w.id === activeWorkflowId);
    if (idx < 0) return;
    const current = workflows[idx];
    const updated = { ...fn(current), updatedAt: Date.now() };
    set({
      past: pushHistory(past, current),
      future: [],
      isDirty: true,
      workflows: workflows.map((w, i) => (i === idx ? updated : w)),
    });
  };

  return {
    workflows: [],
    activeWorkflowId: null,
    past: [],
    future: [],
    execution: { ...EMPTY_EXECUTION },
    focusedNodeId: null,
    isDirty: false,
    isLoading: false,
    backendOffline: false,
    replayRunId: null,
    reviewSnapshot: null,

    // --- Collection ---

    loadWorkflows: async () => {
      set({ isLoading: true });
      try {
        const workflows = await api.list();
        set({ workflows, isLoading: false, backendOffline: false });
      } catch {
        set({ isLoading: false, backendOffline: true });
      }
    },

    createWorkflow: (name) => {
      const wf = makeWorkflow(name);
      // Saved immediately below — a fresh workflow starts clean, not dirty.
      set((s) => ({ workflows: [...s.workflows, wf] }));
      void api.save(wf).catch(() => set({ backendOffline: true }));
      return wf.id;
    },

    // Delete a workflow. The backend soft-deletes (deprecates) a workflow that has
    // run history so its runs stay reviewable; pass purge=true to force a permanent
    // delete (cascading its runs). Reflect whichever outcome the backend reports.
    deleteWorkflow: async (id, purge = false) => {
      let outcome: { deprecated: boolean };
      try {
        outcome = await api.remove(id, purge);
      } catch {
        set({ backendOffline: true });
        return;
      }
      set((s) => {
        if (outcome.deprecated) {
          // Kept for history — mark in place, leaving it in the list (badged, read-only).
          return { workflows: s.workflows.map((w) => (w.id === id ? { ...w, deprecated: true } : w)) };
        }
        const workflows = s.workflows.filter((w) => w.id !== id);
        const activeWorkflowId = s.activeWorkflowId === id ? null : s.activeWorkflowId;
        return { workflows, activeWorkflowId, past: [], future: [] };
      });
    },

    cloneWorkflow: (id) => {
      const wf = get().workflows.find((w) => w.id === id);
      if (!wf) return;
      // A clone is a fresh, editable workflow — never inherit the deprecated flag.
      const clone: Workflow = { ...wf, id: crypto.randomUUID(), name: `${wf.name} (copy)`, deprecated: undefined, createdAt: Date.now(), updatedAt: Date.now() };
      set((s) => ({ workflows: [...s.workflows, clone] }));
      void api.save(clone).catch(() => set({ backendOffline: true }));
    },

    importWorkflow: (wf) => {
      set((s) => ({ workflows: [...s.workflows, wf] }));
      // Return the persist promise so callers that need the workflow on the
      // backend before navigating (e.g. opening it in a fresh tab) can await it.
      return api.save(wf).catch(() => set({ backendOffline: true }));
    },

    updateWorkflowMeta: (id, patch) => {
      set((s) => {
        const workflows = s.workflows.map((w) => w.id === id ? { ...w, ...patch, updatedAt: Date.now() } : w);
        const updated = workflows.find((w) => w.id === id);
        if (updated) void api.save(updated).catch(() => set({ backendOffline: true }));
        return { workflows };
      });
    },

    // Restore a workflow to a past version. Overwrites IN PLACE (same id) — never
    // mints a new workflow — and persists through the normal save path, so the
    // pre-restore state is itself snapshotted into history (a restore is undoable).
    restoreWorkflow: async (id, data) => {
      const { workflows } = get();
      const existing = workflows.find((w) => w.id === id);
      if (!existing) return;
      const restored: Workflow = {
        ...data,
        id,                                        // identity is immutable
        createdAt: existing.createdAt,             // keep original creation time
        deprecated: existing.deprecated,           // restore doesn't change lifecycle
        version: (existing.version ?? 0) + 1,      // a restore is a new saved version
        updatedAt: Date.now(),
      };
      set((s) => ({
        workflows: s.workflows.map((w) => (w.id === id ? restored : w)),
        // If it's the open workflow, replace editor state cleanly (no stale undo
        // stack) and mark saved — the server now holds exactly this.
        ...(s.activeWorkflowId === id ? { past: [], future: [], isDirty: false } : {}),
      }));
      try { await api.save(restored); set({ backendOffline: false }); }
      catch { set({ backendOffline: true }); }
    },

    setActiveWorkflow: (id) =>
      // Also drop any in-progress run review — a replay belongs to the workflow
      // it was opened from, so switching workflows must exit review mode.
      set({ activeWorkflowId: id, past: [], future: [], execution: { ...EMPTY_EXECUTION }, replayRunId: null, reviewSnapshot: null }),

    saveWorkflows: async () => {
      const { workflows, activeWorkflowId } = get();
      const idx = workflows.findIndex((w) => w.id === activeWorkflowId);
      if (idx < 0) return;
      // Version increments on every save; runs record it as workflowVersion.
      const bumped = { ...workflows[idx], version: (workflows[idx].version ?? 0) + 1, updatedAt: Date.now() };
      set({ workflows: workflows.map((w, i) => (i === idx ? bumped : w)) });
      try {
        await api.save(bumped);
        set({ isDirty: false, backendOffline: false });
      } catch {
        // Save failed — keep the unsaved indicator honest instead of
        // silently pretending the edits are persisted.
        set({ backendOffline: true });
      }
    },

    discardChanges: async () => {
      const workflows = await api.list();
      set({ workflows, past: [], future: [], isDirty: false });
    },

    // --- Editor settings ---

    setLayoutDirection: (v) => mutateActive((w) => ({ ...w, layoutDirection: v })),

    applyAutoLayout: () => {
      const { activeWorkflowId, workflows } = get();
      if (!activeWorkflowId) return;
      const wf = workflows.find((w) => w.id === activeWorkflowId);
      if (!wf) return;
      const newNodes = computeLayout(wf.nodes, wf.edges, wf.layoutDirection);
      mutateActive((w) => ({ ...w, nodes: newNodes }));
    },

    // --- Active workflow mutations ---

    addNode: (node) => mutateActive((w) => ({ ...w, nodes: [...w.nodes, node] })),

    addNodes: (nodes, edges) =>
      mutateActive((w) => ({ ...w, nodes: [...w.nodes, ...nodes], edges: [...w.edges, ...edges] })),

    updateNode: (id, patch) =>
      mutateActive((w) => ({ ...w, nodes: w.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) })),

    updateNodeSilent: (id, patch) =>
      set((s) => {
        const idx = s.workflows.findIndex((w) => w.id === s.activeWorkflowId);
        if (idx < 0) return s;
        const wf = s.workflows[idx];
        return {
          isDirty: true,
          workflows: s.workflows.map((w, i) =>
            i === idx ? { ...wf, nodes: wf.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) } : w,
          ),
        };
      }),

    snapshotHistory: () => {
      const { activeWorkflowId, workflows, past } = get();
      if (!activeWorkflowId) return;
      const idx = workflows.findIndex((w) => w.id === activeWorkflowId);
      if (idx < 0) return;
      set({ past: pushHistory(past, workflows[idx]), future: [], isDirty: true });
    },

    moveNodeSilent: (id, position) =>
      set((s) => {
        const idx = s.workflows.findIndex((w) => w.id === s.activeWorkflowId);
        if (idx < 0) return s;
        const wf   = s.workflows[idx];
        const node = wf.nodes.find((n) => n.id === id);
        if (node && node.position.x === position.x && node.position.y === position.y) return s;
        return {
          isDirty: true,
          workflows: s.workflows.map((w, i) =>
            i === idx ? { ...wf, nodes: wf.nodes.map((n) => (n.id === id ? { ...n, position } : n)) } : w,
          ),
        };
      }),

    removeNode: (id) =>
      mutateActive((w) => ({
        ...w,
        nodes: w.nodes.filter((n) => n.id !== id),
        edges: w.edges.filter((e) => e.from !== id && e.to !== id),
      })),

    addEdge: (edge) => mutateActive((w) => ({ ...w, edges: [...w.edges, edge] })),

    removeEdge: (id) => mutateActive((w) => ({ ...w, edges: w.edges.filter((e) => e.id !== id) })),

    undo: () =>
      set((s) => {
        if (s.past.length === 0) return s;
        const { activeWorkflowId, workflows, past, future } = s;
        if (!activeWorkflowId) return s;
        const idx = workflows.findIndex((w) => w.id === activeWorkflowId);
        if (idx < 0) return s;
        const previous = past[past.length - 1];
        return { past: past.slice(0, -1), future: [workflows[idx], ...future].slice(0, HISTORY_LIMIT), workflows: workflows.map((w, i) => (i === idx ? previous : w)), isDirty: true };
      }),

    redo: () =>
      set((s) => {
        if (s.future.length === 0) return s;
        const { activeWorkflowId, workflows, past, future } = s;
        if (!activeWorkflowId) return s;
        const idx = workflows.findIndex((w) => w.id === activeWorkflowId);
        if (idx < 0) return s;
        const next = future[0];
        return { past: pushHistory(past, workflows[idx]), future: future.slice(1), workflows: workflows.map((w, i) => (i === idx ? next : w)), isDirty: true };
      }),

    // --- Execution ---

    setExecution: (partial) => set((s) => ({ execution: { ...s.execution, ...partial } })),

    addActiveNode: (id) =>
      set((s) => ({ execution: { ...s.execution, activeNodeIds: [...s.execution.activeNodeIds, id] } })),

    removeActiveNode: (id) =>
      set((s) => ({ execution: { ...s.execution, activeNodeIds: s.execution.activeNodeIds.filter((x) => x !== id) } })),

    setNodeResult: (result) =>
      set((s) => {
        const prev = s.execution.results[result.nodeId];
        let merged;
        if (prev && (prev.status === 'success' || prev.status === 'error')) {
          // node:start for a new iteration — push the previous terminal result to iterations
          const { iterations: prevIter, ...prevWithout } = prev;
          merged = { ...result, iterations: [...(prevIter ?? []), prevWithout] };
        } else if (prev?.iterations) {
          // node:complete after node:start — prev is 'running' but may carry accumulated iterations
          merged = { ...result, iterations: prev.iterations };
        } else {
          merged = result;
        }
        return { execution: { ...s.execution, results: { ...s.execution.results, [result.nodeId]: merged } } };
      }),

    addLog: (msg, kind = 'system', ts = Date.now()) =>
      set((s) => ({ execution: { ...s.execution, logs: [...s.execution.logs, { text: msg, kind, ts }] } })),

    resetExecution: () => set({ execution: { ...EMPTY_EXECUTION } }),

    focusNode: (id) => set({ focusedNodeId: id }),

    setReplayRunId: (id) => set({ replayRunId: id }),

    setReviewSnapshot: (wf) => set({ reviewSnapshot: wf }),
  };
});
