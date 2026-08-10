import { lazy, Suspense, type ReactNode } from 'react';
import { HomePage } from './features/home/HomePage';
import { TriggerManager } from './features/triggers/TriggerManager';
import { SecretsPanel } from './features/secrets/SecretsPanel';
import { AppHeader } from './components/AppHeader';
import { JobsView } from './features/jobs/JobsView';
import { ErrorBoundary } from './components/ErrorBoundary';
import { navigate, useRoute, type Route } from './state/route';
import { useEditionStore } from './state/editionStore';
import { useEffect } from 'react';

// Heavy spaces — split into separate chunks so the initial bundle stays lean.
const WorkflowsSpace  = lazy(() => import('./features/workflows/WorkflowsSpace').then((m) => ({ default: m.WorkflowsSpace })));
const ScriptEditorView = lazy(() => import('./features/scripts/ScriptEditorView').then((m) => ({ default: m.ScriptEditorView })));
const DocsView         = lazy(() => import('./features/docs/DocsView').then((m) => ({ default: m.DocsView })));
const DataStoreView    = lazy(() => import('./features/datastore/DataStoreView').then((m) => ({ default: m.DataStoreView })));
const AdminView        = lazy(() => import('./features/admin/AdminView').then((m) => ({ default: m.AdminView })));
const AssistantView    = lazy(() => import('./features/assistant/AssistantView').then((m) => ({ default: m.AssistantView })));
const AssistantLocked  = lazy(() => import('./features/assistant/AssistantView').then((m) => ({ default: m.AssistantLocked })));

// Side-effect imports — register all node types
import './nodes/httpNode';
import './nodes/conditionNode';
import './nodes/scriptNode';
import './nodes/labelNode';
import './nodes/junctionNode';
import './nodes/forkNode';
import './nodes/loopNode';
import './nodes/iteratorNode';
import './nodes/switchNode';
// Control
import './nodes/runWorkflowNode';
import './nodes/delayNode';
import './nodes/setVariableNode';
import './nodes/logNode';
import './nodes/failureNode';
// Data
import './nodes/transformNode';
import './nodes/filterNode';
import './nodes/sortNode';
import './nodes/aggregateNode';
import './nodes/renderTemplateNode';
import './nodes/mathNode';
import './nodes/datetimeNode';
// Data Store
import './nodes/datastoreQueryNode';
import './nodes/datastoreUpsertNode';
// File
import './nodes/parseCsvNode';
import './nodes/formatCsvNode';
import './nodes/readFileNode';
import './nodes/writeFileNode';
import './nodes/listFilesNode';
import './nodes/readLocalFileNode';
import './nodes/moveFileNode';
import './nodes/deleteFileNode';
// Integration
import './nodes/graphqlNode';
import './nodes/pingNode';
// Notification
import './nodes/sendEmailNode';
import './nodes/sendSlackNode';
import './nodes/sendTeamsNode';
import './nodes/sendWhatsappNode';
// Plugins — Vite resolves this glob at build time; each index.ts calls registerNode()
import.meta.glob('./plugins/*/index.ts', { eager: true });

const goHome = () => navigate({ space: 'home' });

// Where ESC takes you from a given route: a detail/editor view backs out to its
// list ("artifact selection"); a list view backs out to home. The workflow
// canvas editor and the run-review canvas own ESC themselves (deselect nodes),
// so they opt out here (null) — leaving them alone also avoids fighting the
// unsaved-changes navigation blocker.
function escapeTarget(r: Route): Route | null {
  switch (r.space) {
    case 'home':      return null;
    case 'workflows': return r.workflowId ? null : { space: 'home' };
    case 'jobs':      return r.runId ? null : { space: 'home' };
    case 'scripts':   return r.scriptId ? { space: 'scripts' } : { space: 'home' };
    case 'datastore': return r.tableId ? { space: 'datastore' } : { space: 'home' };
    case 'docs':
    case 'triggers':
    case 'secrets':
    case 'admin':
    case 'assistant': return { space: 'home' };
  }
}

export default function App() {
  const route = useRoute();
  const assistantEnabled = useEditionStore((s) => s.features.assistant);
  const loadEdition      = useEditionStore((s) => s.loadEdition);
  useEffect(() => { void loadEdition(); }, [loadEdition]);

  // Global ESC navigation. Defers to anything that owns ESC first: an open modal,
  // a focused editable element (input/textarea/select/contentEditable/Monaco), or
  // a handler that already called preventDefault.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (document.querySelector('.modal-overlay')) return;
      const el = document.activeElement as HTMLElement | null;
      if (el) {
        const tag = el.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable) return;
        if (el.closest('.monaco-editor')) return;
      }
      const target = escapeTarget(route);
      if (target) navigate(target);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [route]);

  const shell = ((): ReactNode => {
    switch (route.space) {
      case 'admin':
        return <AdminView onHome={goHome} />;
      case 'datastore':
        return <DataStoreView tableId={route.tableId} onHome={goHome} />;
      case 'workflows':
        return <WorkflowsSpace workflowId={route.workflowId} onHome={goHome} />;
      // A run is reviewed inside the workflow canvas (read-only); `#/jobs/<runId>`.
      // WorkflowsSpace resolves the run's workflow itself.
      case 'scripts':
        return <ScriptEditorView scriptId={route.scriptId} onHome={goHome} />;
      case 'docs':
        return <DocsView pageId={route.pageId} onHome={goHome} />;
      case 'secrets':
        return (
          <div className="app-shell">
            <AppHeader onHome={goHome} title="Secrets" />
            <div className="main-area" style={{ overflow: 'auto' }}>
              <SecretsPanel />
            </div>
          </div>
        );
      case 'triggers':
        return (
          <div className="app-shell">
            <AppHeader onHome={goHome} title="Triggers" />
            <div className="main-area" style={{ overflow: 'auto' }}>
              <TriggerManager />
            </div>
          </div>
        );
      case 'jobs':
        return route.runId
          ? <WorkflowsSpace reviewRunId={route.runId} onHome={goHome} />
          : (
            <JobsView
              filterWorkflowId={route.workflowId}
              filterStatus={route.status}
              filterTrigger={route.trigger}
              filterRange={route.range}
              filterQuery={route.q}
              onHome={goHome}
            />
          );
      case 'assistant':
        return assistantEnabled ? <AssistantView onHome={goHome} troubleshootRunId={route.troubleshootRunId} /> : <AssistantLocked onHome={goHome} />;
      case 'home':
        return <HomePage onNavigate={(r: Route) => navigate(r)} />;
    }
  })();

  return (
    <ErrorBoundary>
      <Suspense fallback={<div className="app-shell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text2)' }}>Loading…</div>}>
        {shell}
      </Suspense>
    </ErrorBoundary>
  );
}
