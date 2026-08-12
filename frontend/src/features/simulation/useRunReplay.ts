import { useEffect, useRef, useState } from 'react';
import { useWorkflowStore } from '../../state/workflowStore';
import type { LogEntry } from '../../state/workflowStore';
import type { NodeExecutionResult, Workflow } from '../../types/workflow';

export type ReplayController = {
  /** Stream a past (or live) run's results/logs into the execution store and enter review mode. */
  replayRun: (runId: string) => void;
  /** Close the stream, clear the reviewed run, and reset execution state. */
  stopReplay: () => void;
  /** True while an SSE stream for the reviewed run is still open (i.e. run is live). */
  streaming: boolean;
};

/**
 * Owns the replay/run-review lifecycle so it survives regardless of which panels
 * are mounted (the review UI lives in the left column, not the bottom panel).
 * Review entry/exit is driven by the URL (`#/jobs/<runId>`) in WorkflowsSpace.
 */
export function useRunReplay(workflow: Workflow | undefined): ReplayController {
  const setExecution          = useWorkflowStore((s) => s.setExecution);
  const addActiveNode         = useWorkflowStore((s) => s.addActiveNode);
  const removeActiveNode      = useWorkflowStore((s) => s.removeActiveNode);
  const setNodeResult         = useWorkflowStore((s) => s.setNodeResult);
  const addLog                = useWorkflowStore((s) => s.addLog);
  const resetExecution        = useWorkflowStore((s) => s.resetExecution);
  const setReplayRunId        = useWorkflowStore((s) => s.setReplayRunId);
  const setReviewSnapshot     = useWorkflowStore((s) => s.setReviewSnapshot);

  const sseRef = useRef<EventSource | null>(null);
  const [streaming, setStreaming] = useState(false);

  const stopReplay = () => {
    sseRef.current?.close();
    sseRef.current = null;
    setStreaming(false);
    setReplayRunId(null);
    setReviewSnapshot(null);
    resetExecution();
  };

  const replayRun = (runId: string) => {
    if (!workflow) return;
    sseRef.current?.close();
    sseRef.current = null;
    resetExecution();
    setReplayRunId(runId);
    setReviewSnapshot(null);
    setStreaming(true);

    // Fetch the graph as it ran so the canvas shows the real historical version,
    // not the live (possibly since-edited) one. 404 → no snapshot (pre-feature or
    // pruned run); leave null so the panel falls back to the mismatch warning.
    // Guard against a fast run-switch: only apply if this run is still the one
    // being reviewed when the fetch resolves.
    void fetch(`/runs/${runId}/workflow-snapshot`)
      .then((r) => (r.ok ? r.json() as Promise<Workflow> : null))
      .then((snap) => {
        if (useWorkflowStore.getState().replayRunId === runId) setReviewSnapshot(snap);
      })
      .catch(() => { /* keep null — fall back to the warning */ });

    let hasNodeEvents = false;
    const sse = new EventSource(`/runs/${runId}/events`);
    sseRef.current = sse;

    const finish = () => { sse.close(); if (sseRef.current === sse) sseRef.current = null; setStreaming(false); };

    sse.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data as string) as Record<string, unknown>;

        if (event.type === 'node:start') {
          hasNodeEvents = true;
          addActiveNode(event.nodeId as string);
          setNodeResult({
            nodeId: event.nodeId as string, status: 'running', output: null,
            startedAt: event.startedAt as number, finishedAt: 0,
            resolvedConfig: event.resolvedConfig as Record<string, unknown> | undefined,
          });
        } else if (event.type === 'node:complete') {
          hasNodeEvents = true;
          removeActiveNode(event.nodeId as string);
          setNodeResult({
            nodeId:     event.nodeId as string,
            status:     event.status as 'success' | 'error',
            input:      event.input,
            output:     event.output,
            error:      event.error as string | undefined,
            startedAt:  event.startedAt as number,
            finishedAt: event.finishedAt as number,
          });
        } else if (event.type === 'log') {
          addLog(event.message as string, 'log', event.ts as number);
        } else if (event.type === 'done') {
          const results = event.results as Record<string, NodeExecutionResult>;
          // Always merge backend-accumulated results (carries iterations)
          const current = useWorkflowStore.getState().execution.results;
          setExecution({ results: { ...current, ...results } });

          if (!hasNodeEvents) {
            // Synthetic done from a finished run — synthesize log lines too. Each
            // carries a `sort` key (separate from the displayed `ts`) so we can
            // interleave node and log lines into one true timeline while still
            // choosing what timestamp to render:
            //   - node line: sort by startedAt; junction nodes have startedAt=0,
            //     which keeps them at the top (structural, run early) and renders
            //     no clock (fmtClock(0) is blank) rather than a bogus 1970.
            //   - log line: sort by its worker ts; legacy entries have ts=null and
            //     sort last (Number.MAX_SAFE_INTEGER), preserving old behaviour.
            const nodeEntries = Object.values(results).map((r) => {
              const wfNode  = workflow.nodes.find((n) => n.id === r.nodeId);
              const name    = wfNode?.name ?? wfNode?.type ?? r.nodeId;
              const dur     = (r.finishedAt ?? 0) - (r.startedAt ?? 0);
              const iterStr = r.iterations && r.iterations.length > 0 ? ` ×${r.iterations.length + 1}` : '';
              const text = r.status === 'error'
                ? `✗ [${name}]${iterStr} ${dur}ms — ${r.error ?? 'unknown error'} · ${r.nodeId}`
                : `✓ [${name}]${iterStr} ${dur}ms · ${r.nodeId}`;
              return { entry: { text, kind: 'node' as const, ts: r.startedAt || null }, sort: r.startedAt ?? 0 };
            });
            // Tolerate both the current { ts, text } shape and the legacy bare
            // string[] a not-yet-upgraded backend may still stream — otherwise a
            // version skew crashes the Log tab on `e.text` of a string.
            const logEntries = (event.logs as (string | { ts: number | null; text: string })[])
              .map((e) => {
                const text = typeof e === 'string' ? e : e.text;
                const ts   = typeof e === 'string' ? null : e.ts;
                return { entry: { text, kind: 'log' as const, ts }, sort: ts ?? Number.MAX_SAFE_INTEGER };
              });
            const ordered: LogEntry[] = [...nodeEntries, ...logEntries]
              .sort((a, b) => a.sort - b.sort)
              .map((x) => x.entry);
            setExecution({ logs: ordered });
          } else {
            addLog('Workflow completed', 'system');
          }
          finish();
        } else if (event.type === 'error') {
          addLog(`[ERROR] ${event.error as string}`, 'system');
          // Mark any nodes that started but never completed as errored
          const { activeNodeIds, results } = useWorkflowStore.getState().execution;
          for (const nodeId of activeNodeIds) {
            const r = results[nodeId];
            if (r) setNodeResult({ ...r, status: 'error', error: event.error as string, finishedAt: Date.now() });
          }
          finish();
        }
      } catch { /* malformed event */ }
    };

    sse.onerror = () => { finish(); };
  };

  // Close the stream if the controller unmounts (e.g. leaving the editor)
  useEffect(() => () => { sseRef.current?.close(); sseRef.current = null; }, []);

  return { replayRun, stopReplay, streaming };
}
