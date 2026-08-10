import { useEffect, useState } from 'react';
import { Trash2, Play, Check } from 'lucide-react';

type Config = {
  enabled: boolean;
  maxAgeDays: number;
  keepPerWorkflow: number;
  statuses: string[];
  intervalHours: number;
  vacuum: boolean;
  pruneDeprecated: boolean;
  lastRunAt: number | null;
  lastRemovedRuns: number | null;
};

type RunResult = { removedRuns: number; removedWorkflows: number; removedSnapshots: number; vacuumed: boolean; ranAt: number };

const PURGEABLE_STATUSES = ['success', 'error', 'cancelled'] as const;

export const HousekeepingPanel = () => {
  const [config, setConfig] = useState<Config | null>(null);
  const [totalRuns, setTotalRuns] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [saved, setSaved] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const res = await fetch('/housekeeping/config');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json() as { config: Config; stats: { totalRuns: number } };
      setConfig(d.config);
      setTotalRuns(d.stats.totalRuns);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    }
  };
  useEffect(() => { void load(); }, []);

  const patch = (p: Partial<Config>) => setConfig((c) => (c ? { ...c, ...p } : c));

  const save = async () => {
    if (!config) return;
    setSaving(true); setSaved(false); setError('');
    try {
      const { lastRunAt, lastRemovedRuns, ...body } = config;
      void lastRunAt; void lastRemovedRuns;
      const res = await fetch('/housekeeping/config', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json() as { config: Config };
      setConfig(d.config);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const runNow = async () => {
    setRunning(true); setResult(null); setError('');
    try {
      const res = await fetch('/housekeeping/run', { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json() as { config: Config; result: RunResult };
      setConfig(d.config);
      setResult(d.result);
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Run failed');
    } finally {
      setRunning(false);
    }
  };

  if (!config) return <div className="admin-hint">{error || 'Loading…'}</div>;

  const toggleStatus = (s: string) =>
    patch({ statuses: config.statuses.includes(s) ? config.statuses.filter((x) => x !== s) : [...config.statuses, s] });

  return (
    <div className="hk-panel">
      <label className="hk-row hk-row--toggle">
        <input type="checkbox" checked={config.enabled} onChange={(e) => patch({ enabled: e.target.checked })} />
        <span><strong>Enable scheduled housekeeping</strong> — purge old job runs automatically</span>
      </label>

      <div className="hk-grid">
        <label className="hk-field">
          <span className="hk-field-label">Delete runs older than (days)</span>
          <input type="number" min={0} max={3650} value={config.maxAgeDays}
            onChange={(e) => patch({ maxAgeDays: Math.max(0, parseInt(e.target.value || '0', 10)) })} />
          <span className="hk-field-hint">0 = no age limit</span>
        </label>
        <label className="hk-field">
          <span className="hk-field-label">Keep at most (runs / workflow)</span>
          <input type="number" min={0} max={100000} value={config.keepPerWorkflow}
            onChange={(e) => patch({ keepPerWorkflow: Math.max(0, parseInt(e.target.value || '0', 10)) })} />
          <span className="hk-field-hint">0 = unlimited</span>
        </label>
        <label className="hk-field">
          <span className="hk-field-label">Run every (hours)</span>
          <input type="number" min={1} max={720} value={config.intervalHours}
            onChange={(e) => patch({ intervalHours: Math.max(1, parseInt(e.target.value || '1', 10)) })} />
          <span className="hk-field-hint">how often the scheduler purges</span>
        </label>
      </div>

      <div className="hk-field">
        <span className="hk-field-label">Purge only these statuses</span>
        <div className="hk-status-chips">
          {PURGEABLE_STATUSES.map((s) => (
            <button key={s} type="button"
              className={`jobs-chip${config.statuses.includes(s) ? ' jobs-chip--on' : ''}`}
              onClick={() => toggleStatus(s)}>{s}</button>
          ))}
        </div>
        <span className="hk-field-hint">Active runs (queued / running) are never purged.</span>
      </div>

      <label className="hk-row hk-row--toggle">
        <input type="checkbox" checked={config.pruneDeprecated} onChange={(e) => patch({ pruneDeprecated: e.target.checked })} />
        <span>Also drop deprecated workflows once all their runs are gone</span>
      </label>
      <label className="hk-row hk-row--toggle">
        <input type="checkbox" checked={config.vacuum} onChange={(e) => patch({ vacuum: e.target.checked })} />
        <span>Reclaim disk (VACUUM) after a purge — slower, run sparingly</span>
      </label>

      {error && <div className="admin-error">{error}</div>}

      <div className="hk-actions">
        <button className="btn-primary" onClick={() => void save()} disabled={saving}>
          {saved ? <><Check size={14} strokeWidth={2.5} /> Saved</> : saving ? 'Saving…' : 'Save settings'}
        </button>
        <button className="btn-secondary" onClick={() => void runNow()} disabled={running}>
          <Play size={13} strokeWidth={2} /> {running ? 'Running…' : 'Run now'}
        </button>
        <span className="hk-stat">
          <Trash2 size={12} strokeWidth={2} /> {totalRuns ?? '—'} runs stored
        </span>
        {config.lastRunAt && (
          <span className="hk-stat">Last run {new Date(config.lastRunAt).toLocaleString()} · removed {config.lastRemovedRuns ?? 0}</span>
        )}
      </div>

      {result && (
        <div className="admin-import-result">
          <span className="admin-import-count-badge">
            <Check size={11} strokeWidth={2.5} /> Removed {result.removedRuns} runs
            {result.removedWorkflows > 0 ? `, ${result.removedWorkflows} workflows` : ''}
            {result.removedSnapshots > 0 ? `, ${result.removedSnapshots} snapshots` : ''}
            {result.vacuumed ? ' · disk reclaimed' : ''}
          </span>
        </div>
      )}
    </div>
  );
};
