import { TEST_DB_PATH } from './setupTestDb'; // must be first — sets DB_PATH
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { db } from '../../db';
import { resolveAuthConfig } from '../config';
import { reconcileConfigUser } from '../seed';
import {
  registerAuth,
  SESSION_COOKIE,
  isExemptPath,
  isStaticAssetRequest,
  isProtectedRequest,
  readStaticAssetIndex,
  findStaticApiCollisions,
} from '../plugin';

// resolveAuthConfig() reads AUTH_* at call time, so setting them after imports is
// fine — only DB_PATH must precede the db import (handled by setupTestDb).
process.env.AUTH_USERNAME = 'admin';
process.env.AUTH_PASSWORD = 'correct-password';
process.env.NODE_ENV = 'test';
delete process.env.CORS_ORIGIN;
delete process.env.AUTH_PASSWORD_HASH;

// A minimal SPA build: index.html + a hashed asset under /assets, a root file
// (favicon), and a decoy root *file* whose name collides with a plausible API
// namespace (`reports`) — used to prove a file never opens a `/reports/*` path.
let spaDir: string;

before(() => {
  spaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flowline-spa-'));
  fs.writeFileSync(path.join(spaDir, 'index.html'), '<!doctype html><title>Flowline</title>');
  fs.writeFileSync(path.join(spaDir, 'favicon.ico'), 'icon');
  fs.writeFileSync(path.join(spaDir, 'reports.html'), '<html>decoy</html>');
  fs.mkdirSync(path.join(spaDir, 'assets'));
  fs.writeFileSync(path.join(spaDir, 'assets', 'app-abc123.js'), 'console.log(1)');
});

after(() => { fs.rmSync(spaDir, { recursive: true, force: true }); });

// ── Pure predicates: the deny-by-default classification ──────────────────────

test('readStaticAssetIndex splits files from directories', () => {
  const idx = readStaticAssetIndex(spaDir);
  assert.ok(idx.files.has('index.html'));
  assert.ok(idx.files.has('favicon.ico'));
  assert.ok(idx.files.has('reports.html'));
  assert.ok(idx.dirs.has('assets'));
  assert.ok(!idx.dirs.has('index.html'));
});

test('readStaticAssetIndex tolerates a missing build dir', () => {
  const idx = readStaticAssetIndex(path.join(spaDir, 'nope'));
  assert.equal(idx.files.size, 0);
  assert.equal(idx.dirs.size, 0);
});

test('isExemptPath: only the documented open API surfaces', () => {
  for (const p of ['/health', '/api/auth/login', '/api/auth/logout', '/api/ai', '/api/ai/reference', '/webhooks/x', '/files/a/b', '/media/a']) {
    assert.ok(isExemptPath(p), `${p} should be exempt`);
  }
  for (const p of ['/workflows', '/api/auth/check', '/api/edition', '/housekeeping/config', '/whatever']) {
    assert.ok(!isExemptPath(p), `${p} should not be exempt`);
  }
});

test('isProtectedRequest: deny-by-default, with SPA assets and exempt paths open', () => {
  const idx = readStaticAssetIndex(spaDir);
  const prot = (m: string, u: string) => isProtectedRequest(m, u, idx);

  // Open: SPA shell + assets.
  assert.ok(!prot('GET', '/'));
  assert.ok(!prot('GET', '/index.html'));
  assert.ok(!prot('GET', '/favicon.ico'));
  assert.ok(!prot('GET', '/assets/app-abc123.js'));
  // Open: exempt API surfaces.
  assert.ok(!prot('GET', '/health'));
  assert.ok(!prot('POST', '/api/auth/login'));
  assert.ok(!prot('POST', '/webhooks/x'));
  assert.ok(!prot('GET', '/api/ai/reference'));

  // Protected: API + anything unknown.
  assert.ok(prot('GET', '/workflows'));
  assert.ok(prot('GET', '/api/auth/check'));   // the identity probe stays gated
  assert.ok(prot('GET', '/api/edition'));
  assert.ok(prot('GET', '/housekeeping/config'));
  assert.ok(prot('GET', '/totally-new-prefix/thing')); // unknown → denied
  assert.ok(prot('POST', '/assets/app-abc123.js'));    // write under an asset path
});

test('isStaticAssetRequest: a root file never opens a same-named API namespace', () => {
  const idx = readStaticAssetIndex(spaDir);
  assert.ok(isStaticAssetRequest('GET', '/reports.html', idx)); // the file itself is served
  assert.ok(!isStaticAssetRequest('GET', '/reports/secret', idx)); // but not a /reports/* descent
  assert.ok(!isStaticAssetRequest('GET', '/reports', idx));
});

test('findStaticApiCollisions flags a SPA asset shadowing a protected route', () => {
  const apiSegments = new Set(['workflows', 'api', 'health', 'files']);
  assert.deepEqual(findStaticApiCollisions({ files: new Set(), dirs: new Set(['workflows']) }, apiSegments), ['workflows']);
  assert.deepEqual(findStaticApiCollisions({ files: new Set(['api']), dirs: new Set() }, apiSegments), ['api']);
  assert.deepEqual(findStaticApiCollisions({ files: new Set(['index.html']), dirs: new Set(['assets']) }, apiSegments), []);
  // Shadowing an always-exempt segment is harmless (already open) → not flagged.
  assert.deepEqual(findStaticApiCollisions({ files: new Set(), dirs: new Set(['health', 'files']) }, apiSegments), []);
});

// ── Wired gate: real HTTP behaviour through registerAuth ─────────────────────

let app: FastifyInstance;

before(async () => {
  app = Fastify();
  const config = resolveAuthConfig();
  reconcileConfigUser(config);
  await app.register(registerAuth, { config, staticAssets: readStaticAssetIndex(spaDir) });
  app.get('/workflows', async () => ({ ok: true })); // a representative protected route
  await app.register(fastifyStatic, { root: spaDir, prefix: '/' });
  await app.ready();
});

after(async () => {
  await app.close();
  db.close(); // release the file handle so Windows lets us delete it
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.rmSync(TEST_DB_PATH + suffix, { force: true }); } catch { /* best effort */ }
  }
});

test('SPA shell and assets load without a session', async () => {
  const index = await app.inject({ method: 'GET', url: '/' });
  assert.equal(index.statusCode, 200);
  assert.match(index.body, /Flowline/);

  const asset = await app.inject({ method: 'GET', url: '/assets/app-abc123.js' });
  assert.equal(asset.statusCode, 200);

  const favicon = await app.inject({ method: 'GET', url: '/favicon.ico' });
  assert.equal(favicon.statusCode, 200);
});

test('unknown / new API prefixes are 401 without a session', async () => {
  for (const url of [
    '/workflows',
    '/api/auth/check',           // load-bearing: the UI reads this to decide login state
    '/api/edition',
    '/totally-new-prefix/thing', // a route nobody added to any allowlist — still denied
    '/reports/secret',           // decoy-file namespace must not be reachable
  ]) {
    const res = await app.inject({ method: 'GET', url });
    assert.equal(res.statusCode, 401, `${url} should be 401 without a session`);
  }
  const post = await app.inject({ method: 'POST', url: '/assets/app-abc123.js' });
  assert.equal(post.statusCode, 401);
});

test('OPTIONS preflight is never blocked by the gate', async () => {
  const res = await app.inject({ method: 'OPTIONS', url: '/workflows' });
  assert.notEqual(res.statusCode, 401);
});

test('the onRoute segment extraction that feeds the collision guard works on real routes', async () => {
  // Mirror server.ts exactly: collect the first path segment of every route, then
  // prove a shadowing asset is flagged end-to-end. Guards against a typo in the
  // extraction silently disabling findStaticApiCollisions.
  const probe = Fastify();
  const apiSegments = new Set<string>();
  probe.addHook('onRoute', (route) => {
    const seg = route.url.split('/')[1];
    if (seg && seg !== '*') apiSegments.add(seg);
  });
  const config = resolveAuthConfig();
  await probe.register(registerAuth, { config });
  probe.get('/workflows', async () => ({ ok: true }));
  await probe.ready();

  assert.ok(apiSegments.has('workflows'), 'should record the /workflows segment');
  assert.ok(apiSegments.has('api'), 'should record the /api/auth/* segment');
  // A SPA build shipping a `workflows` directory would be flagged.
  assert.deepEqual(findStaticApiCollisions({ files: new Set(), dirs: new Set(['workflows']) }, apiSegments), ['workflows']);
  // The real Vite asset dir does not collide.
  assert.equal(findStaticApiCollisions({ files: new Set(), dirs: new Set(['assets']) }, apiSegments).length, 0);
  await probe.close();
});

test('a valid session unlocks protected routes', async () => {
  const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'admin', password: 'correct-password' } });
  assert.equal(login.statusCode, 200);
  const cookie = login.cookies.find((c) => c.name === SESSION_COOKIE);
  assert.ok(cookie, 'login should set a session cookie');

  const ok = await app.inject({ method: 'GET', url: '/workflows', cookies: { [SESSION_COOKIE]: cookie!.value } });
  assert.equal(ok.statusCode, 200);
});
