import { useEffect, useRef, useState } from 'react';
import { useForm, type FieldValues } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Copy, Check, RotateCcw } from 'lucide-react';
import { getNode } from '../../engine/nodeRegistry';
import { useWorkflowStore } from '../../state/workflowStore';
import { useScriptStore } from '../../state/scriptStore';
import type { FieldMeta } from '../../types/node';
import { MonacoField } from './MonacoField';
import { ScriptSelectField } from './ScriptSelectField';
import { ScriptInputBindingsField } from './ScriptInputBindingsField';
import type { InputBinding } from '../../types/script';

type IterResult = Omit<import('../../types/workflow').NodeExecutionResult, 'iterations'>;

function ExecSection({ result, runId, nodeId }: {
  result: import('../../types/workflow').NodeExecutionResult;
  runId: string | null;
  nodeId: string;
}) {
  const setNodeResult    = useWorkflowStore((s) => s.setNodeResult);
  const addActiveNode    = useWorkflowStore((s) => s.addActiveNode);
  const removeActiveNode = useWorkflowStore((s) => s.removeActiveNode);
  const isRunning        = useWorkflowStore((s) => s.execution.running);

  const [idx, setIdx]               = useState(0);
  const [rerunning, setRerunning]   = useState(false);
  const [rerunError, setRerunError] = useState<string | null>(null);
  const jumpToLastRef  = useRef(false);
  const rerunInputRef  = useRef<unknown>(null);
  const rerunStartRef  = useRef(0);

  const baseIter: IterResult = {
    nodeId: result.nodeId, status: result.status, input: result.input,
    resolvedConfig: result.resolvedConfig, output: result.output,
    error: result.error, startedAt: result.startedAt, finishedAt: result.finishedAt,
  };
  const pendingIter: IterResult | null = rerunning ? {
    nodeId: result.nodeId, status: 'running', input: rerunInputRef.current,
    output: null, startedAt: rerunStartRef.current, finishedAt: 0,
  } : null;
  const allIterations: IterResult[] = [
    ...(result.iterations ?? []),
    baseIter,
    ...(pendingIter ? [pendingIter] : []),
  ];

  const shown   = allIterations[Math.min(idx, allIterations.length - 1)];
  const isMulti = allIterations.length > 1;

  // Jump to the pending slot as soon as rerunning starts
  useEffect(() => {
    if (rerunning) setIdx(allIterations.length - 1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rerunning]);

  // Jump to the real result after rerun completes
  useEffect(() => {
    if (jumpToLastRef.current) {
      setIdx(allIterations.length - 1);
      jumpToLastRef.current = false;
    }
  }, [allIterations.length]);

  // Initialise idx to the last iteration on first mount
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      setIdx(allIterations.length - 1);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRerun = async () => {
    if (!runId || rerunning || isRunning) return;
    rerunInputRef.current = shown.input ?? null;
    rerunStartRef.current = Date.now();
    setRerunning(true);
    setRerunError(null);
    addActiveNode(nodeId);
    try {
      const res = await fetch(`/runs/${runId}/rerun-node/${nodeId}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ input: rerunInputRef.current }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        setRerunError(body.error ?? `HTTP ${res.status}`);
        return;
      }
      const newResult = await res.json() as import('../../types/workflow').NodeExecutionResult;
      jumpToLastRef.current = true;
      setNodeResult(newResult);
    } catch (err) {
      setRerunError(err instanceof Error ? err.message : 'Network error');
    } finally {
      removeActiveNode(nodeId);
      setRerunning(false);
    }
  };

  return (
    <>
      <div className="config-divider" />
      <div className="exec-section">
        <div className="exec-section-header">
          <p className="s-title" style={{ margin: 0 }}>Execution</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {runId && (
              <button
                className="btn-icon"
                onClick={() => void handleRerun()}
                disabled={rerunning || isRunning}
                title="Re-run with the same inputs"
              >
                <RotateCcw size={12} />
              </button>
            )}
            {isMulti && (
              <div className="exec-iter-nav">
                <button className="btn-icon" onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx === 0}>‹</button>
                <span className="exec-iter-label">{idx + 1} / {allIterations.length}</span>
                <button className="btn-icon" onClick={() => setIdx((i) => Math.min(allIterations.length - 1, i + 1))} disabled={idx === allIterations.length - 1}>›</button>
              </div>
            )}
          </div>
        </div>
        <div className="exec-status-row">
          <span className="run-badge" data-status={shown.status}>{shown.status}</span>
          {shown.startedAt > 0 && (
            <span className="exec-time" title={new Date(shown.startedAt).toISOString()}>{fmtDateTime(shown.startedAt)}</span>
          )}
          {shown.startedAt > 0 && shown.finishedAt > 0 && (
            <span className="exec-duration">{fmtDuration(shown.startedAt, shown.finishedAt)}</span>
          )}
        </div>
        {rerunError && <div className="exec-error">Re-run failed: {rerunError}</div>}
        {shown.error && <div className="exec-error">{shown.error}</div>}
        <JsonBlock label="Input" value={shown.input ?? null} />
        {shown.status === 'running'
          ? <div className="exec-block"><div className="exec-block-label">Output</div><div className="exec-pending">Running…</div></div>
          : <JsonBlock label="Output" value={shown.output} />
        }
      </div>
    </>
  );
}

// Read-only inspector shown in the right column while reviewing a run. No form
// fields — just the recorded config/inputs/outputs (the old "raw" view) with a
// re-run control on top.
function RunNodeInspector({ selectedIds, streaming }: { selectedIds: string[]; streaming: boolean }) {
  const activeWorkflow   = useWorkflowStore((s) => s.workflows.find((w) => w.id === s.activeWorkflowId));
  const wfNodes          = activeWorkflow?.nodes ?? [];
  const execResults      = useWorkflowStore((s) => s.execution.results);
  const runId            = useWorkflowStore((s) => s.replayRunId);
  const setNodeResult    = useWorkflowStore((s) => s.setNodeResult);
  const addActiveNode    = useWorkflowStore((s) => s.addActiveNode);
  const removeActiveNode = useWorkflowStore((s) => s.removeActiveNode);
  const isRunning        = useWorkflowStore((s) => s.execution.running);

  const nodeId = selectedIds.length === 1 ? selectedIds[0] : '';
  const node   = wfNodes.find((n) => n.id === nodeId);
  const def    = node ? getNode(node.type) : undefined;
  const result = nodeId ? execResults[nodeId] : undefined;

  const [idx, setIdx]             = useState(0);
  const [rerunning, setRerunning] = useState(false);
  const [rerunError, setRerunError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft]           = useState('');
  const [draftError, setDraftError] = useState<string | null>(null);
  const jumpToLastRef = useRef(false);

  // Reset per-node view state when the selection changes.
  useEffect(() => { setIdx(0); setDialogOpen(false); setRerunError(null); }, [nodeId]);

  type IterView = Omit<import('../../types/workflow').NodeExecutionResult, 'iterations'>;
  const iterations: IterView[] = result
    ? [
        ...(result.iterations ?? []),
        {
          nodeId: result.nodeId, status: result.status, input: result.input,
          resolvedConfig: result.resolvedConfig, output: result.output,
          error: result.error, startedAt: result.startedAt, finishedAt: result.finishedAt,
        },
      ]
    : [];
  const shown   = iterations[Math.min(idx, Math.max(0, iterations.length - 1))];
  const isMulti = iterations.length > 1;

  // Jump to the newest iteration after a re-run appends one.
  useEffect(() => {
    if (jumpToLastRef.current) { setIdx(Math.max(0, iterations.length - 1)); jumpToLastRef.current = false; }
  }, [iterations.length]);

  if (selectedIds.length > 1) {
    return <div className="config-empty">{selectedIds.length} nodes selected — select a single node to inspect.</div>;
  }
  if (!nodeId) {
    return <div className="config-empty">Select a node to inspect its execution.</div>;
  }
  if (!result || result.status === 'idle' || !shown) {
    return <div className="config-empty">This node did not execute in this run.</div>;
  }

  // Node must still exist in the current workflow, and a deprecated workflow is
  // frozen — the backend rejects re-running its nodes (they'd run real handlers).
  const canRerun = !!node && !!def && !activeWorkflow?.deprecated;

  const openDialog = () => {
    setDraft(JSON.stringify(shown.input ?? null, null, 2));
    setDraftError(null);
    setDialogOpen(true);
  };

  const runWithInput = async (input: unknown) => {
    if (!runId || rerunning || isRunning || streaming) return;
    setRerunning(true);
    setRerunError(null);
    addActiveNode(nodeId);
    try {
      const res = await fetch(`/runs/${runId}/rerun-node/${nodeId}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ input, resolvedConfig: shown.resolvedConfig }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        setRerunError(body.error ?? `HTTP ${res.status}`);
        return;
      }
      const newResult = await res.json() as import('../../types/workflow').NodeExecutionResult;
      jumpToLastRef.current = true;
      setNodeResult(newResult);
      setDialogOpen(false);
    } catch (err) {
      setRerunError(err instanceof Error ? err.message : 'Network error');
    } finally {
      removeActiveNode(nodeId);
      setRerunning(false);
    }
  };

  const submitDialog = () => {
    let parsed: unknown;
    try {
      parsed = draft.trim() === '' ? null : JSON.parse(draft);
    } catch (err) {
      setDraftError(err instanceof Error ? err.message : 'Invalid JSON');
      return;
    }
    void runWithInput(parsed);
  };

  return (
    <div className="config-panel run-inspector">
      <div className="config-header">
        <h3 className="config-title">{def?.label ?? node?.type ?? 'Node'}</h3>
        <span className="run-badge" data-status={shown.status}>{shown.status}</span>
      </div>
      <div className="config-id">
        ID: {nodeId}
        <CopyButton getValue={() => nodeId} />
      </div>
      {!node && (
        <div className="config-plugin-label">
          This node is no longer part of the current workflow — configuration unavailable.
        </div>
      )}

      {/* Top section — re-run (only when the node still exists in the workflow) */}
      <div className="run-inspector-top">
        {canRerun ? (
          <button
            className="btn-secondary"
            onClick={openDialog}
            disabled={rerunning || isRunning || streaming}
            title={streaming ? 'Wait for the run to finish before re-running a node' : 'Re-run this node with the same or edited input'}
          >
            <RotateCcw size={12} /> {rerunning ? 'Re-running…' : 'Re-run node…'}
          </button>
        ) : <span />}
        {isMulti && (
          <div className="exec-iter-nav">
            <button className="btn-icon" onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx === 0}>‹</button>
            <span className="exec-iter-label">{Math.min(idx, iterations.length - 1) + 1} / {iterations.length}</span>
            <button className="btn-icon" onClick={() => setIdx((i) => Math.min(iterations.length - 1, i + 1))} disabled={idx >= iterations.length - 1}>›</button>
          </div>
        )}
      </div>
      {rerunError && <div className="exec-error">Re-run failed: {rerunError}</div>}

      <div className="config-divider" />

      {/* Bottom section — execution results */}
      <div className="exec-status-row">
        <span className="run-badge" data-status={shown.status}>{shown.status}</span>
        {shown.startedAt > 0 && (
          <span className="exec-time" title={new Date(shown.startedAt).toISOString()}>{fmtDateTime(shown.startedAt)}</span>
        )}
        {shown.startedAt > 0 && shown.finishedAt > 0 && (
          <span className="exec-duration">{fmtDuration(shown.startedAt, shown.finishedAt)}</span>
        )}
      </div>
      {shown.error && <div className="exec-error">{shown.error}</div>}
      {node && <JsonBlock label="Config" value={node.config} />}
      <JsonBlock label="Resolved Config" value={shown.resolvedConfig} />
      <JsonBlock label="Input" value={shown.input} />
      {shown.status === 'running'
        ? <div className="exec-block"><div className="exec-block-label">Output</div><div className="exec-pending">Running…</div></div>
        : <JsonBlock label="Output" value={shown.output} />}

      {dialogOpen && (
        <div className="modal-overlay" onClick={() => setDialogOpen(false)}>
          <div className="modal run-rerun-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Re-run “{def?.label ?? node?.type}”</span>
              <button className="modal-close" onClick={() => setDialogOpen(false)}>✕</button>
            </div>
            <p className="run-rerun-hint">
              Edit the input JSON to re-run with different arguments, or leave it unchanged to re-run with the same input.
            </p>
            <textarea
              className="field-input field-textarea run-rerun-input"
              spellCheck={false}
              rows={12}
              value={draft}
              onChange={(e) => { setDraft(e.target.value); setDraftError(null); }}
            />
            {draftError && <div className="exec-error">Invalid JSON: {draftError}</div>}
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setDialogOpen(false)}>Cancel</button>
              <button className="btn-primary" onClick={submitDialog} disabled={rerunning}>
                {rerunning ? 'Re-running…' : 'Re-run'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CopyButton({ getValue }: { getValue: () => string }) {
  const [copied, setCopied] = useState(false);
  const copy = (e: React.MouseEvent) => {
    e.preventDefault();
    const text = getValue();
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button type="button" className="copy-btn" onClick={copy} title="Copy">
      {copied ? <Check size={11} /> : <Copy size={11} />}
    </button>
  );
}

function useOllamaModels(active: boolean) {
  const [models, setModels] = useState<string[]>([]);
  useEffect(() => {
    if (!active) return;
    fetch('/plugins/ollama/models')
      .then((r) => r.ok ? r.json() as Promise<string[]> : Promise.resolve([]))
      .then(setModels)
      .catch(() => setModels([]));
  }, [active]);
  return models;
}

type DsTableOption = { id: string; name: string };

function useDatastoreTables(active: boolean) {
  const [tables, setTables] = useState<DsTableOption[]>([]);
  useEffect(() => {
    if (!active) return;
    fetch('/datastore/tables')
      .then((r) => r.ok ? r.json() as Promise<DsTableOption[]> : Promise.resolve([]))
      .then(setTables)
      .catch(() => setTables([]));
  }, [active]);
  return tables;
}

type Props = { selectedIds: string[]; reviewStreaming?: boolean };

function fmtDuration(startedAt: number, finishedAt: number): string {
  const ms = finishedAt - startedAt;
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}s`;
}

function fmtDateTime(ts: number): string {
  return new Date(ts).toLocaleString();
}

// Shown in the right column when nothing is selected in the edit view — a summary
// of the workflow itself (name, description, last ran, last updated) instead of a
// bare "select a node" hint.
function WorkflowSummaryPanel({ workflow }: { workflow: import('../../types/workflow').Workflow }) {
  const [lastRunAt, setLastRunAt] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch('/workflows/last-runs')
      .then((r) => (r.ok ? r.json() as Promise<Record<string, number>> : null))
      .then((m) => { if (!cancelled && m) setLastRunAt(m[workflow.id] ?? null); })
      .catch(() => { /* leave null — shows "Never" */ });
    return () => { cancelled = true; };
  }, [workflow.id]);

  return (
    <div className="config-panel wf-summary">
      <div className="config-header">
        <h3 className="config-title">{workflow.name}</h3>
      </div>
      <p className={`wf-summary-desc${workflow.description ? '' : ' wf-summary-desc--empty'}`}>
        {workflow.description || 'No description.'}
      </p>
      <div className="wf-summary-meta">
        <div className="wf-summary-row">
          <span className="wf-summary-label">Last ran</span>
          <span className="wf-summary-value">{lastRunAt ? fmtDateTime(lastRunAt) : 'Never'}</span>
        </div>
        <div className="wf-summary-row">
          <span className="wf-summary-label">Last updated</span>
          <span className="wf-summary-value">{fmtDateTime(workflow.updatedAt)}</span>
        </div>
      </div>
      <div className="wf-summary-hint">Select a node to configure it.</div>
    </div>
  );
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  const text = value === null || value === undefined
    ? '(none)'
    : JSON.stringify(value, null, 2);
  return (
    <div className="exec-block">
      <div className="field-label-row">
        <div className="exec-block-label">{label}</div>
        <CopyButton getValue={() => text} />
      </div>
      <pre className="exec-json">{text}</pre>
    </div>
  );
}

const resolveFieldMeta = (key: string, fieldMeta?: Record<string, FieldMeta>): FieldMeta => {
  if (fieldMeta?.[key]) return fieldMeta[key];
  if (key === 'code')         return { type: 'monaco', language: 'javascript' };
  if (key === 'mockResponse') return { type: 'monaco', language: 'json' };
  return { type: 'text' };
};

export const NodeConfigPanel = ({ selectedIds, reviewStreaming = false }: Props) => {
  const wfNodes            = useWorkflowStore((s) => s.workflows.find((w) => w.id === s.activeWorkflowId)?.nodes ?? []);
  const activeWorkflowId   = useWorkflowStore((s) => s.activeWorkflowId);
  const allWorkflows        = useWorkflowStore((s) => s.workflows);
  const updateNode         = useWorkflowStore((s) => s.updateNode);
  const updateNodeSilent   = useWorkflowStore((s) => s.updateNodeSilent);
  const removeNode         = useWorkflowStore((s) => s.removeNode);
  const execResults        = useWorkflowStore((s) => s.execution.results);
  const isRunning          = useWorkflowStore((s) => s.execution.running);
  const replayRunId        = useWorkflowStore((s) => s.replayRunId);
  const scripts            = useScriptStore((s) => s.scripts);
  const activeWorkflow     = allWorkflows.find((w) => w.id === activeWorkflowId);
  const otherWorkflows     = allWorkflows.filter((w) => w.id !== activeWorkflowId && !w.deprecated);

  // Reviewing a past run — the whole panel is read-only, like `isRunning`.
  const reviewing = !!replayRunId;
  const locked    = isRunning || reviewing;

  const nodeId = selectedIds.length === 1 ? selectedIds[0] : '';
  const node   = wfNodes.find((n) => n.id === nodeId);

  const def = node ? getNode(node.type) : undefined;

  // Meta fields — name, description, and timeout stored directly on the node
  const [metaName, setMetaName]       = useState(node?.name ?? '');
  const [metaDesc, setMetaDesc]       = useState(node?.description ?? '');
  const [metaTimeout, setMetaTimeout] = useState(node?.timeoutSecs != null ? String(node.timeoutSecs) : '');
  const [metaOpen, setMetaOpen]       = useState(!!(node?.name || node?.description));

  useEffect(() => {
    setMetaName(node?.name ?? '');
    setMetaDesc(node?.description ?? '');
    setMetaTimeout(node?.timeoutSecs != null ? String(node.timeoutSecs) : '');
    setMetaOpen(!!(node?.name || node?.description));
  }, [node?.id, node?.name, node?.description, node?.timeoutSecs]);

  const commitMeta = () => {
    if (locked) return;
    const parsed = metaTimeout.trim() === '' ? undefined : Number(metaTimeout.trim());
    updateNode(nodeId, {
      name:        metaName.trim()  || undefined,
      description: metaDesc.trim() || undefined,
      timeoutSecs: parsed && parsed > 0 ? parsed : undefined,
    });
  };

  // Config form
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
    setValue,
    watch,
    getValues,
  } = useForm<FieldValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver:      def ? zodResolver(def.configSchema as any) : undefined,
    defaultValues: node?.config ?? {},
  });

  const hasOllamaModel = !!def && Object.values(def.fieldMeta ?? {}).some((m) => m.type === 'ollama-model');
  const ollamaModels   = useOllamaModels(hasOllamaModel);

  const hasDsTable    = !!def && Object.values(def.fieldMeta ?? {}).some((m) => m.type === 'datastore-table');
  const dsTables      = useDatastoreTables(hasDsTable);

  const prevNodeIdRef = useRef(nodeId);
  const isDirtyRef    = useRef(isDirty);
  isDirtyRef.current  = isDirty;

  useEffect(() => {
    const prevNodeId = prevNodeIdRef.current;
    prevNodeIdRef.current = nodeId;

    // Capture and save synchronously before reset() so async validation errors
    // from the previous node cannot bleed into the new node's form.
    if (!locked && prevNodeId && prevNodeId !== nodeId && isDirtyRef.current) {
      updateNode(prevNodeId, { config: getValues() });
    }

    if (node) reset(node.config);
  }, [nodeId, node, reset, getValues, updateNode, locked]);

  // Reviewing a run: the right column is a read-only inspector, not the config form.
  if (reviewing) {
    return <RunNodeInspector selectedIds={selectedIds} streaming={reviewStreaming} />;
  }

  if (selectedIds.length > 1) {
    const counts: Record<string, number> = {};
    for (const id of selectedIds) {
      const t = wfNodes.find((n) => n.id === id)?.type ?? 'unknown';
      counts[t] = (counts[t] ?? 0) + 1;
    }
    return (
      <div className="config-panel">
        <div className="config-header">
          <h3 className="config-title">Selection</h3>
        </div>
        <div className="config-multiselect">
          <div className="config-multiselect-count">{selectedIds.length} nodes selected</div>
          <div className="config-multiselect-types">
            {Object.entries(counts).map(([type, count]) => (
              <div key={type} className="config-multiselect-row">
                <span className="config-multiselect-type">{type}</span>
                <span className="config-multiselect-badge">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!node || !def) {
    // Nothing selected → show a summary of the workflow itself. (A single
    // selection whose node/def can't be resolved still falls back to the hint.)
    if (selectedIds.length === 0 && activeWorkflow) {
      return <WorkflowSummaryPanel workflow={activeWorkflow} />;
    }
    return <div className="config-empty">Select a node to configure it.</div>;
  }

  if (node.type === 'junction') {
    const orientation = (node.config.orientation as string) ?? 'vertical';
    return (
      <div className="config-panel">
        <div className="config-header">
          <h3 className="config-title">{def.label}</h3>
          {!reviewing && <button className="btn-danger" onClick={() => removeNode(nodeId)}>Delete</button>}
        </div>
        <div className="config-id">
          ID: {node.id}
          <CopyButton getValue={() => node.id} />
        </div>
        <div className="config-fields">
          <div className="field-row">
            <label className="field-label">Orientation</label>
            <select
              className="field-input"
              value={orientation}
              onChange={(e) =>
                updateNodeSilent(nodeId, { config: { ...node.config, orientation: e.target.value } })
              }
            >
              <option value="vertical">vertical</option>
              <option value="horizontal">horizontal</option>
            </select>
          </div>
        </div>
      </div>
    );
  }

  const onSubmit = (data: FieldValues) => updateNode(nodeId, { config: data });

  const schemaShape = (def.configSchema as { shape?: Record<string, unknown> }).shape ?? {};
  // 'inputs' is rendered separately for script nodes — skip it in the generic loop
  const fields = Object.keys(schemaShape).filter((k) => k !== 'inputs');

  const selectedScript = node.type === 'script'
    ? scripts.find((s) => s.name === (watch('scriptName') as string))
    : undefined;
  const scriptInputsDeclared = selectedScript?.inputs ?? [];
  const currentInputBindings = (watch('inputs') as Record<string, InputBinding> | undefined) ?? {};

  return (
    <div className="config-panel">
      <div className="config-header">
        <h3 className="config-title">{def.label}</h3>
        {!reviewing && <button className="btn-danger" onClick={() => removeNode(nodeId)}>Delete</button>}
      </div>
      <div className="config-id">
        ID: {node.id}
        <CopyButton getValue={() => node.id} />
      </div>
      {def.plugin && (
        <div className="config-plugin-label">Plugin: {def.plugin}</div>
      )}

      {/* Enabled toggle — moved off the canvas node into the config column. A
          disabled node is skipped during execution. Same checkbox style as the
          trigger tile. Hidden for decoration nodes. */}
      {node.type !== 'label' && (
        <label className="trigger-enabled config-enabled" title="Disabled nodes are skipped during execution">
          <input
            type="checkbox"
            checked={node.enabled !== false}
            disabled={locked}
            onChange={(e) => updateNode(nodeId, { enabled: e.target.checked })}
          />
          Enabled
        </label>
      )}

      {/* Node meta — name and description (hidden for decoration nodes) */}
      {node.type !== 'label' && node.type !== 'junction' && (
        <>
          <button
            type="button"
            className="config-meta-toggle"
            onClick={() => setMetaOpen((o) => !o)}
          >
            <span>Name &amp; Description</span>
            <span className="config-meta-toggle-arrow">{metaOpen ? '▲' : '▼'}</span>
          </button>
          {metaOpen && (
            <div className="config-meta">
              <div className="field-row">
                <div className="field-label-row">
                  <label className="field-label">Name</label>
                  <CopyButton getValue={() => metaName} />
                </div>
                <input
                  className="field-input"
                  placeholder={def.label}
                  value={metaName}
                  onChange={(e) => setMetaName(e.target.value)}
                  onBlur={commitMeta}
                  onKeyDown={(e) => e.key === 'Enter' && commitMeta()}
                />
              </div>
              <div className="field-row">
                <div className="field-label-row">
                  <label className="field-label">Description</label>
                  <CopyButton getValue={() => metaDesc} />
                </div>
                <textarea
                  className="field-input field-textarea"
                  placeholder="Add a description…"
                  rows={2}
                  value={metaDesc}
                  onChange={(e) => setMetaDesc(e.target.value)}
                  onBlur={commitMeta}
                />
              </div>
              <div className="field-row">
                <label className="field-label">Timeout (seconds)</label>
                <input
                  className="field-input"
                  type="number"
                  min="1"
                  step="1"
                  placeholder="300 (default)"
                  value={metaTimeout}
                  onChange={(e) => setMetaTimeout(e.target.value)}
                  onBlur={commitMeta}
                  onKeyDown={(e) => e.key === 'Enter' && commitMeta()}
                />
              </div>
            </div>
          )}
          <div className="config-divider" />
        </>
      )}

      {/* Type-specific config */}
      <form
        onSubmit={handleSubmit(onSubmit)}
        onBlur={(e) => {
          if (!locked && !e.currentTarget.contains(e.relatedTarget as Node | null) && isDirtyRef.current) {
            void handleSubmit(onSubmit)();
          }
        }}
      >
        {fields.map((key) => {
          const error = errors[key]?.message as string | undefined;
          const meta  = resolveFieldMeta(key, def.fieldMeta);

          if (meta.type === 'monaco') {
            return (
              <MonacoField
                key={key}
                label={key}
                language={meta.language}
                value={watch(key) as string ?? ''}
                onChange={(v) => setValue(key, v, { shouldDirty: true })}
                error={error}
                readOnly={locked}
                completionNodes={
                  meta.language === 'javascript'
                    ? wfNodes.filter((n) => n.id !== nodeId && n.type !== 'label')
                    : undefined
                }
              />
            );
          }

          if (meta.type === 'number') {
            return (
              <div key={key} className="field-row">
                <div className="field-label-row">
                  <label className="field-label">{key}</label>
                  <CopyButton getValue={() => String(watch(key) ?? '')} />
                </div>
                <input
                  {...register(key, { valueAsNumber: true })}
                  type="number"
                  step="any"
                  className="field-input"
                  disabled={locked}
                  data-error={error ? 'true' : undefined}
                />
                {error && <div className="field-error">{error}</div>}
              </div>
            );
          }

          if (meta.type === 'ollama-model') {
            const current = watch(key) as string ?? '';
            const opts = current && !ollamaModels.includes(current)
              ? [current, ...ollamaModels]
              : ollamaModels;
            return (
              <div key={key} className="field-row">
                <label className="field-label">{key}</label>
                <select
                  {...register(key)}
                  className="field-select"
                  disabled={locked}
                  data-error={error ? 'true' : undefined}
                >
                  {opts.length === 0 && <option value={current}>{current || 'Loading…'}</option>}
                  {opts.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
                {error && <div className="field-error">{error}</div>}
              </div>
            );
          }

          if (meta.type === 'textarea') {
            return (
              <div key={key} className="field-row">
                <div className="field-label-row">
                  <label className="field-label">{key}</label>
                  <CopyButton getValue={() => String(watch(key) ?? '')} />
                </div>
                <textarea
                  {...register(key)}
                  className="field-input field-textarea"
                  rows={4}
                  disabled={locked}
                  data-error={error ? 'true' : undefined}
                />
                {error && <div className="field-error">{error}</div>}
              </div>
            );
          }

          if (meta.type === 'checkbox') {
            return (
              <div key={key} className="field-row field-row--inline">
                <input
                  type="checkbox"
                  id={`field-${nodeId}-${key}`}
                  {...register(key)}
                  className="field-checkbox"
                  disabled={locked}
                />
                <label htmlFor={`field-${nodeId}-${key}`} className="field-label">{key}</label>
              </div>
            );
          }

          if (meta.type === 'select') {
            return (
              <div key={key} className="field-row">
                <label className="field-label">{key}</label>
                <select {...register(key)} className="field-select" disabled={locked} data-error={error ? 'true' : undefined}>
                  {(meta.options ?? []).map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
                {error && <div className="field-error">{error}</div>}
              </div>
            );
          }

          if (meta.type === 'script-select') {
            return (
              <ScriptSelectField
                key={key}
                value={(watch(key) as string) ?? ''}
                onChange={(v) => setValue(key, v, { shouldValidate: true, shouldDirty: true })}
                scripts={scripts}
                error={error}
                disabled={locked}
              />
            );
          }

          if (meta.type === 'workflow-select') {
            return (
              <div key={key} className="field-row">
                <label className="field-label">{key}</label>
                <select
                  {...register(key)}
                  className="field-select"
                  disabled={locked}
                  data-error={error ? 'true' : undefined}
                >
                  <option value="">— select workflow —</option>
                  {otherWorkflows.map((w) => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
                {error && <div className="field-error">{error}</div>}
              </div>
            );
          }

          if (meta.type === 'datastore-table') {
            return (
              <div key={key} className="field-row">
                <label className="field-label">{key}</label>
                <select
                  {...register(key)}
                  className="field-select"
                  disabled={locked}
                  data-error={error ? 'true' : undefined}
                >
                  <option value="">— select table —</option>
                  {dsTables.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                {error && <div className="field-error">{error}</div>}
              </div>
            );
          }

          return (
            <div key={key} className="field-row">
              <div className="field-label-row">
                <label className="field-label">{key}</label>
                <CopyButton getValue={() => String(watch(key) ?? '')} />
              </div>
              <input
                {...register(key)}
                className="field-input"
                disabled={locked}
                data-error={error ? 'true' : undefined}
              />
              {error && <div className="field-error">{error}</div>}
              {meta.hint && <div className="field-hint">{meta.hint}</div>}
            </div>
          );
        })}
        {node.type === 'script' && scriptInputsDeclared.length > 0 && (
          <>
            <div className="config-divider" />
            <ScriptInputBindingsField
              scriptInputs={scriptInputsDeclared}
              bindings={currentInputBindings}
              onChange={(b) => setValue('inputs', b, { shouldDirty: true })}
              otherNodes={wfNodes.filter((n) => n.id !== nodeId && n.type !== 'label')}
              disabled={locked}
            />
          </>
        )}
      </form>

      {/* Execution results — shown after a run or replay */}
      {execResults[nodeId] && execResults[nodeId].status !== 'idle' && (
        <ExecSection result={execResults[nodeId]} runId={replayRunId} nodeId={nodeId} />
      )}
    </div>
  );
};
