import { TEST_DB_PATH } from './setupTestDb'; // must be first — sets DB_PATH
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Fastify, { type FastifyInstance } from 'fastify';
import { db } from '../../db';
import { resolveAuthConfig } from '../config';
import { reconcileConfigUser } from '../seed';
import { registerAuth, SESSION_COOKIE } from '../plugin';
import { resetThrottle } from '../throttle';

// AUTH_* are read at resolveAuthConfig() call time (in before()), so setting them
// after imports is fine — only DB_PATH must be set before the db import (setupTestDb).
process.env.AUTH_USERNAME = 'admin';
process.env.AUTH_PASSWORD = 'correct-password';
process.env.NODE_ENV = 'test';
delete process.env.CORS_ORIGIN;
delete process.env.AUTH_PASSWORD_HASH;

let app: FastifyInstance;

before(async () => {
  app = Fastify();
  const config = resolveAuthConfig();
  reconcileConfigUser(config);
  await app.register(registerAuth, { config });
  // A representative protected route, a premium-plugin prefix, and an exempt one.
  app.get('/workflows', async () => ({ ok: true }));
  app.get('/housekeeping/prune', async () => ({ ok: true }));
  app.get('/health', async () => ({ ok: true }));
  await app.ready();
});

after(async () => {
  await app.close();
  db.close(); // release the file handle so Windows lets us delete it
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.rmSync(TEST_DB_PATH + suffix, { force: true }); } catch { /* best effort */ }
  }
});

beforeEach(() => resetThrottle());

const login = (username: string, password: string) =>
  app.inject({ method: 'POST', url: '/api/auth/login', payload: { username, password } });

async function loginCookie(): Promise<string> {
  const res = await login('admin', 'correct-password');
  const c = res.cookies.find((x) => x.name === SESSION_COOKIE);
  assert.ok(c, 'login should set the session cookie');
  return c!.value;
}

test('protected route is 401 without a session', async () => {
  const res = await app.inject({ method: 'GET', url: '/workflows' });
  assert.equal(res.statusCode, 401);
});

test('premium-plugin prefixes are gated too', async () => {
  const res = await app.inject({ method: 'GET', url: '/housekeeping/prune' });
  assert.equal(res.statusCode, 401);
});

test('exempt route is reachable without a session', async () => {
  const res = await app.inject({ method: 'GET', url: '/health' });
  assert.equal(res.statusCode, 200);
});

test('wrong credentials give a generic 401 and set no cookie', async () => {
  const res = await login('admin', 'wrong');
  assert.equal(res.statusCode, 401);
  assert.equal(res.cookies.find((x) => x.name === SESSION_COOKIE), undefined);
  assert.match((res.json() as { error: string }).error, /invalid username or password/i);
});

test('a nonexistent username gives the same generic error', async () => {
  const res = await login('nobody', 'whatever');
  assert.equal(res.statusCode, 401);
  assert.match((res.json() as { error: string }).error, /invalid username or password/i);
});

test('login sets an httpOnly cookie that authorizes protected routes', async () => {
  const res = await login('admin', 'correct-password');
  assert.equal(res.statusCode, 200);
  const cookie = res.cookies.find((x) => x.name === SESSION_COOKIE);
  assert.ok(cookie);
  assert.equal(cookie!.httpOnly, true);
  assert.equal((res.json() as { user: { username: string } }).user.username, 'admin');

  const ok = await app.inject({ method: 'GET', url: '/workflows', cookies: { [SESSION_COOKIE]: cookie!.value } });
  assert.equal(ok.statusCode, 200);
});

test('check returns the identity for a valid session', async () => {
  const token = await loginCookie();
  const res = await app.inject({ method: 'GET', url: '/api/auth/check', cookies: { [SESSION_COOKIE]: token } });
  assert.equal(res.statusCode, 200);
  assert.equal((res.json() as { user: { username: string } }).user.username, 'admin');
});

test('logout revokes the session', async () => {
  const token = await loginCookie();
  const out = await app.inject({ method: 'POST', url: '/api/auth/logout', cookies: { [SESSION_COOKIE]: token } });
  assert.equal(out.statusCode, 200);
  const later = await app.inject({ method: 'GET', url: '/workflows', cookies: { [SESSION_COOKIE]: token } });
  assert.equal(later.statusCode, 401);
});

test('repeated failures add a delay but never lock the real user out', async () => {
  for (let i = 0; i < 4; i++) await login('admin', 'wrong');
  const t0 = Date.now();
  const bad = await login('admin', 'wrong'); // now delayed
  assert.equal(bad.statusCode, 401);
  assert.ok(Date.now() - t0 >= 400, 'a failed attempt past the free ones should be delayed');
  // The correct password still succeeds despite the failures — throttle, not lockout.
  const good = await login('admin', 'correct-password');
  assert.equal(good.statusCode, 200);
});
