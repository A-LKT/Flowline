import { useState } from 'react';
import { useTriggerStore } from '../../state/triggerStore';
import { useWorkflowStore } from '../../state/workflowStore';
import type { Trigger } from '../../types/trigger';
import { TriggerCard } from './TriggerCard';
import { TriggerFormModal } from './TriggerFormModal';

type SortOrder = 'modified' | 'alpha';
const SORT_KEY = 'manager:triggers:sort';
const KIND_KEY = 'manager:triggers:kind';

const KIND_LABEL: Record<string, string> = {
  schedule:     'Schedule',
  webhook:      'Webhook',
  'file-watch': 'File watch',
  email:        'Email',
};

const kindLabel = (kind: string) => KIND_LABEL[kind] ?? kind;

export const TriggerManager = () => {
  const triggers      = useTriggerStore((s) => s.triggers);
  const createTrigger = useTriggerStore((s) => s.createTrigger);
  const updateTrigger = useTriggerStore((s) => s.updateTrigger);
  const deleteTrigger = useTriggerStore((s) => s.deleteTrigger);
  const runTrigger    = useTriggerStore((s) => s.runTrigger);
  const workflows     = useWorkflowStore((s) => s.workflows);

  const [modal, setModal] = useState<'create' | Trigger | null>(null);
  const [sortOrder, setSortOrderRaw] = useState<SortOrder>(
    () => (localStorage.getItem(SORT_KEY) ?? 'modified') as SortOrder,
  );
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilterRaw] = useState<string>(
    () => localStorage.getItem(KIND_KEY) ?? 'all',
  );

  const setSortOrder = (v: SortOrder) => {
    localStorage.setItem(SORT_KEY, v);
    setSortOrderRaw(v);
  };

  const setKindFilter = (v: string) => {
    localStorage.setItem(KIND_KEY, v);
    setKindFilterRaw(v);
  };

  const workflowName = (id: string) => workflows.find((w) => w.id === id)?.name;

  // Kinds actually present, so plugin-registered adapter kinds appear too.
  const kinds = [...new Set(triggers.map((t) => t.kind))].sort((a, b) =>
    kindLabel(a).localeCompare(kindLabel(b)),
  );

  const q = search.trim().toLowerCase();
  const filtered = triggers.filter((t) => {
    if (kindFilter !== 'all' && t.kind !== kindFilter) return false;
    if (!q) return true;
    return (
      t.name.toLowerCase().includes(q) ||
      (t.description ?? '').toLowerCase().includes(q) ||
      (workflowName(t.target.id) ?? '').toLowerCase().includes(q)
    );
  });
  const sorted = [...filtered].sort((a, b) =>
    sortOrder === 'alpha' ? a.name.localeCompare(b.name) : b.updatedAt - a.updatedAt,
  );

  return (
    <div className="manager">
      <div className="manager-header">
        <span className="manager-title">Triggers</span>
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
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value)}
            title="Filter by type"
          >
            <option value="all">All types</option>
            {kinds.map((k) => (
              <option key={k} value={k}>{kindLabel(k)}</option>
            ))}
          </select>
          <select
            className="manager-sort"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as SortOrder)}
            title="Sort order"
          >
            <option value="modified">Last modified</option>
            <option value="alpha">Alphabetically</option>
          </select>
          <button className="btn-primary" onClick={() => setModal('create')}>
            + New Trigger
          </button>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="manager-empty">
          {q || kindFilter !== 'all' ? (
            <p>No triggers match the current filters.</p>
          ) : (
            <>
              <p>No triggers yet.</p>
              <button className="btn-primary" onClick={() => setModal('create')}>Create your first trigger</button>
            </>
          )}
        </div>
      ) : (
        <div className="manager-grid trigger-grid">
          {sorted.map((trigger) => (
            <TriggerCard
              key={trigger.id}
              trigger={trigger}
              workflowName={workflowName(trigger.target.id)}
              onEdit={() => setModal(trigger)}
              onDelete={() => { if (window.confirm(`Delete trigger "${trigger.name}"?`)) void deleteTrigger(trigger.id); }}
              onToggle={(enabled) => void updateTrigger(trigger.id, { enabled })}
              onRunNow={() => runTrigger(trigger.id)}
            />
          ))}
        </div>
      )}

      {modal !== null && (
        <TriggerFormModal
          initial={modal === 'create' ? undefined : modal}
          onSave={async (data) => {
            if (modal === 'create') {
              await createTrigger(data);
            } else {
              await updateTrigger(modal.id, data);
            }
          }}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
};
