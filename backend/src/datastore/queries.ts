import { randomUUID } from 'crypto';
import { db } from '../db';

// ─── Types ───────────────────────────────────────────────────────────────────

export type ColType = 'text' | 'number' | 'boolean';

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
  colType: ColType;
  position: number;
  isKey: boolean;
};

export type DsRow = Record<string, unknown>;

// ─── Helpers ─────────────────────────────────────────────────────────────────

const RESERVED = new Set([
  'id', 'select', 'from', 'where', 'insert', 'update', 'delete', 'drop', 'create',
  'alter', 'table', 'index', 'into', 'values', 'set', 'and', 'or', 'not', 'null',
  'primary', 'key', 'unique', 'default', 'order', 'by', 'limit', 'offset', 'group',
  'having', 'join', 'left', 'right', 'inner', 'outer', 'on', 'as', 'distinct',
  'count', 'sum', 'avg', 'min', 'max', 'case', 'when', 'then', 'else', 'end',
]);

const COL_NAME_RE = /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/;

export function validateColName(name: string): void {
  if (!COL_NAME_RE.test(name)) throw new Error(`Invalid column name: "${name}"`);
  if (RESERVED.has(name.toLowerCase())) throw new Error(`Column name is reserved: "${name}"`);
}

function physicalName(tableId: string): string {
  return `_ds_${tableId.replace(/-/g, '')}`;
}

function q(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function sqlType(colType: ColType): string {
  if (colType === 'number')  return 'REAL';
  if (colType === 'boolean') return 'INTEGER';
  return 'TEXT';
}

// ─── Tables ──────────────────────────────────────────────────────────────────

export function listTables(): DsTable[] {
  const rows = db.prepare('SELECT id, name, created_at, row_count FROM ds_tables ORDER BY created_at ASC').all() as {
    id: string; name: string; created_at: number; row_count: number;
  }[];
  return rows.map((r) => ({ id: r.id, name: r.name, createdAt: r.created_at, rowCount: r.row_count }));
}

export function createTable(name: string): DsTable {
  const tableNameRe = /^[a-zA-Z][a-zA-Z0-9_ ]{0,63}$/;
  if (!tableNameRe.test(name)) throw new Error('Table name must start with a letter and contain only letters, digits, underscores, or spaces.');

  const id   = randomUUID();
  const phys = physicalName(id);
  const now  = Date.now();

  db.transaction(() => {
    db.prepare('INSERT INTO ds_tables (id, name, created_at) VALUES (?, ?, ?)').run(id, name, now);
    db.exec(`CREATE TABLE ${q(phys)} ("id" TEXT PRIMARY KEY NOT NULL)`);
  })();

  return { id, name, createdAt: now, rowCount: 0 };
}

export function dropTable(tableId: string): boolean {
  const row = db.prepare('SELECT id FROM ds_tables WHERE id = ?').get(tableId) as { id: string } | undefined;
  if (!row) return false;
  const phys = physicalName(tableId);
  db.transaction(() => {
    db.prepare('DELETE FROM ds_tables WHERE id = ?').run(tableId);
    db.exec(`DROP TABLE IF EXISTS ${q(phys)}`);
  })();
  return true;
}

// ─── Columns ─────────────────────────────────────────────────────────────────

export function getColumns(tableId: string): DsColumn[] {
  return (db.prepare(
    'SELECT id, table_id, name, col_type, position, is_key FROM ds_columns WHERE table_id = ? ORDER BY position ASC'
  ).all(tableId) as { id: string; table_id: string; name: string; col_type: string; position: number; is_key: number }[]).map((r) => ({
    id: r.id,
    tableId: r.table_id,
    name: r.name,
    colType: r.col_type as ColType,
    position: r.position,
    isKey: r.is_key === 1,
  }));
}

export function addColumn(tableId: string, name: string, colType: ColType, isKey = false): DsColumn {
  validateColName(name);
  const phys = physicalName(tableId);
  const maxPos = db.prepare('SELECT COALESCE(MAX(position), 0) as m FROM ds_columns WHERE table_id = ?').get(tableId) as { m: number };
  const position = maxPos.m + 1;
  const colId = randomUUID();

  db.transaction(() => {
    db.exec(`ALTER TABLE ${q(phys)} ADD COLUMN ${q(name)} ${sqlType(colType)}`);
    db.prepare('INSERT INTO ds_columns (id, table_id, name, col_type, position, is_key) VALUES (?, ?, ?, ?, ?, ?)').run(colId, tableId, name, colType, position, isKey ? 1 : 0);
  })();

  return { id: colId, tableId, name, colType, position, isKey };
}

export function renameColumn(tableId: string, colId: string, newName: string): DsColumn | null {
  validateColName(newName);
  const col = db.prepare('SELECT * FROM ds_columns WHERE id = ? AND table_id = ?').get(colId, tableId) as { id: string; table_id: string; name: string; col_type: string; position: number; is_key: number } | undefined;
  if (!col) return null;
  const phys = physicalName(tableId);
  db.transaction(() => {
    db.exec(`ALTER TABLE ${q(phys)} RENAME COLUMN ${q(col.name)} TO ${q(newName)}`);
    db.prepare('UPDATE ds_columns SET name = ? WHERE id = ?').run(newName, colId);
  })();
  return { id: col.id, tableId, name: newName, colType: col.col_type as ColType, position: col.position, isKey: col.is_key === 1 };
}

export function setColumnKey(tableId: string, colId: string, isKey: boolean): DsColumn | null {
  const col = db.prepare('SELECT * FROM ds_columns WHERE id = ? AND table_id = ?').get(colId, tableId) as { id: string; table_id: string; name: string; col_type: string; position: number; is_key: number } | undefined;
  if (!col) return null;
  db.prepare('UPDATE ds_columns SET is_key = ? WHERE id = ?').run(isKey ? 1 : 0, colId);
  return { id: col.id, tableId, name: col.name, colType: col.col_type as ColType, position: col.position, isKey };
}

export function dropColumn(tableId: string, colId: string): boolean {
  const col = db.prepare('SELECT * FROM ds_columns WHERE id = ? AND table_id = ?').get(colId, tableId) as DsColumn | undefined;
  if (!col) return false;

  const phys    = physicalName(tableId);
  const tmpPhys = `${phys}_tmp`;
  const remaining = getColumns(tableId).filter((c) => c.id !== colId);

  const colDefs = remaining.map((c) => `${q(c.name)} ${sqlType(c.colType)}`).join(', ');
  const colNames = ['id', ...remaining.map((c) => c.name)].map(q).join(', ');

  db.transaction(() => {
    db.exec(`CREATE TABLE ${q(tmpPhys)} ("id" TEXT PRIMARY KEY NOT NULL${colDefs ? ', ' + colDefs : ''})`);
    db.exec(`INSERT INTO ${q(tmpPhys)} (${colNames}) SELECT ${colNames} FROM ${q(phys)}`);
    db.exec(`DROP TABLE ${q(phys)}`);
    db.exec(`ALTER TABLE ${q(tmpPhys)} RENAME TO ${q(phys)}`);
    db.prepare('DELETE FROM ds_columns WHERE id = ?').run(colId);
  })();

  return true;
}

// ─── Rows ────────────────────────────────────────────────────────────────────

// better-sqlite3 cannot bind JS booleans — coerce to 0/1
function bindable(v: unknown): number | string | bigint | Buffer | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number' || typeof v === 'string' || typeof v === 'bigint') return v;
  if (Buffer.isBuffer(v)) return v;
  return String(v);
}

export function listRows(tableId: string, filter?: Record<string, unknown>): DsRow[] {
  const phys = physicalName(tableId);
  if (!filter || Object.keys(filter).length === 0) {
    return db.prepare(`SELECT * FROM ${q(phys)}`).all() as DsRow[];
  }

  const cols = getColumns(tableId);
  const colNames = new Set(cols.map((c) => c.name));
  const entries = Object.entries(filter).filter(([k]) => colNames.has(k));

  if (entries.length === 0) {
    return db.prepare(`SELECT * FROM ${q(phys)}`).all() as DsRow[];
  }

  const where  = entries.map(([k]) => `${q(k)} = ?`).join(' AND ');
  const values = entries.map(([, v]) => bindable(v));
  return db.prepare(`SELECT * FROM ${q(phys)} WHERE ${where}`).all(...values) as DsRow[];
}

export function upsertRow(tableId: string, data: Record<string, unknown>): { action: 'inserted' | 'updated'; row: DsRow } {
  const phys = physicalName(tableId);
  const cols = getColumns(tableId);
  const colSet  = new Set(cols.map((c) => c.name));
  const keyCols = cols.filter((c) => c.isKey);

  // Only allow known column names
  const safe = Object.fromEntries(Object.entries(data).filter(([k]) => colSet.has(k)));

  // If key columns are defined and all have values in data, try to find an existing row
  if (keyCols.length > 0 && keyCols.every((kc) => safe[kc.name] !== undefined)) {
    const where = keyCols.map((kc) => `${q(kc.name)} = ?`).join(' AND ');
    const keyVals = keyCols.map((kc) => bindable(safe[kc.name]));
    const existing = db.prepare(`SELECT id FROM ${q(phys)} WHERE ${where}`).get(...keyVals) as { id: string } | undefined;
    if (existing) {
      const setClause = Object.keys(safe).map((k) => `${q(k)} = ?`).join(', ');
      const vals = [...Object.values(safe).map(bindable), existing.id];
      db.prepare(`UPDATE ${q(phys)} SET ${setClause} WHERE "id" = ?`).run(...vals);
      const row = db.prepare(`SELECT * FROM ${q(phys)} WHERE "id" = ?`).get(existing.id) as DsRow;
      return { action: 'updated', row };
    }
  }

  const id = randomUUID();
  const allData = { id, ...safe };
  const keys = Object.keys(allData);
  const placeholders = keys.map(() => '?').join(', ');
  const colList = keys.map(q).join(', ');
  db.transaction(() => {
    db.prepare(`INSERT INTO ${q(phys)} (${colList}) VALUES (${placeholders})`).run(...Object.values(allData).map(bindable));
    db.prepare('UPDATE ds_tables SET row_count = row_count + 1 WHERE id = ?').run(tableId);
  })();
  const row = db.prepare(`SELECT * FROM ${q(phys)} WHERE "id" = ?`).get(id) as DsRow;
  return { action: 'inserted', row };
}

export function deleteRow(tableId: string, rowId: string): boolean {
  const phys = physicalName(tableId);
  let deleted = false;
  db.transaction(() => {
    const info = db.prepare(`DELETE FROM ${q(phys)} WHERE "id" = ?`).run(rowId);
    if (info.changes > 0) {
      db.prepare('UPDATE ds_tables SET row_count = MAX(0, row_count - 1) WHERE id = ?').run(tableId);
      deleted = true;
    }
  })();
  return deleted;
}

export function updateCell(tableId: string, rowId: string, colName: string, value: unknown): DsRow | null {
  const phys = physicalName(tableId);
  const cols = getColumns(tableId);
  if (!cols.some((c) => c.name === colName)) return null;
  db.prepare(`UPDATE ${q(phys)} SET ${q(colName)} = ? WHERE "id" = ?`).run(bindable(value), rowId);
  return db.prepare(`SELECT * FROM ${q(phys)} WHERE "id" = ?`).get(rowId) as DsRow | null;
}

export function exportSql(tableId: string): string {
  const meta  = db.prepare('SELECT name FROM ds_tables WHERE id = ?').get(tableId) as { name: string } | undefined;
  if (!meta) throw new Error('Table not found');

  const cols = getColumns(tableId);
  const phys = physicalName(tableId);
  const rows = db.prepare(`SELECT * FROM ${q(phys)}`).all() as DsRow[];

  const colDefs = [`  "id" TEXT PRIMARY KEY NOT NULL`, ...cols.map((c) => `  ${q(c.name)} ${sqlType(c.colType)}`)].join(',\n');
  const tableName = meta.name.replace(/"/g, '""');

  const lines: string[] = [
    `-- Data Store export: ${meta.name}`,
    `-- Exported: ${new Date().toISOString()}`,
    `-- Rows: ${rows.length}`,
    '',
    `CREATE TABLE IF NOT EXISTS "${tableName}" (`,
    colDefs,
    `);`,
    '',
  ];

  if (rows.length > 0) {
    const allCols = ['id', ...cols.map((c) => c.name)];
    const colList = allCols.map(q).join(', ');
    for (const row of rows) {
      const vals = allCols.map((col) => {
        const v = row[col];
        if (v === null || v === undefined) return 'NULL';
        if (typeof v === 'number') return String(v);
        return `'${String(v).replace(/'/g, "''")}'`;
      }).join(', ');
      lines.push(`INSERT INTO "${tableName}" (${colList}) VALUES (${vals});`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
