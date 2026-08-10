import type { Database } from 'better-sqlite3';

export function migrateDatastore(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ds_tables (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ds_columns (
      id         TEXT PRIMARY KEY,
      table_id   TEXT NOT NULL REFERENCES ds_tables(id) ON DELETE CASCADE,
      name       TEXT NOT NULL,
      col_type   TEXT NOT NULL,
      position   INTEGER NOT NULL,
      UNIQUE(table_id, name)
    );

    CREATE INDEX IF NOT EXISTS ds_columns_table_id ON ds_columns(table_id);
  `);

  // Incremental migrations — idempotent via try/catch
  try { db.exec(`ALTER TABLE ds_columns ADD COLUMN is_key INTEGER NOT NULL DEFAULT 0`); } catch { /* already exists */ }

  try {
    db.exec(`ALTER TABLE ds_tables ADD COLUMN row_count INTEGER NOT NULL DEFAULT 0`);
    // Backfill counts for pre-existing tables
    const tables = db.prepare('SELECT id FROM ds_tables').all() as { id: string }[];
    for (const t of tables) {
      const phys = `_ds_${t.id.replace(/-/g, '')}`;
      try {
        const cnt = db.prepare(`SELECT COUNT(*) as c FROM "${phys}"`).get() as { c: number };
        db.prepare('UPDATE ds_tables SET row_count = ? WHERE id = ?').run(cnt.c, t.id);
      } catch { /* physical table may not exist yet */ }
    }
  } catch { /* already exists */ }
}
