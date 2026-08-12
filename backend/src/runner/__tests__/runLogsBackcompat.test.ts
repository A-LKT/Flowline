/**
 * Back-compat for the run-log shape change (string[] → RunLogEntry[]).
 *
 * Runs persisted before per-line timestamps stored `logs` as a bare JSON string[].
 * `rowToRun`'s normaliser must upgrade those rows to `{ ts: null, text }` entries on
 * read, so every consumer (run review, the assistant summary) sees one shape. This is
 * the ONE code path that executes against every pre-existing row in a live DB on the
 * first review of an old run, and the typed `updateRun` can no longer produce the
 * legacy shape — so this test writes it at the SQL level to exercise the branch.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const DB_PATH = path.join(os.tmpdir(), `runlogs-backcompat-${process.pid}-${Date.now()}.db`);
process.env.DB_PATH = DB_PATH;

type Mod = typeof import('../../db');
let db: Mod;

const WF_ID = 'wf-bc-0001';

before(async () => {
  db = await import('../../db');
  const now = Date.now();
  db.upsertWorkflow({ id: WF_ID, name: 'BC', version: 1, nodes: [], edges: [], variables: {}, createdAt: now, updatedAt: now } as never);
});

after(() => {
  for (const p of [DB_PATH, `${DB_PATH}-wal`, `${DB_PATH}-shm`]) { try { fs.unlinkSync(p); } catch { /* ignore */ } }
});

test('legacy string[] logs are normalised to timestamp-less entries on read', () => {
  const id = 'run-legacy-0001';
  db.createRun({ id, workflowId: WF_ID, status: 'success', triggerType: 'manual', createdAt: Date.now(), workflowVersion: 1 });
  // Write the pre-timestamp shape directly, bypassing the now-typed updateRun.
  db.db.prepare('UPDATE runs SET logs = ? WHERE id = ?')
    .run(JSON.stringify(['[INFO] started', '✓ [Fetch] 12ms']), id);

  const run = db.getRun(id);
  assert.ok(run, 'run should exist');
  assert.deepEqual(run!.logs, [
    { ts: null, text: '[INFO] started' },
    { ts: null, text: '✓ [Fetch] 12ms' },
  ]);
});

test('modern RunLogEntry[] logs round-trip untouched', () => {
  const id = 'run-modern-0001';
  const ts = Date.now();
  db.createRun({ id, workflowId: WF_ID, status: 'success', triggerType: 'manual', createdAt: ts, workflowVersion: 1 });
  db.updateRun(id, { status: 'success', logs: [{ ts, text: '[INFO] started' }] });

  const run = db.getRun(id);
  assert.deepEqual(run!.logs, [{ ts, text: '[INFO] started' }]);
});
