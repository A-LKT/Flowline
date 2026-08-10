import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';

// Configures how many saved versions of each artifact (workflow/script/trigger)
// are retained. Per-artifact history (compare + restore) is available from each
// editor: the workflow cog menu, the Scripts toolbar, and each trigger card.
export const ArtifactHistoryPanel = () => {
  const [keep, setKeep] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void fetch('/artifact-history/config')
      .then((r) => (r.ok ? r.json() as Promise<{ keepVersions: number }> : null))
      .then((d) => { if (d) setKeep(d.keepVersions); })
      .catch(() => setError('Failed to load'));
  }, []);

  const save = async () => {
    if (keep === null) return;
    setSaving(true); setSaved(false); setError('');
    try {
      const res = await fetch('/artifact-history/config', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keepVersions: keep }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (keep === null) return <div className="admin-hint">{error || 'Loading…'}</div>;

  return (
    <div className="hk-panel">
      <p className="admin-hint">
        Every save of a workflow, script, or trigger is snapshotted. The oldest versions beyond the limit
        are pruned automatically.
      </p>
      <div className="hk-actions">
        <label className="hk-field" style={{ maxWidth: 220 }}>
          <span className="hk-field-label">Versions kept per artifact</span>
          <input type="number" min={0} max={500} value={keep}
            onChange={(e) => setKeep(Math.max(0, Math.min(500, parseInt(e.target.value || '0', 10))))} />
          <span className="hk-field-hint">0 disables history capture</span>
        </label>
        <button className="btn-primary" onClick={() => void save()} disabled={saving}>
          {saved ? <><Check size={14} strokeWidth={2.5} /> Saved</> : saving ? 'Saving…' : 'Save'}
        </button>
      </div>
      {error && <div className="admin-error">{error}</div>}
    </div>
  );
};
