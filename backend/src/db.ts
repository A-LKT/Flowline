import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import type { Workflow, Script, Run, RunLogEntry, RunStatus, RunTriggerType, NodeExecutionResult, Trigger } from './types';
import { migrateDatastore } from './datastore/migrate';

const DB_PATH = path.resolve(process.env.DB_PATH ?? './data/workflow.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS workflows (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS scripts (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL,
    status TEXT NOT NULL,
    results TEXT,
    logs TEXT,
    started_at INTEGER,
    finished_at INTEGER,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS runs_workflow_id ON runs(workflow_id);
  CREATE INDEX IF NOT EXISTS runs_created_at ON runs(created_at DESC);
  CREATE INDEX IF NOT EXISTS runs_status ON runs(status);

  CREATE TABLE IF NOT EXISTS triggers (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS triggers_created_at ON triggers(created_at ASC);
`);

// Add columns if they don't exist yet (safe to run on every boot)
try { db.exec('ALTER TABLE runs ADD COLUMN workflow_version INTEGER'); } catch { /* already exists */ }
try { db.exec("ALTER TABLE runs ADD COLUMN trigger_type TEXT NOT NULL DEFAULT 'manual'"); } catch { /* already exists */ }
try { db.exec('ALTER TABLE runs ADD COLUMN trigger_id TEXT'); } catch { /* already exists */ }
// Content hash of the workflow graph a run executed against — the pointer into
// workflow_snapshots (below). Lets run review render the exact canvas that ran.
try { db.exec('ALTER TABLE runs ADD COLUMN workflow_snapshot_hash TEXT'); } catch { /* already exists */ }
db.exec('CREATE INDEX IF NOT EXISTS runs_trigger_id ON runs(trigger_id, created_at DESC)');
// Powers the orphan-snapshot cleanup lookup (housekeeping) in O(1) per row.
db.exec('CREATE INDEX IF NOT EXISTS runs_snapshot_hash ON runs(workflow_snapshot_hash)');

// Content-addressed snapshots of the workflow graph as it existed when a run
// fired. Keyed by (workflow_id, hash) so identical graphs across many runs/
// versions collapse to one row — dedup that can never mis-resolve, unlike the
// client-computed workflow.version (which imports/restores can reuse for
// differing content). Correctness feature, so it lives in core (every edition
// captures); the premium housekeeping plugin prunes rows no run references.
db.exec(`
  CREATE TABLE IF NOT EXISTS workflow_snapshots (
    workflow_id TEXT NOT NULL,
    hash        TEXT NOT NULL,
    data        TEXT NOT NULL,
    created_at  INTEGER NOT NULL,
    PRIMARY KEY (workflow_id, hash),
    FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
  );
`);

migrateDatastore(db);

db.exec(`
  CREATE TABLE IF NOT EXISTS secrets (
    name         TEXT PRIMARY KEY,
    encrypted_value TEXT NOT NULL,
    created_at   INTEGER NOT NULL,
    updated_at   INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// ─── Auth: users & sessions ───────────────────────────────────────────────────
// The free tier seeds exactly one user (id 'local') from deploy-time config; see
// auth/seed.ts. The schema is multi-row from day one so the premium multiTenant
// feature only adds rows (and per-resource owner_id scoping) — no core rework.
// `role` is created now to avoid a later migration on a table with live sessions.
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    username      TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'owner',
    created_at    INTEGER NOT NULL,
    updated_at    INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    last_seen  INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS sessions_user    ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS sessions_expires ON sessions(expires_at);
`);

// ─── Workflows ──────────────────────────────────────────────────────────────

const stmts = {
  allWorkflows:   db.prepare('SELECT data FROM workflows ORDER BY created_at ASC'),
  getWorkflow:    db.prepare('SELECT data FROM workflows WHERE id = ?'),
  upsertWorkflow: db.prepare(`
    INSERT INTO workflows (id, data, created_at, updated_at)
    VALUES (@id, @data, @createdAt, @updatedAt)
    ON CONFLICT(id) DO UPDATE SET data = @data, updated_at = @updatedAt
  `),
  deleteWorkflow: db.prepare('DELETE FROM workflows WHERE id = ?'),

  allScripts:   db.prepare('SELECT data FROM scripts ORDER BY created_at ASC'),
  getScript:    db.prepare('SELECT data FROM scripts WHERE id = ?'),
  upsertScript: db.prepare(`
    INSERT INTO scripts (id, data, created_at, updated_at)
    VALUES (@id, @data, @createdAt, @updatedAt)
    ON CONFLICT(id) DO UPDATE SET data = @data, updated_at = @updatedAt
  `),
  deleteScript: db.prepare('DELETE FROM scripts WHERE id = ?'),

  allTriggers:   db.prepare('SELECT data FROM triggers ORDER BY created_at ASC'),
  getTrigger:    db.prepare('SELECT data FROM triggers WHERE id = ?'),
  upsertTrigger: db.prepare(`
    INSERT INTO triggers (id, data, created_at, updated_at)
    VALUES (@id, @data, @createdAt, @updatedAt)
    ON CONFLICT(id) DO UPDATE SET data = @data, updated_at = @updatedAt
  `),
  deleteTrigger: db.prepare('DELETE FROM triggers WHERE id = ?'),

  allSecretNames: db.prepare('SELECT name FROM secrets ORDER BY name ASC'),
  getSecretValue: db.prepare('SELECT encrypted_value FROM secrets WHERE name = ?'),
  allSecrets:     db.prepare('SELECT name, encrypted_value FROM secrets'),
  setSecret:      db.prepare(`
    INSERT INTO secrets (name, encrypted_value, created_at, updated_at)
    VALUES (@name, @encryptedValue, @now, @now)
    ON CONFLICT(name) DO UPDATE SET encrypted_value = @encryptedValue, updated_at = @now
  `),
  deleteSecret:   db.prepare('DELETE FROM secrets WHERE name = ?'),

  getSetting: db.prepare('SELECT value FROM settings WHERE key = ?'),
  setSetting: db.prepare(`
    INSERT INTO settings (key, value) VALUES (@key, @value)
    ON CONFLICT(key) DO UPDATE SET value = @value
  `),

  getRun:       db.prepare('SELECT * FROM runs WHERE id = ?'),
  getRunsForWorkflow: db.prepare('SELECT * FROM runs WHERE workflow_id = ? ORDER BY created_at DESC LIMIT 20'),
  insertRun:    db.prepare(`
    INSERT INTO runs (id, workflow_id, status, trigger_type, trigger_id, workflow_version, workflow_snapshot_hash, created_at)
    VALUES (@id, @workflowId, @status, @triggerType, @triggerId, @workflowVersion, @workflowSnapshotHash, @createdAt)
  `),
  lastRunForTrigger: db.prepare(`
    SELECT created_at FROM runs
    WHERE trigger_id = ? AND trigger_type IN ('schedule', 'schedule-catchup')
    ORDER BY created_at DESC LIMIT 1
  `),
  lastScheduleRunForWorkflow: db.prepare(`
    SELECT created_at FROM runs
    WHERE workflow_id = ? AND trigger_type IN ('schedule', 'schedule-catchup')
    ORDER BY created_at DESC LIMIT 1
  `),
  lastRunAtForTrigger: db.prepare(`
    SELECT created_at FROM runs
    WHERE trigger_id = ?
    ORDER BY created_at DESC LIMIT 1
  `),
  lastRunAtByTrigger: db.prepare(`
    SELECT trigger_id, MAX(created_at) AS last_run
    FROM runs WHERE trigger_id IS NOT NULL
    GROUP BY trigger_id
  `),
  lastRunAtByWorkflow: db.prepare(`
    SELECT workflow_id, MAX(created_at) AS last_run
    FROM runs
    GROUP BY workflow_id
  `),
  updateRun: db.prepare(`
    UPDATE runs SET status = @status, results = @results, logs = @logs,
    started_at = @startedAt, finished_at = @finishedAt WHERE id = @id
  `),
};

export const getAllWorkflows = (): Workflow[] =>
  (stmts.allWorkflows.all() as { data: string }[]).map((r) => JSON.parse(r.data) as Workflow);

export const getWorkflow = (id: string): Workflow | null => {
  const row = stmts.getWorkflow.get(id) as { data: string } | undefined;
  return row ? (JSON.parse(row.data) as Workflow) : null;
};

// ─── Artifact-write hook (edition-neutral seam) ───────────────────────────────
// A place for a feature to observe workflow/script/trigger writes without the
// write path knowing about it. Free registers no listeners (zero behaviour
// change); the premium artifact-history plugin registers one. Listeners get the
// raw JSON text (previous + next) so history can store it with no re-parse.
export type ArtifactType = 'workflow' | 'script' | 'trigger';
export type ArtifactWriteEvent = { type: ArtifactType; id: string; prevData: string | null; nextData: string };
type ArtifactWriteListener = (e: ArtifactWriteEvent) => void;
const artifactWriteListeners: ArtifactWriteListener[] = [];
export const onArtifactWrite = (fn: ArtifactWriteListener): void => { artifactWriteListeners.push(fn); };
const fireArtifactWrite = (e: ArtifactWriteEvent): void => {
  // Best-effort: a failing history listener must never break the actual write.
  for (const fn of artifactWriteListeners) { try { fn(e); } catch { /* ignore */ } }
};

const wfDataStmt      = db.prepare('SELECT data FROM workflows WHERE id = ?');
const scriptDataStmt  = db.prepare('SELECT data FROM scripts WHERE id = ?');
const triggerDataStmt = db.prepare('SELECT data FROM triggers WHERE id = ?');
const rowData = (stmt: import('better-sqlite3').Statement, id: string): string | null =>
  (stmt.get(id) as { data: string } | undefined)?.data ?? null;

export const upsertWorkflow = (wf: Workflow): void => {
  const prevData = artifactWriteListeners.length ? rowData(wfDataStmt, wf.id) : null;
  const data = JSON.stringify(wf);
  stmts.upsertWorkflow.run({ id: wf.id, data, createdAt: wf.createdAt, updatedAt: wf.updatedAt });
  if (artifactWriteListeners.length) fireArtifactWrite({ type: 'workflow', id: wf.id, prevData, nextData: data });
};

export const deleteWorkflow = (id: string): boolean => {
  const info = stmts.deleteWorkflow.run(id);
  return info.changes > 0;
};

const countRunsStmt = db.prepare('SELECT COUNT(*) AS n FROM runs WHERE workflow_id = ?');
export const countRunsForWorkflow = (id: string): number =>
  (countRunsStmt.get(id) as { n: number }).n;

// Retention companion: once a deprecated workflow's runs have all been pruned it
// preserves nothing, so drop it. Returns the number of workflows removed.
const pruneDeprecatedStmt = db.prepare(`
  DELETE FROM workflows
  WHERE json_extract(data, '$.deprecated') = 1
    AND id NOT IN (SELECT DISTINCT workflow_id FROM runs)
`);
export const pruneOrphanedDeprecatedWorkflows = (): number => pruneDeprecatedStmt.run().changes;

// ─── Workflow snapshots ───────────────────────────────────────────────────────
// Content-addressed graph snapshots captured at run-fire time (see the table
// definition above). saveWorkflowSnapshot is idempotent: an identical hash means
// byte-identical data, so a repeat insert is a no-op.

const insertSnapshotStmt = db.prepare(`
  INSERT INTO workflow_snapshots (workflow_id, hash, data, created_at)
  VALUES (@workflowId, @hash, @data, @createdAt)
  ON CONFLICT(workflow_id, hash) DO NOTHING
`);
const getSnapshotStmt = db.prepare('SELECT data FROM workflow_snapshots WHERE workflow_id = ? AND hash = ?');
// A snapshot is orphaned once no run points at it (runs are pruned by retention;
// the graph they referenced then preserves nothing). Cascade already drops
// snapshots when the workflow itself is hard-deleted.
const pruneOrphanSnapshotsStmt = db.prepare(`
  DELETE FROM workflow_snapshots
  WHERE NOT EXISTS (
    SELECT 1 FROM runs r
    WHERE r.workflow_id = workflow_snapshots.workflow_id
      AND r.workflow_snapshot_hash = workflow_snapshots.hash
  )
`);

export const saveWorkflowSnapshot = (workflowId: string, hash: string, data: string): void => {
  insertSnapshotStmt.run({ workflowId, hash, data, createdAt: Date.now() });
};

// Raw snapshot rows for backup export/import (bundled with runs — they're the
// graphs those runs reference). `data` stays as stored JSON text (no re-parse).
export type WorkflowSnapshotRow = { workflowId: string; hash: string; data: string; createdAt: number };

const allSnapshotsStmt = db.prepare('SELECT workflow_id, hash, data, created_at FROM workflow_snapshots');
export const getAllWorkflowSnapshots = (): WorkflowSnapshotRow[] =>
  (allSnapshotsStmt.all() as { workflow_id: string; hash: string; data: string; created_at: number }[])
    .map((r) => ({ workflowId: r.workflow_id, hash: r.hash, data: r.data, createdAt: r.created_at }));

// Import a snapshot preserving its original created_at (unlike saveWorkflowSnapshot,
// which stamps now). Idempotent; requires the referenced workflow to exist (FK).
export const importWorkflowSnapshot = (row: WorkflowSnapshotRow): void => {
  insertSnapshotStmt.run(row);
};

export const getWorkflowSnapshot = (workflowId: string, hash: string): Workflow | null => {
  const row = getSnapshotStmt.get(workflowId, hash) as { data: string } | undefined;
  return row ? (JSON.parse(row.data) as Workflow) : null;
};

export const pruneOrphanedSnapshots = (): number => pruneOrphanSnapshotsStmt.run().changes;

// ─── Scripts ────────────────────────────────────────────────────────────────

export const getAllScripts = (): Script[] =>
  (stmts.allScripts.all() as { data: string }[]).map((r) => JSON.parse(r.data) as Script);

export const getScript = (id: string): Script | null => {
  const row = stmts.getScript.get(id) as { data: string } | undefined;
  return row ? (JSON.parse(row.data) as Script) : null;
};

export const upsertScript = (sc: Script): void => {
  const prevData = artifactWriteListeners.length ? rowData(scriptDataStmt, sc.id) : null;
  const data = JSON.stringify(sc);
  stmts.upsertScript.run({ id: sc.id, data, createdAt: sc.createdAt, updatedAt: sc.updatedAt });
  if (artifactWriteListeners.length) fireArtifactWrite({ type: 'script', id: sc.id, prevData, nextData: data });
};

export const deleteScript = (id: string): boolean => {
  const info = stmts.deleteScript.run(id);
  return info.changes > 0;
};

// ─── Triggers ────────────────────────────────────────────────────────────────

export const getAllTriggers = (): Trigger[] =>
  (stmts.allTriggers.all() as { data: string }[]).map((r) => JSON.parse(r.data) as Trigger);

export const getTrigger = (id: string): Trigger | null => {
  const row = stmts.getTrigger.get(id) as { data: string } | undefined;
  return row ? (JSON.parse(row.data) as Trigger) : null;
};

export const upsertTrigger = (t: Trigger): void => {
  const prevData = artifactWriteListeners.length ? rowData(triggerDataStmt, t.id) : null;
  const data = JSON.stringify(t);
  stmts.upsertTrigger.run({ id: t.id, data, createdAt: t.createdAt, updatedAt: t.updatedAt });
  if (artifactWriteListeners.length) fireArtifactWrite({ type: 'trigger', id: t.id, prevData, nextData: data });
};

export const deleteTrigger = (id: string): boolean => {
  const info = stmts.deleteTrigger.run(id);
  return info.changes > 0;
};

// ─── Secrets ────────────────────────────────────────────────────────────────

export const getAllSecretNames = (): string[] =>
  (stmts.allSecretNames.all() as { name: string }[]).map((r) => r.name);

export const getAllSecretsEncrypted = (): { name: string; encrypted_value: string }[] =>
  stmts.allSecrets.all() as { name: string; encrypted_value: string }[];

export const setSecret = (name: string, encryptedValue: string): void => {
  stmts.setSecret.run({ name, encryptedValue, now: Date.now() });
};

export const deleteSecret = (name: string): boolean => {
  const info = stmts.deleteSecret.run(name);
  return info.changes > 0;
};

// ─── Settings ──────────────────────────────────────────────────────────────────
// Small persisted key/value store for server-wide flags (e.g. execution pause).

export const getSetting = (key: string): string | null => {
  const row = stmts.getSetting.get(key) as { value: string } | undefined;
  return row ? row.value : null;
};

export const setSetting = (key: string, value: string): void => {
  stmts.setSetting.run({ key, value });
};

// ─── Runs ────────────────────────────────────────────────────────────────────

type RunRow = {
  id: string;
  workflow_id: string;
  status: string;
  trigger_type: string;
  trigger_id: string | null;
  results: string | null;
  logs: string | null;
  started_at: number | null;
  finished_at: number | null;
  created_at: number;
  workflow_version: number | null;
  workflow_snapshot_hash: string | null;
};

// Runs persisted before per-line timestamps stored logs as a bare string[].
// Read them back as timestamp-less entries so every consumer sees one shape.
const normalizeLogs = (raw: string | null): RunLogEntry[] | null => {
  if (!raw) return null;
  const parsed = JSON.parse(raw) as (string | RunLogEntry)[];
  return parsed.map((e) => (typeof e === 'string' ? { ts: null, text: e } : e));
};

const rowToRun = (row: RunRow): Run => ({
  id: row.id,
  workflowId: row.workflow_id,
  status: row.status as RunStatus,
  triggerType: (row.trigger_type ?? 'manual') as RunTriggerType,
  triggerId: row.trigger_id ?? null,
  results: row.results ? (JSON.parse(row.results) as Record<string, NodeExecutionResult>) : null,
  logs: normalizeLogs(row.logs),
  startedAt: row.started_at,
  finishedAt: row.finished_at,
  createdAt: row.created_at,
  workflowVersion: row.workflow_version,
  workflowSnapshotHash: row.workflow_snapshot_hash ?? null,
});

export const getRun = (id: string): Run | null => {
  const row = stmts.getRun.get(id) as RunRow | undefined;
  return row ? rowToRun(row) : null;
};

// Resolve a short run-id prefix (as shown in the Jobs list, e.g. "48a2ae87") to a
// run. Most recent match wins if a prefix is ambiguous. Run ids are UUIDs, so the
// prefix never contains LIKE wildcards.
const getRunByPrefixStmt = db.prepare("SELECT * FROM runs WHERE id LIKE ? ORDER BY created_at DESC LIMIT 1");
export const getRunByPrefix = (prefix: string): Run | null => {
  if (!prefix) return null;
  const row = getRunByPrefixStmt.get(prefix + '%') as RunRow | undefined;
  return row ? rowToRun(row) : null;
};

export const getRunsForWorkflow = (workflowId: string): Run[] =>
  (stmts.getRunsForWorkflow.all(workflowId) as RunRow[]).map(rowToRun);

export const createRun = (run: Pick<Run, 'id' | 'workflowId' | 'status' | 'triggerType' | 'createdAt' | 'workflowVersion'> & { triggerId?: string | null; workflowSnapshotHash?: string | null }): void => {
  stmts.insertRun.run({ id: run.id, workflowId: run.workflowId, status: run.status, triggerType: run.triggerType, triggerId: run.triggerId ?? null, workflowVersion: run.workflowVersion ?? null, workflowSnapshotHash: run.workflowSnapshotHash ?? null, createdAt: run.createdAt });
};

export const getLastRunForTrigger = (triggerId: string): number | null => {
  const row = stmts.lastRunForTrigger.get(triggerId) as { created_at: number } | undefined;
  return row ? row.created_at : null;
};

export const getLastScheduleRunForWorkflow = (workflowId: string): number | null => {
  const row = stmts.lastScheduleRunForWorkflow.get(workflowId) as { created_at: number } | undefined;
  return row ? row.created_at : null;
};

// Most recent run created_at for a trigger, regardless of trigger type (i.e. when it last fired).
export const getLastRunAtForTrigger = (triggerId: string): number | null => {
  const row = stmts.lastRunAtForTrigger.get(triggerId) as { created_at: number } | undefined;
  return row ? row.created_at : null;
};

export const getLastRunAtByTrigger = (): Map<string, number> => {
  const rows = stmts.lastRunAtByTrigger.all() as { trigger_id: string; last_run: number }[];
  return new Map(rows.map((r) => [r.trigger_id, r.last_run]));
};

// Most recent run created_at per workflow — powers "last ran" on the workflow
// cards and the canvas right-column. One query serves every consumer.
export const getLastRunAtByWorkflow = (): Map<string, number> => {
  const rows = stmts.lastRunAtByWorkflow.all() as { workflow_id: string; last_run: number }[];
  return new Map(rows.map((r) => [r.workflow_id, r.last_run]));
};

// Retention: delete finished runs older than the cutoff. Active runs are
// never touched. Returns the number of deleted rows.
export const pruneOldRuns = (olderThanMs: number): number => {
  const info = db.prepare(
    `DELETE FROM runs WHERE created_at < ? AND status NOT IN ('running', 'queued')`
  ).run(Date.now() - olderThanMs);
  return info.changes;
};

// Boot-time recovery: any run still 'running'/'queued' belongs to a previous
// process and will never finish — mark it errored so it doesn't count as live
// forever. Must be called before triggers/catchup can create new runs.
export const failStaleActiveRuns = (): number => {
  const info = db.prepare(
    `UPDATE runs SET status = 'error', finished_at = ? WHERE status IN ('running', 'queued')`
  ).run(Date.now());
  return info.changes;
};

export const getAllRuns = (params: {
  // workflowId / status / triggerType accept a single value or a list (OR-matched
  // within the field, AND-combined across fields). since/until bound created_at.
  workflowId?: string | string[];
  status?: string | string[];
  triggerType?: string | string[];
  since?: number;
  until?: number;
  limit?: number;
  offset?: number;
  // Include results/logs blobs. List views never need them (they can be large);
  // the backup export does — without them a restored backup has empty runs.
  includeData?: boolean;
}): Run[] => {
  const conditions: string[] = [];
  const bindings: unknown[] = [];
  const inClause = (col: string, val: string | string[]) => {
    const arr = (Array.isArray(val) ? val : [val]).filter(Boolean);
    if (arr.length === 0) return;
    conditions.push(`${col} IN (${arr.map(() => '?').join(', ')})`);
    bindings.push(...arr);
  };
  if (params.workflowId)  inClause('workflow_id', params.workflowId);
  if (params.status)      inClause('status', params.status);
  if (params.triggerType) inClause('trigger_type', params.triggerType);
  if (params.since != null) { conditions.push('created_at >= ?'); bindings.push(params.since); }
  if (params.until != null) { conditions.push('created_at <= ?'); bindings.push(params.until); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  bindings.push(params.limit ?? 50, params.offset ?? 0);
  const cols = 'id, workflow_id, status, trigger_type, trigger_id, started_at, finished_at, created_at, workflow_version, workflow_snapshot_hash'
    + (params.includeData ? ', results, logs' : '');
  return (db.prepare(`SELECT ${cols} FROM runs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...bindings) as RunRow[]).map(rowToRun);
};

export const updateRun = (
  id: string,
  patch: { status: RunStatus; results?: Record<string, NodeExecutionResult>; logs?: RunLogEntry[]; startedAt?: number; finishedAt?: number }
): void => {
  stmts.updateRun.run({
    id,
    status: patch.status,
    results: patch.results ? JSON.stringify(patch.results) : null,
    logs: patch.logs ? JSON.stringify(patch.logs) : null,
    startedAt: patch.startedAt ?? null,
    finishedAt: patch.finishedAt ?? null,
  });
};

// ─── Stats ────────────────────────────────────────────────────────────────────

export type RunStats = {
  totalRuns: number;
  successCount: number;
  errorCount: number;
  avgDuration: number | null;
  liveCount: number;
  buckets: { hour: number; success: number; error: number }[];
};

const statsKpi = db.prepare(`
  SELECT
    COUNT(*) as total,
    SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success_count,
    SUM(CASE WHEN status = 'error'   THEN 1 ELSE 0 END) as error_count,
    AVG(CASE WHEN started_at IS NOT NULL AND finished_at IS NOT NULL
             THEN finished_at - started_at ELSE NULL END) as avg_duration
  FROM runs WHERE created_at > ?
`);

const statsLive = db.prepare(
  `SELECT COUNT(*) as count FROM runs WHERE status IN ('running', 'queued')`
);

const statsBuckets = db.prepare(`
  SELECT
    CAST((created_at - ?) / 3600000 AS INTEGER) as bucket,
    status,
    COUNT(*) as count
  FROM runs
  WHERE created_at > ? AND created_at <= ?
  GROUP BY bucket, status
`);

export const getRunStats = (since: number): RunStats => {
  const kpi = statsKpi.get(since) as {
    total: number; success_count: number; error_count: number; avg_duration: number | null;
  };
  const live = statsLive.get() as { count: number };
  const rows = statsBuckets.all(since, since, Date.now()) as {
    bucket: number; status: string; count: number;
  }[];

  const buckets = Array.from({ length: 24 }, (_, i) => ({ hour: i, success: 0, error: 0 }));
  for (const row of rows) {
    if (row.bucket >= 0 && row.bucket < 24) {
      if (row.status === 'success') buckets[row.bucket].success += row.count;
      else if (row.status === 'error') buckets[row.bucket].error += row.count;
    }
  }

  return {
    totalRuns:    kpi.total,
    successCount: kpi.success_count,
    errorCount:   kpi.error_count,
    avgDuration:  kpi.avg_duration,
    liveCount:    live.count,
    buckets,
  };
};
