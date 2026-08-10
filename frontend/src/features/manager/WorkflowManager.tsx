import { useRef, useState, useEffect } from 'react';
import { useWorkflowStore } from '../../state/workflowStore';
import { navigate } from '../../state/route';
import type { Workflow } from '../../types/workflow';
import { WorkflowCard } from './WorkflowCard';
import { downloadWorkflow } from '../../utils/downloadWorkflow';

type SortOrder = 'modified' | 'alpha';
const SORT_KEY = 'manager:workflows:sort';

export const WorkflowManager = () => {
  const workflows = useWorkflowStore((s) => s.workflows);
  const createWorkflow = useWorkflowStore((s) => s.createWorkflow);
  const deleteWorkflow = useWorkflowStore((s) => s.deleteWorkflow);
  const cloneWorkflow = useWorkflowStore((s) => s.cloneWorkflow);
  const importWorkflow = useWorkflowStore((s) => s.importWorkflow);
  const updateWorkflowMeta = useWorkflowStore((s) => s.updateWorkflowMeta);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [sortOrder, setSortOrderRaw] = useState<SortOrder>(
    () => (localStorage.getItem(SORT_KEY) ?? 'modified') as SortOrder,
  );
  const [search, setSearch] = useState('');
  const [showDeprecated, setShowDeprecated] = useState(false);
  const [lastRuns, setLastRuns] = useState<Record<string, number>>({});

  // Most recent run timestamp per workflow, for the "last ran" badge on each tile.
  useEffect(() => {
    let cancelled = false;
    void fetch('/workflows/last-runs')
      .then((r) => (r.ok ? r.json() as Promise<Record<string, number>> : null))
      .then((m) => { if (!cancelled && m) setLastRuns(m); })
      .catch(() => { /* leave empty — tiles show "Never run" */ });
    return () => { cancelled = true; };
  }, []);

  const setSortOrder = (v: SortOrder) => {
    localStorage.setItem(SORT_KEY, v);
    setSortOrderRaw(v);
  };

  const handleNew = () => {
    const id = createWorkflow(`Workflow ${workflows.length + 1}`);
    navigate({ space: 'workflows', workflowId: id });
  };

  const handleOpen = (id: string) => {
    navigate({ space: 'workflows', workflowId: id });
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string) as Partial<Workflow>;
        if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
          throw new Error('Not a valid workflow file');
        }
        importWorkflow({
          id: crypto.randomUUID(),
          name: parsed.name ?? 'Imported Workflow',
          description: parsed.description ?? '',
          version: parsed.version ?? 1,
          nodes: parsed.nodes,
          edges: parsed.edges,
          variables: parsed.variables ?? {},
          layoutDirection: parsed.layoutDirection ?? 'TB',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      } catch {
        // Could wire up a toast; intentionally silent for now
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const deprecatedCount = workflows.filter((wf) => wf.deprecated).length;
  const q = search.trim().toLowerCase();
  // Deprecated workflows are hidden by default (kept only for run history); the
  // toggle reveals them. A search still only looks within the visible set.
  const base = showDeprecated ? workflows : workflows.filter((wf) => !wf.deprecated);
  const filtered = q
    ? base.filter((wf) =>
        wf.name.toLowerCase().includes(q) ||
        (wf.description ?? '').toLowerCase().includes(q),
      )
    : base;
  const sorted = [...filtered].sort((a, b) =>
    sortOrder === 'alpha' ? a.name.localeCompare(b.name) : b.updatedAt - a.updatedAt,
  );

  return (
    <div className="manager">
      <div className="manager-header">
        <span className="manager-title">Workflows</span>
        <div className="manager-header-actions">
          <input
            className="manager-search"
            type="search"
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="manager-sort"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as SortOrder)}
            title="Sort order"
          >
            <option value="modified">Last modified</option>
            <option value="alpha">Alphabetically</option>
          </select>
          {deprecatedCount > 0 && (
            <label className="manager-show-deprecated" title="Deprecated workflows are hidden by default">
              <input
                type="checkbox"
                checked={showDeprecated}
                onChange={(e) => setShowDeprecated(e.target.checked)}
              />
              Show deprecated ({deprecatedCount})
            </label>
          )}
          <button className="btn-secondary" onClick={() => fileInputRef.current?.click()}>
            Import
          </button>
          <button className="btn-primary" onClick={handleNew}>
            + New Workflow
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          style={{ display: 'none' }}
          onChange={handleImportFile}
        />
      </div>

      {sorted.length === 0 ? (
        <div className="manager-empty">
          {q ? (
            <p>No workflows match &ldquo;{search}&rdquo;.</p>
          ) : (
            <>
              <p>No workflows yet.</p>
              <button className="btn-primary" onClick={handleNew}>Create your first workflow</button>
            </>
          )}
        </div>
      ) : (
        <div className="manager-grid">
          {sorted.map((wf) => (
            <WorkflowCard
              key={wf.id}
              workflow={wf}
              lastRunAt={lastRuns[wf.id]}
              onOpen={() => handleOpen(wf.id)}
              onViewRuns={() => navigate({ space: 'jobs', workflowId: [wf.id] })}
              onClone={() => cloneWorkflow(wf.id)}
              onDelete={(purge) => void deleteWorkflow(wf.id, purge)}
              onExport={() => downloadWorkflow(wf)}
              onRename={(name) => updateWorkflowMeta(wf.id, { name })}
              onDescribe={(description) => updateWorkflowMeta(wf.id, { description })}
            />
          ))}
        </div>
      )}
    </div>
  );
};
