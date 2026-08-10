import { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, Columns3 } from 'lucide-react';
import { AppHeader } from '../../components/AppHeader';
import { MultiSelectComboBox, type ComboOption } from '../../components/MultiSelectComboBox';
import { useWorkflowStore } from '../../state/workflowStore';
import { navigate } from '../../state/route';
import type { Run, RunStatus } from '../../types/workflow';

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatAge(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function formatDateTime(ts: number | null): string {
  if (!ts) return '—';
  const d = new Date(ts);
  const date = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return `${date} ${time}`;
}

function formatDuration(startedAt: number | null, finishedAt: number | null): string {
  if (!startedAt || !finishedAt) return '—';
  const ms = finishedAt - startedAt;
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

// ─── Column definitions ───────────────────────────────────────────────────────

type ColumnKey = 'workflow' | 'runId' | 'trigger' | 'queued' | 'startedAt' | 'finishedAt' | 'duration';

const COLUMN_DEFS: { key: ColumnKey; label: string }[] = [
  { key: 'workflow',   label: 'Workflow' },
  { key: 'runId',      label: 'Run ID' },
  { key: 'trigger',    label: 'Trigger' },
  { key: 'queued',     label: 'Queued' },
  { key: 'startedAt',  label: 'Started At' },
  { key: 'finishedAt', label: 'Finished At' },
  { key: 'duration',   label: 'Duration' },
];

const DEFAULT_VISIBLE: ColumnKey[] = ['workflow', 'trigger', 'startedAt', 'finishedAt', 'duration'];
const LS_KEY = 'jobs-visible-columns';

function loadVisibleColumns(): Set<ColumnKey> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return new Set(JSON.parse(raw) as ColumnKey[]);
  } catch { /* ignore */ }
  return new Set(DEFAULT_VISIBLE);
}

function saveVisibleColumns(cols: Set<ColumnKey>): void {
  localStorage.setItem(LS_KEY, JSON.stringify([...cols]));
}

// ─── Column picker ────────────────────────────────────────────────────────────

type ColumnPickerProps = {
  visible: Set<ColumnKey>;
  onChange: (next: Set<ColumnKey>) => void;
};

const ColumnPicker = ({ visible, onChange }: ColumnPickerProps) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const toggle = (key: ColumnKey) => {
    const next = new Set(visible);
    if (next.has(key)) next.delete(key); else next.add(key);
    onChange(next);
  };

  return (
    <div className="col-picker" ref={ref}>
      <button
        className={`btn-secondary btn-sm col-picker-btn${open ? ' col-picker-btn--active' : ''}`}
        onClick={() => setOpen((v) => !v)}
        title="Choose columns"
      >
        <Columns3 size={13} /> Columns
      </button>
      {open && (
        <div className="col-picker-panel">
          {COLUMN_DEFS.map(({ key, label }) => (
            <label key={key} className="col-picker-item">
              <input
                type="checkbox"
                checked={visible.has(key)}
                onChange={() => toggle(key)}
              />
              {label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Main view ────────────────────────────────────────────────────────────────

const ALL_STATUSES: RunStatus[] = ['queued', 'running', 'success', 'error', 'cancelled'];
const ALL_TRIGGERS = ['manual', 'schedule', 'schedule-catchup', 'webhook', 'file-watch', 'email'];

const RANGES: { key: string; label: string; ms: number | null }[] = [
  { key: 'all', label: 'All time', ms: null },
  { key: '1h',  label: 'Last hour', ms: 60 * 60 * 1000 },
  { key: '24h', label: 'Last 24h', ms: 24 * 60 * 60 * 1000 },
  { key: '7d',  label: 'Last 7 days', ms: 7 * 24 * 60 * 60 * 1000 },
];

type Props = {
  filterWorkflowId?: string[];
  filterStatus?: string[];
  filterTrigger?: string[];
  filterRange?: string;
  filterQuery?: string;
  onHome: () => void;
};

export const JobsView = ({ filterWorkflowId, filterStatus, filterTrigger, filterRange, filterQuery, onHome }: Props) => {
  const workflows = useWorkflowStore((s) => s.workflows);

  const [runs, setRuns]         = useState<Run[]>([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [visible, setVisible]   = useState<Set<ColumnKey>>(loadVisibleColumns);

  // Filters live in the URL (#/jobs?workflow=&status=&trigger=&range=&q=) so a
  // filtered list is its own shareable link. Derive from props; write via navigate.
  const wfSet      = filterWorkflowId ?? [];
  const statusSet  = filterStatus  ?? [];
  const triggerSet = filterTrigger ?? [];
  const range      = filterRange   ?? 'all';
  const query      = filterQuery   ?? '';

  const patchFilters = (next: Partial<{ workflowId: string[]; status: string[]; trigger: string[]; range: string; q: string }>) =>
    navigate({
      space:      'jobs',
      workflowId: (next.workflowId ?? wfSet).length ? (next.workflowId ?? wfSet) : undefined,
      status:     (next.status  ?? statusSet).length  ? (next.status  ?? statusSet)  : undefined,
      trigger:    (next.trigger ?? triggerSet).length ? (next.trigger ?? triggerSet) : undefined,
      range:      (next.range ?? range) !== 'all' ? (next.range ?? range) : undefined,
      q:          (next.q ?? query) || undefined,
    });

  const toggleIn = (list: string[], v: string): string[] =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v];

  const rangeMs = RANGES.find((r) => r.key === range)?.ms ?? null;

  const fetchRuns = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (wfSet.length)      params.set('workflow_id', wfSet.join(','));
      if (statusSet.length)  params.set('status', statusSet.join(','));
      if (triggerSet.length) params.set('trigger_type', triggerSet.join(','));
      if (rangeMs != null)   params.set('since', String(Date.now() - rangeMs));
      const res = await fetch(`/runs?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setRuns(await res.json() as Run[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wfSet.join(','), statusSet.join(','), triggerSet.join(','), rangeMs]);

  useEffect(() => { void fetchRuns(); }, [fetchRuns]);

  // Poll while any run is active
  useEffect(() => {
    const hasActive = runs.some((r) => r.status === 'running' || r.status === 'queued');
    if (!hasActive) return;
    const id = setInterval(() => void fetchRuns(), 3000);
    return () => clearInterval(id);
  }, [runs, fetchRuns]);

  const handleVisibleChange = (next: Set<ColumnKey>) => {
    setVisible(next);
    saveVisibleColumns(next);
  };

  const workflowName = (id: string) =>
    workflows.find((w) => w.id === id)?.name ?? `(${id.slice(0, 8)}…)`;

  const liveCount = runs.filter((r) => r.status === 'running' || r.status === 'queued').length;

  // Free-text filter (run-id prefix or workflow name) applied client-side to the
  // loaded page; server-side filters (workflow/status/trigger/time) narrow first.
  const q = query.trim().toLowerCase();
  const visibleRuns = q
    ? runs.filter((r) => r.id.toLowerCase().startsWith(q) || workflowName(r.workflowId).toLowerCase().includes(q))
    : runs;

  // Status + visible optional cols = total colspan (row itself is the click target)
  const colCount = 1 + COLUMN_DEFS.filter((c) => visible.has(c.key)).length;

  const activeFilterCount =
    wfSet.length + statusSet.length + triggerSet.length + (range !== 'all' ? 1 : 0) + (q ? 1 : 0);

  const workflowOptions: ComboOption[] = workflows.map((w) => ({ value: w.id, label: w.name }));
  const triggerOptions: ComboOption[] = ALL_TRIGGERS.map((t) => ({ value: t, label: t }));

  return (
    <div className="app-shell">
      <AppHeader
        onHome={onHome}
        icon={<Activity size={14} style={{ color: 'var(--text2)' }} />}
        title="Jobs"
        titleExtra={liveCount > 0 ? <span className="jobs-live-badge">{liveCount} running</span> : undefined}
      />

      <div className="jobs-view">
        <div className="jobs-filter-bar">
          <MultiSelectComboBox
            options={workflowOptions}
            selected={wfSet}
            onChange={(next) => patchFilters({ workflowId: next })}
            placeholder="All workflows"
            noun="workflows"
            searchable
          />

          <MultiSelectComboBox
            options={triggerOptions}
            selected={triggerSet}
            onChange={(next) => patchFilters({ trigger: next })}
            placeholder="All triggers"
            noun="triggers"
          />

          <div className="jobs-chip-group" role="group" aria-label="Filter by status">
            {ALL_STATUSES.map((s) => (
              <button
                key={s}
                className={`jobs-chip${statusSet.includes(s) ? ' jobs-chip--on' : ''}`}
                data-status={s}
                onClick={() => patchFilters({ status: toggleIn(statusSet, s) })}
              >
                {s}
              </button>
            ))}
          </div>

          <select
            className="jobs-filter-select"
            value={range}
            onChange={(e) => patchFilters({ range: e.target.value })}
            title="Time range"
          >
            {RANGES.map((r) => (
              <option key={r.key} value={r.key}>{r.label}</option>
            ))}
          </select>

          <input
            className="jobs-filter-search"
            type="search"
            placeholder="Run ID or workflow…"
            value={query}
            onChange={(e) => patchFilters({ q: e.target.value })}
          />

          {activeFilterCount > 0 && (
            <button
              className="btn-secondary btn-sm"
              onClick={() => navigate({ space: 'jobs' })}
              title="Clear all filters"
            >
              Clear ({activeFilterCount})
            </button>
          )}

          <button className="btn-secondary btn-sm" onClick={() => void fetchRuns()} disabled={loading}>
            {loading ? '…' : '↻ Refresh'}
          </button>

          <ColumnPicker visible={visible} onChange={handleVisibleChange} />

          {error && <span className="jobs-error">{error}</span>}
        </div>

        <div className="jobs-table-wrap">
          <table className="jobs-table">
            <thead>
              <tr>
                <th>Status</th>
                {COLUMN_DEFS.filter((c) => visible.has(c.key)).map((c) => (
                  <th key={c.key}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!loading && visibleRuns.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className="jobs-empty">No runs found.</td>
                </tr>
              ) : (
                visibleRuns.map((run) => (
                  <tr
                    key={run.id}
                    className="jobs-row jobs-row--clickable"
                    onClick={() => navigate({ space: 'jobs', runId: run.id })}
                    title="Open this run on the canvas"
                  >
                    <td><span className="run-badge" data-status={run.status}>{run.status}</span></td>

                    {visible.has('workflow') && (
                      // Plain text — the whole row opens the run. Editing the workflow
                      // is reachable from the run-review screen (opens in a new tab).
                      <td className="jobs-wf-name">{workflowName(run.workflowId)}</td>
                    )}
                    {visible.has('runId') && (
                      <td className="jobs-run-id">{run.id.slice(0, 8)}</td>
                    )}
                    {visible.has('trigger') && (
                      <td>
                        <span className="run-trigger-badge" data-trigger={run.triggerType}>
                          {run.triggerType}
                        </span>
                      </td>
                    )}
                    {visible.has('queued') && (
                      <td className="jobs-meta jobs-datetime" title={new Date(run.createdAt).toISOString()}>
                        {formatAge(run.createdAt)}
                      </td>
                    )}
                    {visible.has('startedAt') && (
                      <td className="jobs-meta jobs-datetime" title={run.startedAt ? new Date(run.startedAt).toISOString() : ''}>
                        {formatDateTime(run.startedAt)}
                      </td>
                    )}
                    {visible.has('finishedAt') && (
                      <td className="jobs-meta jobs-datetime" title={run.finishedAt ? new Date(run.finishedAt).toISOString() : ''}>
                        {formatDateTime(run.finishedAt)}
                      </td>
                    )}
                    {visible.has('duration') && (
                      <td className="jobs-meta">{formatDuration(run.startedAt, run.finishedAt)}</td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
