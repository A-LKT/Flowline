import { useEffect, useState, useCallback, useRef } from 'react';
import { Plus, Trash2, Download, Database } from 'lucide-react';
import { AppHeader } from '../../components/AppHeader';
import { TableEditor } from './TableEditor';
import { navigate, navigateReplace } from '../../state/route';

type Props = { tableId?: string; onHome: () => void };

export type DsTable = {
  id: string;
  name: string;
  createdAt: number;
  rowCount: number;
};

export type DsColumn = {
  id: string;
  tableId: string;
  name: string;
  colType: 'text' | 'number' | 'boolean';
  position: number;
  isKey: boolean;
};

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const r = await fetch(url, options);
  if (!r.ok) {
    const body = await r.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `HTTP ${r.status}`);
  }
  if (r.status === 204) return undefined as unknown as T;
  return r.json() as Promise<T>;
}

export const DataStoreView = ({ tableId, onHome }: Props) => {
  const [tables, setTables]           = useState<DsTable[]>([]);
  const [loaded, setLoaded]           = useState(false);
  // The selected table lives in the URL (#/datastore/<tableId>).
  const selectedId = tableId ?? null;
  const [creating, setCreating]       = useState(false);
  const [newName, setNewName]         = useState('');
  const [error, setError]             = useState('');
  const [isLoading, setIsLoading]     = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    const saved = localStorage.getItem('ds:sidebar-width');
    return saved ? Number(saved) : 220;
  });
  const sidebarWidthRef = useRef(sidebarWidth);
  sidebarWidthRef.current = sidebarWidth;

  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX     = e.clientX;
    const startWidth = sidebarWidthRef.current;
    const onMove = (ev: MouseEvent) => {
      const next = Math.max(140, Math.min(480, startWidth + ev.clientX - startX));
      setSidebarWidth(next);
      localStorage.setItem('ds:sidebar-width', String(next));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, []);

  const loadTables = useCallback(async () => {
    try {
      const data = await apiFetch<DsTable[]>('/datastore/tables');
      setTables(data);
    } catch { /* backend unavailable */ }
    finally { setLoaded(true); }
  }, []);

  useEffect(() => { void loadTables(); }, [loadTables]);

  // Deep-linked to a table that no longer exists → drop back to the bare list.
  useEffect(() => {
    if (loaded && tableId && !tables.some((t) => t.id === tableId)) {
      navigateReplace({ space: 'datastore' });
    }
  }, [loaded, tableId, tables]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setError('');
    setIsLoading(true);
    try {
      const table = await apiFetch<DsTable>('/datastore/tables', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name: newName.trim() }),
      });
      setTables((prev) => [...prev, table]);
      navigate({ space: 'datastore', tableId: table.id });
      setCreating(false);
      setNewName('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create table');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDrop = async (id: string) => {
    if (!confirm('Delete this table and all its data? This cannot be undone.')) return;
    try {
      await apiFetch<void>(`/datastore/tables/${id}`, { method: 'DELETE' });
      setTables((prev) => prev.filter((t) => t.id !== id));
      if (selectedId === id) navigate({ space: 'datastore' });
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to delete table');
    }
  };

  const handleExport = async (id: string, tableName: string) => {
    const r = await fetch(`/datastore/tables/${id}/export`);
    if (!r.ok) return;
    const blob = await r.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `${tableName}.sql`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const selected = tables.find((t) => t.id === selectedId) ?? null;

  return (
    <div className="app-shell">
      <AppHeader onHome={onHome} title="Data Store" />

      <div className="ds-layout">
        {/* Sidebar — table list */}
        <div className="ds-sidebar" style={{ width: sidebarWidth, minWidth: sidebarWidth }}>
          <div className="ds-sidebar-header">
            <span className="ds-sidebar-title">Tables</span>
            <button
              className="btn-icon"
              title="New table"
              onClick={() => { setCreating(true); setNewName(''); setError(''); }}
            >
              <Plus size={14} strokeWidth={2} />
            </button>
          </div>

          {creating && (
            <div className="ds-new-table">
              <input
                className="field-input"
                placeholder="Table name…"
                value={newName}
                autoFocus
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void handleCreate(); if (e.key === 'Escape') setCreating(false); }}
              />
              {error && <div className="field-error">{error}</div>}
              <div className="ds-new-table-actions">
                <button className="btn-primary btn-sm" onClick={() => void handleCreate()} disabled={isLoading || !newName.trim()}>
                  {isLoading ? 'Creating…' : 'Create'}
                </button>
                <button className="btn-secondary btn-sm" onClick={() => setCreating(false)}>Cancel</button>
              </div>
            </div>
          )}

          {tables.length === 0 && !creating && (
            <p className="ds-empty-hint">No tables yet. Click + to create one.</p>
          )}

          {tables.map((t) => (
            <div
              key={t.id}
              className={`ds-table-row ${selectedId === t.id ? 'ds-table-row--active' : ''}`}
              onClick={() => navigate({ space: 'datastore', tableId: t.id })}
            >
              <Database size={12} strokeWidth={2} className="ds-table-row-icon" />
              <span className="ds-table-row-name">{t.name}</span>
              <span className="ds-table-row-count">{t.rowCount}</span>
              <button
                className="btn-icon ds-table-row-export"
                title="Export JSON"
                onClick={(e) => { e.stopPropagation(); void handleExport(t.id, t.name); }}
              >
                <Download size={11} strokeWidth={2} />
              </button>
              <button
                className="btn-icon ds-table-row-delete"
                title="Delete table"
                onClick={(e) => { e.stopPropagation(); void handleDrop(t.id); }}
              >
                <Trash2 size={11} strokeWidth={2} />
              </button>
            </div>
          ))}
        </div>

        <div className="ds-sidebar-drag" onMouseDown={onDragStart} />

        {/* Main — table editor */}
        <div className="ds-main">
          {selected ? (
            <TableEditor
              table={selected}
              onRowCountChange={(count) => setTables((prev) => prev.map((t) => t.id === selected.id ? { ...t, rowCount: count } : t))}
            />
          ) : (
            <div className="ds-placeholder">
              <Database size={32} strokeWidth={1} />
              <p>Select a table to view and edit its data</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
