import { useState, useCallback, useEffect, useRef } from 'react';
import { AppHeader, AppNameLink } from '../../components/AppHeader';
import { Canvas } from '../canvas/Canvas';
import { NodePalette } from '../palette/NodePalette';
import { NodeConfigPanel } from '../config/NodeConfigPanel';
import { RunReviewPanel } from '../simulation/RunReviewPanel';
import { useRunReplay } from '../simulation/useRunReplay';
import { WorkflowManager } from '../manager/WorkflowManager';
import { ResizablePanel } from './ResizablePanel';
import { WorkflowCogMenu } from './WorkflowCogMenu';
import { SettingsButton } from '../../components/SettingsButton';
import { useWorkflowStore } from '../../state/workflowStore';
import { useEditionStore } from '../../state/editionStore';
import { navigate, navigateReplace, registerNavigationBlocker, formatRoute, type Route } from '../../state/route';
import { APP_VERSION } from '../../version';
import type { NodeExecutionResult } from '../../types/workflow';

type Props = {
  /** #/workflows/<id> — open this workflow for editing. */
  workflowId?: string;
  /** #/jobs/<runId> — open the run's workflow read-only for review. */
  reviewRunId?: string;
  onHome: () => void;
};

export const WorkflowsSpace = ({ workflowId, reviewRunId, onHome }: Props) => {
  // When arriving via #/jobs/<runId> the URL carries no workflow id, so resolve it
  // from the run once. In edit mode this stays null and `workflowId` is used.
  const [resolvedWfId, setResolvedWfId] = useState<string | null>(null);
  const assistantEnabled = useEditionStore((s) => s.features.assistant);
  useEffect(() => {
    if (!reviewRunId) { setResolvedWfId(null); return; }
    let cancelled = false;
    void fetch(`/runs/${reviewRunId}`)
      .then((r) => (r.ok ? r.json() as Promise<{ workflowId?: string }> : null))
      .then((run) => {
        if (cancelled) return;
        if (run?.workflowId) setResolvedWfId(run.workflowId);
        else navigateReplace({ space: 'jobs' }); // run gone → back to the list
      })
      .catch(() => { if (!cancelled) navigateReplace({ space: 'jobs' }); });
    return () => { cancelled = true; };
  }, [reviewRunId]);

  const effectiveWorkflowId = workflowId ?? resolvedWfId ?? undefined;

  // The editor chrome is shown once we have a workflow to render (edit or review).
  const inEditor = !!effectiveWorkflowId;

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [pendingTarget, setPendingTarget] = useState<Route | null>(null);

  const activeWorkflow      = useWorkflowStore((s) => s.workflows.find((w) => w.id === s.activeWorkflowId));
  const undo                = useWorkflowStore((s) => s.undo);
  const redo             = useWorkflowStore((s) => s.redo);
  const reviewSnapshot   = useWorkflowStore((s) => s.reviewSnapshot);
  // While reviewing with a captured graph, the canvas renders the snapshot — so
  // its layout direction (handle/edge orientation) must come from the snapshot,
  // not the live workflow which may since have been toggled.
  const layoutDirection  = useWorkflowStore(
    (s) => s.workflows.find((w) => w.id === s.activeWorkflowId)?.layoutDirection ?? 'TB',
  );
  const effectiveLayoutDirection = reviewSnapshot?.layoutDirection ?? layoutDirection;
  const setLayoutDirection = useWorkflowStore((s) => s.setLayoutDirection);
  const applyAutoLayout    = useWorkflowStore((s) => s.applyAutoLayout);
  const isDirty            = useWorkflowStore((s) => s.isDirty);
  const saveWorkflows      = useWorkflowStore((s) => s.saveWorkflows);
  const discardChanges     = useWorkflowStore((s) => s.discardChanges);

  // Starting a run persists the workflow, kicks off the backend run, then hands
  // off to the Jobs view to watch it — the editor itself no longer streams
  // progress. `starting` guards against a double-fire; `runError` surfaces a
  // save/start failure inline in the toolbar.
  const [starting, setStarting] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  const runWorkflow = useCallback(async () => {
    const wf = useWorkflowStore.getState().workflows.find((w) => w.id === useWorkflowStore.getState().activeWorkflowId);
    if (!wf || starting) return;
    setStarting(true);
    setRunError(null);
    try {
      // The backend runs the persisted version — flush unsaved canvas edits first.
      if (useWorkflowStore.getState().isDirty) {
        await useWorkflowStore.getState().saveWorkflows();
        if (useWorkflowStore.getState().isDirty) {
          throw new Error('Could not save the workflow before running — is the backend reachable?');
        }
      }
      const res = await fetch(`/workflows/${wf.id}/run`, { method: 'POST' });
      if (!res.ok) throw new Error(`Failed to start run: HTTP ${res.status}`);
      // We just persisted, so the unsaved-changes blocker has nothing to guard —
      // and its isDirtyRef may still be flushing. Bypass it explicitly.
      navigate({ space: 'jobs', workflowId: [wf.id] }, { force: true });
    } catch (err) {
      setRunError(err instanceof Error ? err.message : 'Failed to start run');
      setStarting(false); // on success we navigate away, so only reset on failure
    }
  }, [starting]);

  // Run-review mode: a past (or live) run is overlaid on the canvas, which is then
  // read-only. The left column shows the run's node list + log instead of the palette.
  const replayRunId = useWorkflowStore((s) => s.replayRunId);
  const reviewing   = !!replayRunId;
  const focusNode   = useWorkflowStore((s) => s.focusNode);
  const execResults = useWorkflowStore((s) => s.execution.results);

  // On opening a run, zoom the canvas to whatever the reviewer most needs to see:
  // the node currently running (live run) or, failing that, the first node that
  // failed. Only when nothing is running or errored do we fall back to the node
  // that executed first. Prefer the earliest startedAt within each tier so ties
  // resolve to the head of the run (junction nodes record 0 and are skipped).
  //
  // The decision is debounced, not taken on the first result: replay streams a
  // live run's history as a burst (node:start → node:complete → node:start …),
  // so picking on the first event would lock onto whichever node started first —
  // which is momentarily 'running' before its own :complete lands a tick later.
  // Rescheduling on every result update lets the burst settle, then we read the
  // latest store state so the genuinely-running node wins. The debounce also
  // defers the focus past mount so ReactFlow has measured the nodes (fitView
  // against unmeasured geometry silently no-ops). Fires once per reviewed run.
  const focusedRunRef = useRef<string | null>(null);
  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    // Leaving review / switching runs: reset so the next run focuses again, and
    // drop any pending timer.
    if (!reviewing || !replayRunId) {
      focusedRunRef.current = null;
      if (focusTimerRef.current) { clearTimeout(focusTimerRef.current); focusTimerRef.current = null; }
      return;
    }
    if (focusedRunRef.current === replayRunId) return; // already focused this run
    const started = Object.values(execResults).filter((r) => (r.startedAt ?? 0) > 0);
    if (started.length === 0) return;                  // wait for results to arrive
    // Reschedule on each update so the timer only fires once the stream is quiet.
    if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
    focusTimerRef.current = setTimeout(() => {
      focusTimerRef.current = null;
      if (focusedRunRef.current === replayRunId) return;
      const settled = Object.values(useWorkflowStore.getState().execution.results)
        .filter((r) => (r.startedAt ?? 0) > 0);
      if (settled.length === 0) return;
      const earliest = (rs: NodeExecutionResult[]) => rs.reduce((a, b) => (a.startedAt <= b.startedAt ? a : b));
      const running = settled.filter((r) => r.status === 'running');
      const failed  = settled.filter((r) => r.status === 'error');
      const target =
        running.length ? earliest(running) :
        failed.length  ? earliest(failed)  :
        earliest(settled);
      focusedRunRef.current = replayRunId;
      focusNode(target.nodeId);
    }, 400);
  }, [reviewing, replayRunId, execResults, focusNode]);
  useEffect(() => () => { if (focusTimerRef.current) clearTimeout(focusTimerRef.current); }, []);

  const { replayRun, stopReplay, streaming } = useRunReplay(activeWorkflow);
  const replayRunRef  = useRef(replayRun);
  const stopReplayRef = useRef(stopReplay);
  useEffect(() => { replayRunRef.current = replayRun; stopReplayRef.current = stopReplay; });

  const [leftCollapsed,   setLeftCollapsed]   = useState(false);
  const [rightCollapsed,  setRightCollapsed]  = useState(false);

  const canvasWrapRef = useRef<HTMLDivElement>(null);

  const cancelReviewedRun = useCallback((runId: string) => {
    void fetch(`/runs/${runId}`, { method: 'DELETE' });
  }, []);

  // Drive the store's active workflow from the URL. setActiveWorkflow wipes undo
  // history + execution state, so only call it on a genuine id change. A URL
  // pointing at a missing workflow (deleted / bad deep-link) falls back to the list.
  useEffect(() => {
    if (!effectiveWorkflowId) return;
    const { workflows, activeWorkflowId, setActiveWorkflow } = useWorkflowStore.getState();
    if (!workflows.some((w) => w.id === effectiveWorkflowId)) {
      navigateReplace(reviewRunId ? { space: 'jobs' } : { space: 'workflows' });
      return;
    }
    // A deprecated workflow is read-only history — never open it in the editor.
    // Gate on the URL's workflowId (edit route), not the review-resolved id, so a
    // deprecated workflow's run review (#/jobs/<runId>) still renders. Send edit
    // attempts to this workflow's run list instead.
    if (!reviewRunId && workflowId) {
      const wf = workflows.find((w) => w.id === workflowId);
      if (wf?.deprecated) { navigateReplace({ space: 'jobs', workflowId: [workflowId] }); return; }
    }
    if (effectiveWorkflowId !== activeWorkflowId) setActiveWorkflow(effectiveWorkflowId);
  }, [effectiveWorkflowId, reviewRunId, workflowId]);

  // Enter/exit run review from the URL. Declared AFTER the setActiveWorkflow effect
  // so a fresh workflow is active before replay populates execution state (setActive
  // Workflow resets execution). Guards on identity so a mid-switch render can't replay
  // against the previous workflow.
  useEffect(() => {
    if (reviewRunId) {
      if (activeWorkflow?.id === effectiveWorkflowId && replayRunId !== reviewRunId) {
        replayRunRef.current(reviewRunId);
      }
    } else if (replayRunId) {
      stopReplayRef.current();
    }
  }, [reviewRunId, effectiveWorkflowId, activeWorkflow?.id, replayRunId]);

  // Ending review / leaving the editor entirely closes the stream and clears state.
  useEffect(() => () => { stopReplayRef.current(); }, []);

  useEffect(() => { setSelectedIds([]); }, [effectiveWorkflowId]);

  // Entering review mode: make sure the left column (run list + log) is visible.
  useEffect(() => { if (reviewing) setLeftCollapsed(false); }, [reviewing]);

  // Window title
  useEffect(() => {
    document.title = inEditor && activeWorkflow
      ? `workflow: ${activeWorkflow.name}`
      : 'Flowline';
    return () => { document.title = 'Flowline'; };
  }, [inEditor, activeWorkflow?.name]);

  // Unsaved-changes guard: block any navigation that leaves the current editor
  // while there are unsaved edits — including a browser Back — and surface the
  // Save / Discard prompt. The blocker runs in the route layer, so it can veto
  // and restore the URL before this component would otherwise unmount.
  const isDirtyRef = useRef(isDirty);
  useEffect(() => { isDirtyRef.current = isDirty; }, [isDirty]);
  useEffect(() => {
    return registerNavigationBlocker((to, from) => {
      const leavingEditor =
        from.space === 'workflows' && !!from.workflowId &&
        !(to.space === 'workflows' && to.workflowId === from.workflowId);
      if (leavingEditor && isDirtyRef.current) {
        setPendingTarget(to);
        setConfirmLeave(true);
        return false;
      }
      return true;
    });
  }, []);

  const leaveTo = useCallback((target: Route | null) => {
    setConfirmLeave(false);
    setPendingTarget(null);
    navigate(target ?? { space: 'workflows' }, { force: true });
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && confirmLeave) { setConfirmLeave(false); setPendingTarget(null); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [confirmLeave]);

  const allCollapsed = leftCollapsed && rightCollapsed;
  const toggleAllPanels = useCallback(() => {
    const next = !allCollapsed;
    setLeftCollapsed(next);
    setRightCollapsed(next);
  }, [allCollapsed]);

  const handleSelectionChange = useCallback((ids: string[]) => setSelectedIds(ids), []);

  // Resolving the run's workflow for a #/jobs/<runId> deep link — hold the editor
  // chrome (don't flash the workflow-manager list).
  if (reviewRunId && !effectiveWorkflowId) {
    return (
      <div className="app-shell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text2)' }}>
        Loading run…
      </div>
    );
  }

  if (!inEditor) {
    return (
      <div className="app-shell">
        <AppHeader onHome={onHome} title="Workflows" />
        <WorkflowManager />
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="toolbar">
        <AppNameLink />
        <span className="header-badge">v{APP_VERSION}</span>
        <div className="toolbar-divider" />

        {confirmLeave ? (
          <>
            <span className="toolbar-leave-msg">Unsaved changes</span>
            <button className="btn-primary" onClick={() => { saveWorkflows(); leaveTo(pendingTarget); }}>
              Save &amp; leave
            </button>
            <button className="btn-secondary" onClick={() => { discardChanges(); leaveTo(pendingTarget); }}>
              Discard
            </button>
            <button className="btn-secondary" onClick={() => { setConfirmLeave(false); setPendingTarget(null); }}>Cancel</button>
          </>
        ) : reviewing ? (
          <>
            <button className="btn-secondary" onClick={() => navigate({ space: 'jobs' })}>← Jobs</button>
            <div className="toolbar-divider" />
            <span className="toolbar-workflow-name">{activeWorkflow?.name ?? 'Untitled'}</span>
            <span className="toolbar-review-badge">👁 Reviewing run {replayRunId!.slice(0, 8)}</span>
            <div className="toolbar-spacer" />
            {assistantEnabled && reviewRunId && (
              <button
                className="btn-secondary toolbar-link-btn"
                onClick={() => navigate({ space: 'assistant', troubleshootRunId: reviewRunId })}
                title="Open the Copilot in a new chat pre-scoped to this run and its workflow"
              >
                🤖 Troubleshoot with Copilot
              </button>
            )}
            {activeWorkflow && !activeWorkflow.deprecated && (
              <a
                className="btn-secondary toolbar-link-btn"
                href={formatRoute({ space: 'workflows', workflowId: activeWorkflow.id })}
                target="_blank"
                rel="noopener noreferrer"
                title="Open this workflow for editing in a new tab"
              >
                ↗ Edit workflow
              </a>
            )}
            <button
              className="btn-primary"
              onClick={() => activeWorkflow && navigate({ space: 'workflows', workflowId: activeWorkflow.id })}
              title="Open this workflow for editing"
            >
              ✕ Exit review
            </button>
            <div className="toolbar-divider" />
            <SettingsButton />
          </>
        ) : (
          <>
            <button className="btn-secondary" onClick={() => navigate({ space: 'workflows' })}>← Workflows</button>
            <div className="toolbar-divider" />
            <span className="toolbar-workflow-name">{activeWorkflow?.name ?? 'Untitled'}</span>
            {activeWorkflow && (
              <WorkflowCogMenu workflow={activeWorkflow} canvasWrapRef={canvasWrapRef} />
            )}
            <div className="toolbar-spacer" />
            <button onClick={undo} className="btn-secondary">↩ Undo</button>
            <button onClick={redo} className="btn-secondary">↪ Redo</button>
            <div className="toolbar-divider" />

            <button
              className="btn-secondary"
              onClick={() => setLayoutDirection(layoutDirection === 'TB' ? 'LR' : 'TB')}
              title="Toggle layout direction"
            >
              {layoutDirection === 'TB' ? '↕ Vertical' : '↔ Horizontal'}
            </button>
            <button className="btn-secondary" onClick={applyAutoLayout} title="Auto-arrange nodes">
              Auto Layout
            </button>
            <div className="toolbar-divider" />
            <button
              className={isDirty ? 'btn-primary' : 'btn-secondary'}
              onClick={saveWorkflows}
              disabled={!isDirty}
            >
              {isDirty ? '● Save' : 'Saved'}
            </button>
            <div className="toolbar-divider" />
            <button
              className="btn-run"
              onClick={() => void runWorkflow()}
              disabled={starting || !activeWorkflow || activeWorkflow.nodes.length === 0}
              data-running={starting ? 'true' : undefined}
              title="Run this workflow and watch it in Jobs"
            >
              {starting ? '⏳ Starting…' : '▶ Run'}
            </button>
            {runError && (
              <span className="toolbar-run-error" title={runError}>⚠ {runError}</span>
            )}
            <div className="toolbar-divider" />
            <button
              className="btn-secondary"
              onClick={toggleAllPanels}
              title={allCollapsed ? 'Expand all panels' : 'Collapse all panels'}
            >
              {allCollapsed ? '⊞ Expand All' : '⊟ Collapse All'}
            </button>
            <div className="toolbar-divider" />
            <SettingsButton />
          </>
        )}
      </div>

      <div className="main-area">
        <ResizablePanel side="left" defaultWidth={reviewing ? 280 : 220} minWidth={160} maxWidth={480} storageKey="wf:panel-left"
          collapsed={leftCollapsed} onCollapsedChange={setLeftCollapsed}>
          {reviewing && activeWorkflow ? (
            <RunReviewPanel
              runId={replayRunId!}
              workflow={activeWorkflow}
              selectedNodeId={selectedIds.length === 1 ? selectedIds[0] : null}
              streaming={streaming}
              onCancel={cancelReviewedRun}
            />
          ) : (
            <NodePalette />
          )}
        </ResizablePanel>

        <div className="canvas-area">
          <div className="canvas-wrap" ref={canvasWrapRef}>
            <Canvas
              onSelectionChange={handleSelectionChange}
              layoutDirection={effectiveLayoutDirection}
              reviewing={reviewing}
            />
          </div>
        </div>

        <ResizablePanel side="right" defaultWidth={260} minWidth={180} maxWidth={560} storageKey="wf:panel-right"
          collapsed={rightCollapsed} onCollapsedChange={setRightCollapsed}>
          <NodeConfigPanel key={selectedIds[0] ?? ''} selectedIds={selectedIds} reviewStreaming={streaming} />
        </ResizablePanel>
      </div>
    </div>
  );
};
