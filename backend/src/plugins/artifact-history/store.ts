import { randomUUID } from 'crypto';
import type Database from 'better-sqlite3';
import { db, onArtifactWrite, type ArtifactType, type ArtifactWriteEvent } from '../../db';

// Premium artifact history: keeps the last N saved versions of each workflow,
// script, and trigger. Snapshots are captured through the edition-neutral
// onArtifactWrite seam in db.ts, so the write path stays unaware of this feature.
// Backend + API only for now (no restore UI yet — that's the next increment).

const DEFAULT_KEEP = 20;

export function createArtifactHistoryTables(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS artifact_history (
      id TEXT PRIMARY KEY,
      artifact_type TEXT NOT NULL,
      artifact_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      data TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS artifact_history_lookup
      ON artifact_history(artifact_type, artifact_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS artifact_history_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      keep_versions INTEGER NOT NULL
    );
  `);
}

export function getKeepVersions(): number {
  const row = db.prepare('SELECT keep_versions FROM artifact_history_config WHERE id = 1').get() as { keep_versions: number } | undefined;
  return row ? row.keep_versions : DEFAULT_KEEP;
}

export function setKeepVersions(n: number): void {
  db.prepare(`
    INSERT INTO artifact_history_config (id, keep_versions) VALUES (1, ?)
    ON CONFLICT(id) DO UPDATE SET keep_versions = excluded.keep_versions
  `).run(n);
}

// Statements are prepared lazily (inside functions), matching the codebase
// convention — the tables don't exist until the plugin's migrate hook runs,
// which is after this module is imported.

// On each change, snapshot the PREVIOUS version — history is the stack of prior
// states you can roll back to, so the currently-live version isn't duplicated.
function recordVersion(e: ArtifactWriteEvent): void {
  if (e.prevData === null) return;          // brand-new artifact — no prior version
  if (e.prevData === e.nextData) return;    // no-op save — nothing changed
  const keep = getKeepVersions();
  if (keep <= 0) return;

  const nextVersion = (db.prepare('SELECT COALESCE(MAX(version), 0) AS v FROM artifact_history WHERE artifact_type = ? AND artifact_id = ?')
    .get(e.type, e.id) as { v: number }).v + 1;
  db.prepare('INSERT INTO artifact_history (id, artifact_type, artifact_id, version, data, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(randomUUID(), e.type, e.id, nextVersion, e.prevData, Date.now());
  db.prepare(`
    DELETE FROM artifact_history
    WHERE artifact_type = ? AND artifact_id = ?
      AND id NOT IN (
        SELECT id FROM artifact_history
        WHERE artifact_type = ? AND artifact_id = ?
        ORDER BY created_at DESC, version DESC
        LIMIT ?
      )
  `).run(e.type, e.id, e.type, e.id, keep);
}

// Wire the seam. Called once at startup (plugin init).
export function registerHistoryListener(): void {
  onArtifactWrite(recordVersion);
}

export type HistoryEntry = { version: number; createdAt: number; bytes: number };

export function listHistory(type: ArtifactType, id: string): HistoryEntry[] {
  return (db.prepare(
    'SELECT version, created_at, length(data) AS bytes FROM artifact_history WHERE artifact_type = ? AND artifact_id = ? ORDER BY version DESC',
  ).all(type, id) as { version: number; created_at: number; bytes: number }[])
    .map((r) => ({ version: r.version, createdAt: r.created_at, bytes: r.bytes }));
}

export function getVersion(type: ArtifactType, id: string, version: number): unknown | null {
  const row = db.prepare(
    'SELECT data FROM artifact_history WHERE artifact_type = ? AND artifact_id = ? AND version = ?',
  ).get(type, id, version) as { data: string } | undefined;
  if (!row) return null;
  try { return JSON.parse(row.data); } catch { return null; }
}
