import { useEffect, useRef, useState } from 'react';
import { useWorkflowStore } from '../../state/workflowStore';
import type { Run, Workflow } from '../../types/workflow';

const UUID_RE = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi;

function renderLogLine(line: string, onUuidClick: (id: string) => void) {
  const parts = (line ?? '').split(UUID_RE);
  return parts.map((part, i) =>
    i % 2 === 1
      ? <button key={i} className="log-uuid" onClick={() => onUuidClick(part)} title="Focus node on canvas">{part}</button>
      : part,
  );
}

function fmtDuration(startedAt: number, finishedAt: number): string {
  if (!startedAt || !finishedAt) return '—';
  const ms = finishedAt - startedAt;
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}s`;
}

// Local wall-clock, matching the Jobs list convention (JobsView.tsx:23-25):
// human-readable local time on screen, full ISO in the tooltip.
function fmtClock(ts: number | null | undefined): string {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function fmtDateTime(ts: number | null | undefined): string {
  if (!ts) return '';
  const d = new Date(ts);
  const date = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `${date}, ${fmtClock(ts)}`;
}

function isoTitle(ts: number | null | undefined): string | undefined {
  return ts ? new Date(ts).toISOString() : undefined;
}

type Tab = 'nodes' | 'log';

type Props = {
  runId: string;
  workflow: Workflow;
  selectedNodeId: string | null;
  streaming: boolean;
  onCancel: (runId: string) => void;
};

/**
 * Left-column panel shown while reviewing a run (replayRunId set). Replaces the
 * node palette with a read-only, tabbed view of the run: the node-execution list
 * and the execution log. Selecting a node focuses it on the (locked) canvas and
 * drives the right-hand config/execution panel.
 */
export const RunReviewPanel = ({ runId, workflow, selectedNodeId, streaming, onCancel }: Props) => {
  const results   = useWorkflowStore((s) => s.execution.results);
  const logs      = useWorkflowStore((s) => s.execution.logs);
  const focusNode = useWorkflowStore((s) => s.focusNode);
  const isDirty   = useWorkflowStore((s) => s.isDirty);
  const snapshot  = useWorkflowStore((s) => s.reviewSnapshot);

  // The canvas renders the snapshot when we have one, so node lookups (names,
  // "removed" tags) must read from the same graph, or they'd disagree with it.
  const graph = snapshot ?? workflow;

  const [tab, setTab]           = useState<Tab>('nodes');
  const [logsOnly, setLogsOnly] = useState(false);
  const [run, setRun]           = useState<Run | null>(null);

  const logRef     = useRef<HTMLDivElement>(null);
  const stickedRef = useRef(true);

  // Clear stale meta immediately when the reviewed run changes.
  useEffect(() => { setRun(null); }, [runId]);

  // Fetch run meta (status, trigger, version) for the header + version-mismatch
  // warning. Refetch when the live stream ends so the status badge reflects the
  // final state instead of staying stuck on "running".
  useEffect(() => {
    let cancelled = false;
    void fetch(`/runs/${runId}`)
      .then((r) => (r.ok ? r.json() as Promise<Run> : null))
      .then((r) => { if (!cancelled) setRun(r); })
      .catch(() => { /* keep last known meta */ });
    return () => { cancelled = true; };
  }, [runId, streaming]);

  useEffect(() => {
    if (stickedRef.current && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs, tab]);

  const known = new Set(graph.nodes.map((n) => n.id));
  const timeline = Object.values(results)
    .filter((r) => r.status !== 'idle')
    .sort((a, b) => (a.startedAt ?? 0) - (b.startedAt ?? 0));

  const versionMismatch =
    run?.workflowVersion != null && run.workflowVersion !== workflow.version;

  const nodeName = (nodeId: string): string => {
    const n = graph.nodes.find((x) => x.id === nodeId);
    return n?.name ?? n?.type ?? nodeId;
  };

  const visibleLogs = logsOnly ? logs.filter((e) => e.kind === 'log') : logs;

  const isActiveRun = !!run && (run.status === 'running' || run.status === 'queued');

  return (
    <div className="run-review">
      <div className="run-review-header">
        <div className="run-review-title-row">
          <span className="run-review-title">
            Reviewing run <span className="run-id">{runId.slice(0, 8)}</span>
          </span>
          {run && <span className="run-badge" data-status={run.status}>{run.status}</span>}
        </div>
        {run && (
          <div className="run-review-meta">
            {run.startedAt ? (
              <span title={isoTitle(run.startedAt)}>Started {fmtDateTime(run.startedAt)}</span>
            ) : (
              <span title={isoTitle(run.createdAt)}>Queued {fmtDateTime(run.createdAt)}</span>
            )}
            {run.finishedAt && (
              <>
                <span className="run-review-meta-sep">·</span>
                <span title={isoTitle(run.finishedAt)}>finished {fmtClock(run.finishedAt)}</span>
              </>
            )}
            {run.startedAt && run.finishedAt && (
              <>
                <span className="run-review-meta-sep">·</span>
                <span>{fmtDuration(run.startedAt, run.finishedAt)}</span>
              </>
            )}
          </div>
        )}
        <div className="run-review-actions">
          {streaming && isActiveRun && (
            <button className="btn-cancel btn-sm" onClick={() => onCancel(runId)} title="Cancel this run">
              Cancel
            </button>
          )}
        </div>
      </div>

      {snapshot ? (
        // Canvas is the captured graph — accurate to the run. Only flag it when it
        // differs from the live workflow, as an informational note (not a warning).
        versionMismatch && (
          <div className="run-review-note">
            ℹ Showing workflow v{run!.workflowVersion} as it ran (current is v{workflow.version}).
          </div>
        )
      ) : isDirty ? (
        <div className="run-review-warning">
          ⚠ This workflow has unsaved edits — the canvas does not match what actually executed.
          Node results below are accurate to the run.
        </div>
      ) : versionMismatch && (
        <div className="run-review-warning">
          ⚠ This workflow was modified since this run (run v{run!.workflowVersion} / current v{workflow.version}).
          The canvas may not match what actually executed.
        </div>
      )}

      <div className="run-panel-tabs run-review-tabs">
        <button className="run-panel-tab" data-active={tab === 'nodes' ? 'true' : undefined} onClick={() => setTab('nodes')}>
          Nodes
        </button>
        <button className="run-panel-tab" data-active={tab === 'log' ? 'true' : undefined} onClick={() => setTab('log')}>
          Log
        </button>
      </div>

      {tab === 'nodes' && (
        <div className="run-review-nodes">
          {timeline.length === 0 ? (
            <div className="run-detail-empty">
              {streaming ? 'Waiting for node results…' : 'No node results recorded for this run.'}
            </div>
          ) : (
            timeline.map((r) => {
              const onCanvas = known.has(r.nodeId);
              const iterCount = r.iterations?.length ?? 0;
              return (
                <button
                  key={r.nodeId}
                  className="run-detail-node"
                  data-status={r.status}
                  data-active={selectedNodeId === r.nodeId ? 'true' : undefined}
                  data-missing={onCanvas ? undefined : 'true'}
                  onClick={() => focusNode(r.nodeId)}
                  title={onCanvas ? undefined : 'This node no longer exists on the canvas'}
                >
                  <span className="run-detail-node-status-dot" data-status={r.status} />
                  <span className="run-detail-node-name">
                    {nodeName(r.nodeId)}
                    {iterCount > 0 && <span className="run-review-iter-badge">×{iterCount + 1}</span>}
                    {!onCanvas && <span className="run-review-missing-tag">removed</span>}
                  </span>
                  <span className="run-detail-node-timing">
                    {r.startedAt > 0 && (
                      <span className="run-detail-node-time" title={isoTitle(r.startedAt)}>{fmtClock(r.startedAt)}</span>
                    )}
                    <span className="run-detail-node-dur">{fmtDuration(r.startedAt, r.finishedAt)}</span>
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}

      {tab === 'log' && (
        <div className="run-review-log-wrap">
          <div className="run-review-log-toolbar">
            {logs.length > 0 && (
              <>
                <button
                  className="btn-secondary btn-sm"
                  onClick={() => setLogsOnly((v) => !v)}
                  title={logsOnly ? 'Show all log entries' : 'Show only explicit log messages'}
                >
                  {logsOnly ? 'All' : 'Logs only'}
                </button>
                <button
                  className="btn-secondary btn-sm"
                  onClick={() => void navigator.clipboard.writeText(
                    visibleLogs.map((e) => (e.ts != null ? `${fmtClock(e.ts)}  ${e.text}` : e.text)).join('\n'),
                  )}
                  title="Copy log to clipboard"
                >
                  Copy log
                </button>
              </>
            )}
          </div>
          <div
            className="run-panel-log run-review-log"
            ref={logRef}
            onScroll={() => {
              const el = logRef.current;
              if (!el) return;
              stickedRef.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 8;
            }}
          >
            {visibleLogs.length === 0 ? (
              <span className="run-panel-log-empty">
                {logs.length === 0 ? 'No log output for this run.' : 'No explicit log messages in this run.'}
              </span>
            ) : (
              visibleLogs.map((entry, i) => (
                <div key={i} className="log-line">
                  {entry.ts != null && (
                    <span className="log-ts" title={isoTitle(entry.ts)}>{fmtClock(entry.ts)}</span>
                  )}
                  <span className="log-line-text">{renderLogLine(entry.text, focusNode)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
