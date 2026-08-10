import { useEffect, useState, useCallback, useRef } from 'react';
import { Plus, Trash2, KeyRound, Copy, Check } from 'lucide-react';
import type { DsTable, DsColumn } from './DataStoreView';

type DsRow = Record<string, unknown>;

type Props = {
  table: DsTable;
  onRowCountChange: (count: number) => void;
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

type EditCell = { rowId: string; col: string; value: string };

const COL_TYPES: DsColumn['colType'][] = ['text', 'number', 'boolean'];

export const TableEditor = ({ table, onRowCountChange }: Props) => {
  const [columns, setColumns]         = useState<DsColumn[]>([]);
  const [rows, setRows]               = useState<DsRow[]>([]);
  const [editCell, setEditCell]       = useState<EditCell | null>(null);
  const [addColOpen, setAddColOpen]   = useState(false);
  const [newColName, setNewColName]   = useState('');
  const [newColType, setNewColType]   = useState<DsColumn['colType']>('text');
  const [colError, setColError]       = useState('');
  const [addRowBusy, setAddRowBusy]   = useState(false);
  const [loading, setLoading]         = useState(true);
  const [renamingColId, setRenamingColId] = useState<string | null>(null);
  const [renameValue, setRenameValue]     = useState('');

  const baseUrl = `/datastore/tables/${table.id}`;

  // Stable ref so onRowCountChange never appears in useCallback deps and can't
  // trigger the load→render→new-prop→load infinite loop.
  const onRowCountChangeRef = useRef(onRowCountChange);
  useEffect(() => { onRowCountChangeRef.current = onRowCountChange; });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cols, rowData] = await Promise.all([
        apiFetch<DsColumn[]>(`${baseUrl}/columns`),
        apiFetch<DsRow[]>(`${baseUrl}/rows`),
      ]);
      setColumns(cols);
      setRows(rowData);
      onRowCountChangeRef.current(rowData.length);
    } finally {
      setLoading(false);
    }
  }, [baseUrl]);

  useEffect(() => { void load(); }, [load]);

  // ── Columns ────────────────────────────────────────────────────────────────

  const handleAddCol = async () => {
    if (!newColName.trim()) return;
    setColError('');
    try {
      const col = await apiFetch<DsColumn>(`${baseUrl}/columns`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name: newColName.trim(), colType: newColType }),
      });
      setColumns((prev) => [...prev, col]);
      setRows((prev) => prev.map((r) => ({ ...r, [col.name]: null })));
      setAddColOpen(false);
      setNewColName('');
      setNewColType('text');
    } catch (e) {
      setColError(e instanceof Error ? e.message : 'Failed to add column');
    }
  };

  const startRenameCol = (col: DsColumn) => {
    setRenamingColId(col.id);
    setRenameValue(col.name);
  };

  const handleToggleKey = async (col: DsColumn) => {
    try {
      const updated = await apiFetch<DsColumn>(`${baseUrl}/columns/${col.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ isKey: !col.isKey }),
      });
      setColumns((prev) => prev.map((c) => c.id === col.id ? updated : c));
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to update column');
    }
  };

  const commitRenameCol = async (colId: string) => {
    const trimmed = renameValue.trim();
    if (!trimmed) { setRenamingColId(null); return; }
    try {
      const updated = await apiFetch<DsColumn>(`${baseUrl}/columns/${colId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name: trimmed }),
      });
      setColumns((prev) => prev.map((c) => c.id === colId ? updated : c));
      setRows((prev) => prev.map((r) => {
        const old = columns.find((c) => c.id === colId)?.name;
        if (!old || old === updated.name) return r;
        const { [old]: val, ...rest } = r;
        return { ...rest, [updated.name]: val };
      }));
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to rename column');
    } finally {
      setRenamingColId(null);
    }
  };

  const handleDropCol = async (col: DsColumn) => {
    if (!confirm(`Delete column "${col.name}"? All data in this column will be lost.`)) return;
    try {
      await apiFetch<void>(`${baseUrl}/columns/${col.id}`, { method: 'DELETE' });
      setColumns((prev) => prev.filter((c) => c.id !== col.id));
      setRows((prev) => prev.map((r) => { const { [col.name]: _, ...rest } = r; return rest; }));
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to delete column');
    }
  };

  // ── Rows ───────────────────────────────────────────────────────────────────

  const handleAddRow = async () => {
    setAddRowBusy(true);
    try {
      const result = await apiFetch<{ action: string; row: DsRow }>(`${baseUrl}/rows`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ data: {} }),
      });
      setRows((prev) => {
        const next = [...prev, result.row];
        onRowCountChange(next.length);
        return next;
      });
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to add row');
    } finally {
      setAddRowBusy(false);
    }
  };

  const handleDeleteRow = async (rowId: string) => {
    try {
      await apiFetch<void>(`${baseUrl}/rows/${rowId}`, { method: 'DELETE' });
      setRows((prev) => {
        const next = prev.filter((r) => r.id !== rowId);
        onRowCountChange(next.length);
        return next;
      });
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to delete row');
    }
  };

  const commitCell = async () => {
    if (!editCell) return;
    const { rowId, col, value } = editCell;
    const column = columns.find((c) => c.name === col);
    let parsed: unknown = value;
    if (column?.colType === 'number') parsed = value === '' ? null : Number(value);
    if (column?.colType === 'boolean') parsed = value === 'true';
    try {
      await apiFetch<DsRow>(`${baseUrl}/rows/${rowId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ col, value: parsed }),
      });
      setRows((prev) => prev.map((r) => r.id === rowId ? { ...r, [col]: parsed } : r));
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to update cell');
    } finally {
      setEditCell(null);
    }
  };

  const cancelEdit = () => setEditCell(null);

  const [schemaCopied, setSchemaCopied] = useState(false);
  const copySchema = () => {
    const TYPE_MAP: Record<DsColumn['colType'], string> = { text: 'string', number: 'number', boolean: 'boolean' };
    const sample = Object.fromEntries(columns.map((c) => [c.name, TYPE_MAP[c.colType]]));
    void navigator.clipboard.writeText(JSON.stringify(sample)).then(() => {
      setSchemaCopied(true);
      setTimeout(() => setSchemaCopied(false), 1500);
    });
  };

  const startEdit = (rowId: string, col: string, current: unknown) => {
    setEditCell({ rowId, col, value: current === null || current === undefined ? '' : String(current) });
  };

  return (
    <div className="ds-editor">
      {/* Column management bar */}
      <div className="ds-editor-header">
        <span className="ds-editor-title">{table.name}</span>
        {columns.length > 0 && (
          <button className="btn-secondary btn-sm" onClick={copySchema} title="Copy schema as JSON sample">
            {schemaCopied ? <Check size={12} strokeWidth={2} /> : <Copy size={12} strokeWidth={2} />}
            {schemaCopied ? 'Copied!' : 'Copy schema'}
          </button>
        )}
        <button className="btn-secondary btn-sm" onClick={() => { setAddColOpen(true); setColError(''); setNewColName(''); setNewColType('text'); }}>
          <Plus size={12} strokeWidth={2} /> Add column
        </button>
        <button className="btn-primary btn-sm" onClick={() => void handleAddRow()} disabled={addRowBusy}>
          <Plus size={12} strokeWidth={2} /> Add row
        </button>
      </div>

      {addColOpen && (
        <div className="ds-add-col">
          <input
            className="field-input"
            placeholder="Column name…"
            value={newColName}
            autoFocus
            onChange={(e) => setNewColName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void handleAddCol(); if (e.key === 'Escape') setAddColOpen(false); }}
          />
          <select className="field-select" value={newColType} onChange={(e) => setNewColType(e.target.value as DsColumn['colType'])}>
            {COL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <button className="btn-primary btn-sm" onClick={() => void handleAddCol()}>Add</button>
          <button className="btn-secondary btn-sm" onClick={() => setAddColOpen(false)}>Cancel</button>
          {colError && <span className="field-error">{colError}</span>}
        </div>
      )}

      {/* Data grid */}
      {loading ? (
        <div className="ds-loading"><span className="home-stats-spinner" /></div>
      ) : columns.length === 0 ? (
        <div className="ds-no-cols">No columns yet. Add a column to get started.</div>
      ) : (
        <div className="ds-table-wrap">
          <table className="ds-table">
            <thead>
              <tr>
                {columns.map((col) => (
                  <th key={col.id} className="ds-th">
                    {renamingColId === col.id ? (
                      <input
                        className="ds-col-rename-input"
                        value={renameValue}
                        autoFocus
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter')  void commitRenameCol(col.id);
                          if (e.key === 'Escape') setRenamingColId(null);
                        }}
                        onBlur={() => void commitRenameCol(col.id)}
                      />
                    ) : (
                      <span className="ds-th-name" onDoubleClick={() => startRenameCol(col)} title="Double-click to rename">{col.name}</span>
                    )}
                    <span className="ds-th-type">{col.colType}</span>
                    <button
                      className="btn-icon ds-th-key"
                      title={col.isKey ? 'Remove key flag' : 'Mark as key (used for upsert matching)'}
                      data-active={col.isKey ? 'true' : undefined}
                      onClick={() => void handleToggleKey(col)}
                    >
                      <KeyRound size={10} strokeWidth={2} />
                    </button>
                    <button
                      className="btn-icon ds-th-del"
                      title="Delete column"
                      onClick={() => void handleDropCol(col)}
                    >
                      <Trash2 size={10} strokeWidth={2} />
                    </button>
                  </th>
                ))}
                <th className="ds-th ds-th--actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id as string} className="ds-tr">
                  {columns.map((col) => {
                    const cell = editCell != null && editCell.rowId === row.id && editCell.col === col.name ? editCell : null;
                    const display = row[col.name];
                    return (
                      <td key={col.id} className="ds-td" onDoubleClick={() => startEdit(row.id as string, col.name, display)}>
                        {cell ? (
                          col.colType === 'boolean' ? (
                            <select
                              className="ds-cell-input"
                              value={cell.value}
                              autoFocus
                              onChange={(e) => setEditCell({ ...cell, value: e.target.value })}
                              onBlur={() => void commitCell()}
                            >
                              <option value="true">true</option>
                              <option value="false">false</option>
                            </select>
                          ) : (
                            <input
                              className="ds-cell-input"
                              type={col.colType === 'number' ? 'number' : 'text'}
                              value={cell.value}
                              autoFocus
                              onChange={(e) => setEditCell({ ...cell, value: e.target.value })}
                              onKeyDown={(e) => { if (e.key === 'Enter') void commitCell(); if (e.key === 'Escape') cancelEdit(); }}
                              onBlur={() => void commitCell()}
                            />
                          )
                        ) : (
                          <span
                            className="ds-cell-value"
                            title={display === null || display === undefined ? undefined : String(display)}
                          >
                            {display === null || display === undefined ? <span className="ds-null">null</span> : String(display)}
                          </span>
                        )}
                      </td>
                    );
                  })}
                  <td className="ds-td ds-td--actions">
                    <button
                      className="btn-icon"
                      title="Delete row"
                      onClick={() => void handleDeleteRow(row.id as string)}
                    >
                      <Trash2 size={11} strokeWidth={2} />
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={columns.length + 1} className="ds-td ds-empty-row">No rows yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
