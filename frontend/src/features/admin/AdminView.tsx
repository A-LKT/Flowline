import { useState, useRef } from 'react';
import { Download, Upload, AlertTriangle, Check, Activity, Server, Power, Trash2, History } from 'lucide-react';
import { AppHeader } from '../../components/AppHeader';
import { HomeStats } from '../home/HomeStats';
import { ServiceStatus } from '../home/ServiceStatus';
import { ExecutionPauseToggle } from './ExecutionPauseToggle';
import { HousekeepingPanel } from './HousekeepingPanel';
import { ArtifactHistoryPanel } from './ArtifactHistoryPanel';
import { useEditionStore } from '../../state/editionStore';

type Props = { onHome: () => void };

type DataSet = 'workflows' | 'scripts' | 'triggers' | 'runs' | 'secrets';

const ALL_SETS: { key: DataSet; label: string; desc: string }[] = [
  { key: 'workflows', label: 'Workflows',  desc: 'All workflow definitions and their node graphs' },
  { key: 'scripts',  label: 'Scripts',     desc: 'All saved scripts' },
  { key: 'triggers', label: 'Triggers',    desc: 'All scheduled and webhook triggers' },
  { key: 'runs',     label: 'Job runs',    desc: 'Full run history with logs and results' },
  { key: 'secrets',  label: 'Secrets',     desc: 'Encrypted vault secrets (plaintext in file!)' },
];

type ImportPreview = {
  version: number;
  exportedAt: string;
  data: Partial<Record<DataSet, unknown[]>>;
};

export const AdminView = ({ onHome }: Props) => {
  const features = useEditionStore((s) => s.features);

  // ── Export ──────────────────────────────────────────────────────────────────
  const [exportSets, setExportSets]     = useState<Set<DataSet>>(
    new Set(['workflows', 'scripts', 'triggers', 'runs'])
  );
  const [exporting, setExporting]       = useState(false);
  const [exportError, setExportError]   = useState('');

  const toggleExport = (key: DataSet) =>
    setExportSets((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const selectAll   = () => setExportSets(new Set(ALL_SETS.map((s) => s.key)));
  const selectNone  = () => setExportSets(new Set());

  const handleExport = async () => {
    if (exportSets.size === 0) return;
    setExporting(true);
    setExportError('');
    try {
      const qs = [...exportSets].join(',');
      const res = await fetch(`/admin/export?include=${qs}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const cd = res.headers.get('Content-Disposition') ?? '';
      const filenameMatch = cd.match(/filename="([^"]+)"/);
      const filename = filenameMatch?.[1] ?? 'workflow-backup.json';
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  // ── Import ──────────────────────────────────────────────────────────────────
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview]           = useState<ImportPreview | null>(null);
  const [parseError, setParseError]     = useState('');
  const [importSets, setImportSets]     = useState<Set<DataSet>>(new Set());
  const [importing, setImporting]       = useState(false);
  const [importResult, setImportResult] = useState<{ counts: Record<string, number>; errors: string[] } | null>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError('');
    setPreview(null);
    setImportResult(null);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string) as ImportPreview;
        if (!parsed?.data) throw new Error('Missing data field — not a valid backup file');
        setPreview(parsed);
        const available = new Set(
          ALL_SETS.map((s) => s.key).filter((k) => Array.isArray((parsed.data as Record<string, unknown>)[k]))
        );
        setImportSets(available);
      } catch (err) {
        setParseError(err instanceof Error ? err.message : 'Failed to parse file');
      }
    };
    reader.readAsText(file);
  };

  const toggleImport = (key: DataSet) =>
    setImportSets((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const handleImport = async () => {
    if (!preview || importSets.size === 0) return;
    setImporting(true);
    setImportResult(null);
    try {
      const res = await fetch('/admin/import', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ backup: preview, include: [...importSets] }),
      });
      const body = await res.json() as { ok: boolean; counts: Record<string, number>; errors: string[] };
      setImportResult({ counts: body.counts, errors: body.errors ?? [] });
    } catch (e) {
      setImportResult({ counts: {}, errors: [e instanceof Error ? e.message : 'Import failed'] });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="app-shell">
      <AppHeader onHome={onHome} title="Admin" />

      <div className="main-area" style={{ overflow: 'auto', display: 'block' }}>
      <div className="admin-view">

        {/* ── Execution control ──────────────────────────────────────────────── */}
        <section className="admin-section">
          <div className="admin-section-header">
            <Power size={16} strokeWidth={2} />
            <h2 className="admin-section-title">Execution</h2>
          </div>
          <ExecutionPauseToggle />
        </section>

        {/* ── Stats ──────────────────────────────────────────────────────────── */}
        <section className="admin-section">
          <div className="admin-section-header">
            <Activity size={16} strokeWidth={2} />
            <h2 className="admin-section-title">Run statistics</h2>
          </div>
          <HomeStats />
        </section>

        <section className="admin-section">
          <div className="admin-section-header">
            <Server size={16} strokeWidth={2} />
            <h2 className="admin-section-title">Service status</h2>
          </div>
          <ServiceStatus />
        </section>

        {/* ── Housekeeping (premium) ─────────────────────────────────────────── */}
        {features.housekeeping && (
          <section className="admin-section">
            <div className="admin-section-header">
              <Trash2 size={16} strokeWidth={2} />
              <h2 className="admin-section-title">Housekeeping</h2>
              <span className="header-badge" style={{ background: 'var(--purple)', color: '#fff' }}>Premium</span>
            </div>
            <HousekeepingPanel />
          </section>
        )}

        {/* ── Artifact history (premium) ─────────────────────────────────────── */}
        {features.artifactHistory && (
          <section className="admin-section">
            <div className="admin-section-header">
              <History size={16} strokeWidth={2} />
              <h2 className="admin-section-title">Artifact history</h2>
              <span className="header-badge" style={{ background: 'var(--purple)', color: '#fff' }}>Premium</span>
            </div>
            <ArtifactHistoryPanel />
          </section>
        )}

        {/* ── Export ─────────────────────────────────────────────────────────── */}
        <section className="admin-section">
          <div className="admin-section-header">
            <Download size={16} strokeWidth={2} />
            <h2 className="admin-section-title">Export backup</h2>
          </div>

          <div className="admin-set-actions">
            <button className="btn-secondary btn-sm" onClick={selectAll}>Select all</button>
            <button className="btn-secondary btn-sm" onClick={selectNone}>Clear</button>
          </div>

          <div className="admin-checklist">
            {ALL_SETS.map(({ key, label, desc }) => (
              <label key={key} className={`admin-check-row${key === 'secrets' ? ' admin-check-row--danger' : ''}`}>
                <input
                  type="checkbox"
                  checked={exportSets.has(key)}
                  onChange={() => toggleExport(key)}
                />
                <span className="admin-check-label">{label}</span>
                <span className="admin-check-desc">{desc}</span>
                {key === 'secrets' && (
                  <span className="admin-secrets-warning">
                    <AlertTriangle size={12} strokeWidth={2} />
                    Secrets will be stored in plaintext — keep this file secure and never commit it
                  </span>
                )}
              </label>
            ))}
          </div>

          {exportError && <div className="admin-error">{exportError}</div>}

          <button
            className="btn-primary"
            onClick={() => void handleExport()}
            disabled={exporting || exportSets.size === 0}
          >
            <Download size={14} strokeWidth={2} />
            {exporting ? 'Exporting…' : 'Download backup'}
          </button>
        </section>

        {/* ── Import ─────────────────────────────────────────────────────────── */}
        <section className="admin-section">
          <div className="admin-section-header">
            <Upload size={16} strokeWidth={2} />
            <h2 className="admin-section-title">Import / restore</h2>
          </div>

          <div className="admin-file-row">
            <button className="btn-secondary" onClick={() => fileRef.current?.click()}>
              Choose backup file…
            </button>
            {preview && (
              <span className="admin-file-meta">
                {new Date(preview.exportedAt).toLocaleString()} · v{preview.version}
              </span>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            style={{ display: 'none' }}
            onChange={handleFile}
          />

          {parseError && <div className="admin-error">{parseError}</div>}

          {preview && (
            <>
              <div className="admin-checklist">
                {ALL_SETS.map(({ key, label }) => {
                  const arr = (preview.data as Record<string, unknown>)[key];
                  const available = Array.isArray(arr);
                  const count = available ? (arr as unknown[]).length : 0;
                  return (
                    <label
                      key={key}
                      className={`admin-check-row${!available ? ' admin-check-row--disabled' : ''}${key === 'secrets' ? ' admin-check-row--danger' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={importSets.has(key)}
                        disabled={!available}
                        onChange={() => toggleImport(key)}
                      />
                      <span className="admin-check-label">{label}</span>
                      <span className="admin-check-desc">
                        {available ? `${count} item${count !== 1 ? 's' : ''} in backup` : 'not in this backup'}
                      </span>
                      {key === 'secrets' && available && (
                        <span className="admin-secrets-warning">
                          <AlertTriangle size={12} strokeWidth={2} />
                          Importing secrets will overwrite existing values
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>

              {importResult && (
                <div className="admin-import-result">
                  <div className="admin-import-counts">
                    {Object.entries(importResult.counts).map(([k, n]) => (
                      <span key={k} className="admin-import-count-badge">
                        <Check size={11} strokeWidth={2.5} /> {n} {k}
                      </span>
                    ))}
                  </div>
                  {importResult.errors.length > 0 && (
                    <div className="admin-import-errors">
                      {importResult.errors.map((e, i) => <div key={i} className="admin-error">{e}</div>)}
                    </div>
                  )}
                </div>
              )}

              <button
                className="btn-primary"
                onClick={() => void handleImport()}
                disabled={importing || importSets.size === 0}
              >
                <Upload size={14} strokeWidth={2} />
                {importing ? 'Importing…' : 'Import selected'}
              </button>
            </>
          )}
        </section>
      </div>
      </div>
    </div>
  );
};
