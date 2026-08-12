import { TEST_DB_PATH } from './setupTestDb'; // must be first — sets DB_PATH
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { db } from '../../db';
import { createSession, resolveSession, destroySession, pruneExpiredSessions } from '../sessions';
import { upsertUser } from '../store';

const TTL = 60_000;
upsertUser({ id: 'local', username: 'admin', passwordHash: 'x', role: 'owner' });

after(() => {
  db.close(); // release the file handle so Windows lets us delete it
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.rmSync(TEST_DB_PATH + suffix, { force: true }); } catch { /* best effort */ }
  }
});

test('create then resolve returns the user', () => {
  const { token } = createSession('local', TTL);
  const r = resolveSession(token, TTL);
  assert.ok(r);
  assert.equal(r?.user.id, 'local');
  assert.equal(r?.user.username, 'admin');
});

test('an unknown token resolves to null', () => {
  assert.equal(resolveSession('not-a-real-token', TTL), null);
  assert.equal(resolveSession('', TTL), null);
});

test('destroy revokes the session', () => {
  const { token } = createSession('local', TTL);
  assert.ok(resolveSession(token, TTL));
  destroySession(token);
  assert.equal(resolveSession(token, TTL), null);
});

test('an expired session resolves to null, and a live one survives the prune', () => {
  const { token } = createSession('local', -1_000); // already expired
  assert.equal(resolveSession(token, TTL), null);
  const { token: live } = createSession('local', TTL);
  const removed = pruneExpiredSessions();
  assert.ok(removed >= 0);
  assert.ok(resolveSession(live, TTL));
});
