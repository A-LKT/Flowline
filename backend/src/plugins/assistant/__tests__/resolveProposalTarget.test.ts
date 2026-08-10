/**
 * Tests for resolveProposalTarget — the gate that turns a propose_artifact
 * `targetId` (often a NAME the model typed, sometimes hallucinated) into a real,
 * in-scope, existing artifact id, or null. This is what stops an "update"
 * proposal from silently no-opping on the client. Uses a throwaway temp DB.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

// Point the db module at a temp file BEFORE it is (dynamically) imported.
const DB_PATH = path.join(os.tmpdir(), `assistant-target-${process.pid}-${Date.now()}.db`);
process.env.DB_PATH = DB_PATH;

type Mod = typeof import('../tools');
let resolveProposalTarget: Mod['resolveProposalTarget'];
let ChatScope: unknown;

const WF_ID = 'wf-real-0001';
const SC_ID = 'sc-real-0001';

before(async () => {
  const db = await import('../../../db');
  const now = Date.now();
  db.upsertWorkflow({ id: WF_ID, name: 'My Cool Workflow', version: 1, nodes: [], edges: [], variables: {}, createdAt: now, updatedAt: now } as never);
  db.upsertScript({ id: SC_ID, name: 'Cleanup Script', code: 'return {};', timeout: 300, createdAt: now, updatedAt: now } as never);
  ({ resolveProposalTarget } = await import('../tools'));
});

after(() => {
  for (const p of [DB_PATH, `${DB_PATH}-wal`, `${DB_PATH}-shm`]) { try { fs.unlinkSync(p); } catch { /* ignore */ } }
});

const scope = (over: Record<string, unknown>) =>
  ({ workflows: 'none', scripts: 'none', triggers: 'none', runs: 'none', tables: [], ...over }) as never;

test('exact id in an { ids } grant resolves to that id', () => {
  assert.equal(resolveProposalTarget('workflow', WF_ID, scope({ workflows: { ids: [WF_ID] } })), WF_ID);
});

test('a NAME in an { ids } grant resolves to the id', () => {
  assert.equal(resolveProposalTarget('workflow', 'My Cool Workflow', scope({ workflows: { ids: [WF_ID] } })), WF_ID);
});

test("a NAME under an 'all' grant resolves (regression: must not short-circuit on the raw name)", () => {
  assert.equal(resolveProposalTarget('workflow', 'my cool workflow', scope({ workflows: 'all' })), WF_ID);
});

test('a real id that is NOT in scope is rejected', () => {
  assert.equal(resolveProposalTarget('workflow', WF_ID, scope({ workflows: 'none' })), null);
});

test('a hallucinated id under an all grant is rejected (must exist)', () => {
  assert.equal(resolveProposalTarget('workflow', 'wf-does-not-exist', scope({ workflows: 'all' })), null);
});

test('a hallucinated name under an all grant is rejected', () => {
  assert.equal(resolveProposalTarget('workflow', 'Nonexistent Flow', scope({ workflows: 'all' })), null);
});

test('a script name is not resolvable through the workflow kind', () => {
  assert.equal(resolveProposalTarget('workflow', 'Cleanup Script', scope({ workflows: 'all', scripts: 'all' })), null);
});

test('scripts resolve by name under their own scope', () => {
  assert.equal(resolveProposalTarget('script', 'Cleanup Script', scope({ scripts: 'all' })), SC_ID);
});

test('empty / whitespace target resolves to null', () => {
  assert.equal(resolveProposalTarget('workflow', '   ', scope({ workflows: 'all' })), null);
});
