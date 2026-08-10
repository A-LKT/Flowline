import { useCallback, useEffect, useMemo, useState } from 'react';
import { DiffEditor } from '@monaco-editor/react';
import { X, RotateCcw, Clock, AlertTriangle } from 'lucide-react';
import { useSettingsStore } from '../state/settingsStore';

export type ArtifactHistoryType = 'workflow' | 'script' | 'trigger';

type Props = {
  type: ArtifactHistoryType;
  id: string;
  name: string;
  /** The current live artifact object — the default right-hand side of the diff. */
  current: unknown;
  /** For the workflow editor: warn that restoring discards unsaved edits. */
  dirty?: boolean;
  /** Apply a past version to the live artifact (overwrite in place). */
  onRestore: (data: unknown) => Promise<void> | void;
  onClose: () => void;
};

type VersionMeta = { version: number; createdAt: number; bytes: number };
// 'current' is the live artifact; a number is a stored history version.
type Side = number | 'current';

function relTime(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const pretty = (v: unknown): string => {
  try { return JSON.stringify(v, null, 2); } catch { return String(v); }
};

// A reusable version-history browser: lists saved versions, shows a side-by-side
// JSON diff between any two (or a version vs. the current live artifact), and
// restores a chosen version in place.
export function ArtifactHistoryModal({ type, id, name, current, dirty, onRestore, onClose }: Props) {
  const theme = useSettingsStore((s) => s.theme);
  const [versions, setVersions] = useState<VersionMeta[] | null>(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<number | null>(null);   // the version to restore / left side
  const [compareTo, setCompareTo] = useState<Side>('current');     // right side
  const [dataCache, setDataCache] = useState<Record<number, unknown>>({});
  const [confirming, setConfirming] = useState(false);
  const [restoring, setRestoring] = useState(false);

  // Load the version list.
  useEffect(() => {
    let cancelled = false;
    void fetch(`/artifact-history/${type}/${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? r.json() as Promise<{ versions: VersionMeta[] }> : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => { if (!cancelled) { setVersions(d.versions); setSelected(d.versions[0]?.version ?? null); } })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load history'); });
    return () => { cancelled = true; };
  }, [type, id]);

  // Fetch (and cache) a version's full data on demand.
  const fetchVersion = useCallback(async (v: number) => {
    if (dataCache[v] !== undefined) return;
    try {
      const r = await fetch(`/artifact-history/${type}/${encodeURIComponent(id)}/${v}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json() as { data: unknown };
      setDataCache((c) => ({ ...c, [v]: d.data }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load version');
    }
  }, [type, id, dataCache]);

  useEffect(() => { if (selected != null) void fetchVersion(selected); }, [selected, fetchVersion]);
  useEffect(() => { if (typeof compareTo === 'number') void fetchVersion(compareTo); }, [compareTo, fetchVersion]);

  // Close on Escape (stop the app-level ESC nav from also firing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const dataFor = (side: Side): unknown => (side === 'current' ? current : dataCache[side]);
  const labelFor = (side: Side): string => (side === 'current' ? 'Current (live)' : `Version ${side}`);

  const leftData = selected != null ? dataFor(selected) : undefined;   // the version (original)
  const rightData = dataFor(compareTo);                                 // comparison target
  const ready = leftData !== undefined && rightData !== undefined;

  const leftText = useMemo(() => (leftData !== undefined ? pretty(leftData) : ''), [leftData]);
  const rightText = useMemo(() => (rightData !== undefined ? pretty(rightData) : ''), [rightData]);

  const doRestore = async () => {
    if (selected == null || leftData === undefined) return;
    setRestoring(true);
    try {
      await onRestore(leftData);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Restore failed');
      setRestoring(false);
      setConfirming(false);
    }
  };

  return (
    <div
      className="modal-overlay"
      // stopPropagation so a modal rendered inside a clickable host (e.g. a
      // trigger card) doesn't bubble clicks back to that host.
      onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="modal ahm-modal">
        <div className="modal-header">
          <span className="modal-title"><Clock size={15} strokeWidth={2} /> History — {name}</span>
          <button className="modal-close" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>

        <div className="ahm-body">
          <aside className="ahm-list">
            {error && <div className="admin-error" style={{ padding: 8 }}>{error}</div>}
            {versions === null && !error && <div className="ahm-empty">Loading…</div>}
            {versions && versions.length === 0 && (
              <div className="ahm-empty">No previous versions yet. A version is saved each time you change this {type}.</div>
            )}
            {versions?.map((v) => (
              <button
                key={v.version}
                className={`ahm-item${selected === v.version ? ' ahm-item--active' : ''}`}
                onClick={() => setSelected(v.version)}
              >
                <span className="ahm-item-v">v{v.version}</span>
                <span className="ahm-item-time" title={new Date(v.createdAt).toLocaleString()}>{relTime(v.createdAt)}</span>
                <span className="ahm-item-bytes">{(v.bytes / 1024).toFixed(1)} KB</span>
              </button>
            ))}
          </aside>

          <main className="ahm-main">
            <div className="ahm-toolbar">
              <div className="ahm-compare">
                <span className="ahm-side-label ahm-side-label--left">{selected != null ? `Version ${selected}` : '—'}</span>
                <span className="ahm-arrow">vs</span>
                <select
                  className="jobs-filter-select"
                  value={String(compareTo)}
                  onChange={(e) => setCompareTo(e.target.value === 'current' ? 'current' : Number(e.target.value))}
                  title="Compare against"
                >
                  <option value="current">Current (live)</option>
                  {versions?.filter((v) => v.version !== selected).map((v) => (
                    <option key={v.version} value={v.version}>Version {v.version}</option>
                  ))}
                </select>
              </div>
              <div className="ahm-toolbar-spacer" />
              {selected != null && (
                confirming ? (
                  <div className="ahm-confirm">
                    {dirty && (
                      <span className="ahm-warn"><AlertTriangle size={12} strokeWidth={2} /> Discards unsaved edits</span>
                    )}
                    <span className="ahm-confirm-q">Restore v{selected}?</span>
                    <button className="btn-secondary btn-sm" onClick={() => setConfirming(false)} disabled={restoring}>Cancel</button>
                    <button className="btn-primary btn-sm" onClick={() => void doRestore()} disabled={restoring}>
                      {restoring ? 'Restoring…' : 'Confirm'}
                    </button>
                  </div>
                ) : (
                  <button className="btn-primary btn-sm" onClick={() => setConfirming(true)} disabled={!ready}>
                    <RotateCcw size={13} strokeWidth={2} /> Restore v{selected}
                  </button>
                )
              )}
            </div>

            <div className="ahm-diff">
              {ready ? (
                <DiffEditor
                  height="100%"
                  original={leftText}
                  modified={rightText}
                  language="json"
                  theme={theme === 'light' ? 'light' : 'vs-dark'}
                  options={{
                    readOnly: true,
                    renderSideBySide: true,
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    fontSize: 12,
                    automaticLayout: true,
                  }}
                />
              ) : (
                <div className="ahm-empty">{versions && versions.length === 0 ? '' : 'Select a version to compare.'}</div>
              )}
            </div>
            <div className="ahm-legend">
              <span className="ahm-legend-left">Left: {selected != null ? labelFor(selected) : '—'}</span>
              <span className="ahm-legend-right">Right: {labelFor(compareTo)}</span>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
