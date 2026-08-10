/**
 * Functional tests for the filesystem-queue node primitives. These do NOT touch
 * the database, so they run anywhere. DATA_DIR is pointed at a temp dir before
 * the nodes are imported (FILES_ROOT is resolved at module load).
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-fq-'));
process.env.DATA_DIR = tmp;

// Require AFTER DATA_DIR is set (FILES_ROOT is resolved at module load).
/* eslint-disable @typescript-eslint/no-var-requires */
const { getNode } = require('../../engine/nodeRegistry') as typeof import('../../engine/nodeRegistry');
require('../writeFileNode');
require('../listFilesNode');
require('../moveFileNode');
require('../readLocalFileNode');
require('../deleteFileNode');
/* eslint-enable @typescript-eslint/no-var-requires */

type Ctx = { runId: string; results: Record<string, unknown>; variables: Record<string, unknown>; scripts: []; secrets: {}; log: () => void };
const ctx = (): Ctx => ({ runId: 't', results: {}, variables: {}, scripts: [], secrets: {}, log: () => {} });
const run = async (type: string, config: Record<string, unknown>) => {
  const def = getNode(type)!;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await def.execute({ id: type, type, config, position: { x: 0, y: 0 } } as any, ctx() as any);
  assert.equal(res.status, 'success', `${type} errored: ${res.error}`);
  return res.output as Record<string, unknown>;
};

after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('write into a subdirectory, then list it oldest-first', async () => {
  await run('write-file', { filename: 'queue/a.json', content: '{"n":1}', mimeType: 'application/json' });
  await new Promise((r) => setTimeout(r, 5));
  await run('write-file', { filename: 'queue/b.json', content: '{"n":2}', mimeType: 'application/json' });
  const out = await run('list-files', { dir: 'queue', pattern: '*.json' });
  assert.equal(out.count, 2);
  const files = out.files as { name: string }[];
  assert.deepEqual(files.map((f) => f.name), ['a.json', 'b.json']); // oldest first
});

test('move-file claims atomically; a second claim of the same source returns moved:false', async () => {
  const first = await run('move-file', { from: 'queue/a.json', to: 'processing/a.json' });
  assert.equal(first.moved, true);
  const second = await run('move-file', { from: 'queue/a.json', to: 'processing/a.json' });
  assert.equal(second.moved, false, 'second claim of an already-moved file must report moved:false, not error');
});

test('read-local-file parses JSON, then delete-file removes it', async () => {
  const read = await run('read-local-file', { path: 'processing/a.json', format: 'json' });
  assert.deepEqual(read.content, { n: 1 });
  const del = await run('delete-file', { path: 'processing/a.json' });
  assert.equal(del.deleted, true);
  const del2 = await run('delete-file', { path: 'processing/a.json' });
  assert.equal(del2.deleted, false, 'deleting a missing file must report deleted:false, not error');
});

test('path traversal is rejected', async () => {
  const def = getNode('read-local-file')!;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await def.execute({ id: 'x', type: 'read-local-file', config: { path: '../../etc/passwd', format: 'text' }, position: { x: 0, y: 0 } } as any, ctx() as any);
  assert.equal(res.status, 'error');
  assert.match(res.error ?? '', /escapes the data directory/);
});
