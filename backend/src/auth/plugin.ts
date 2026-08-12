import fs from 'node:fs';
import type { FastifyInstance, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import cookie from '@fastify/cookie';
import type { AuthConfig } from './config';
import type { SessionUser } from './sessions';
import { createSession, resolveSession, destroySession } from './sessions';
import { getUserByUsername } from './store';
import { verifyPassword } from './password';
import { failureDelayMs, recordFailure, recordSuccess } from './throttle';
import { INTERNAL_TOKEN_HEADER, matchesInternalToken } from './internalToken';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Global authentication for the whole app. Registered via fastify-plugin so the
// onRequest gate, the request `user` decoration, and the cookie decorators all
// apply app-wide (not just within an encapsulated scope). This is what makes the
// instance "never accessible without authentication": every protected route is
// blocked unless the request carries a valid session cookie.

declare module 'fastify' {
  interface FastifyRequest {
    // Per-request identity, set by the auth gate. null on exempt/unauthenticated
    // paths. Multi-tenant premium reads this to scope resources by owner.
    user: SessionUser | null;
  }
}

export const SESSION_COOKIE = 'fl_session';

// The gate is DENY-BY-DEFAULT: every request needs a valid session unless it is
// one of the exempt API surfaces below or a static SPA asset. This is deliberate.
// The old allowlist of *protected* prefixes had to name every top-level API
// prefix; a route registered under a prefix nobody remembered to add (e.g. a new
// premium plugin) was silently served unauthenticated. Deny-by-default inverts
// that: a new route is protected until someone consciously exempts it.
//
// Paths reachable without a session:
//   /health            — liveness probes
//   /webhooks/*        — external senders, protected by per-trigger HMAC secrets
//   /files/*, /media/* — static media fetched by sidecars (voice-to-text, etc.)
//   /api/ai/*          — capability reference: capability shapes only, never user
//                        data (enforced by aiReference test); consumed by AI tools
//   /api/auth/login,
//   /api/auth/logout   — the endpoints that establish/clear a session
const EXEMPT_EXACT = new Set(['/health', '/api/auth/login', '/api/auth/logout']);
const EXEMPT_PREFIXES = ['/webhooks/', '/files/', '/media/', '/api/ai/'];

export function isExemptPath(url: string): boolean {
  const p = url.split('?')[0];
  if (EXEMPT_EXACT.has(p)) return true;
  if (p === '/api/ai') return true;
  return EXEMPT_PREFIXES.some((prefix) => p.startsWith(prefix));
}

// Top-level entries of the served SPA root, split so a file matches exactly
// (`/favicon.ico`) while a directory allows descent (`/assets/*`). Keeping them
// apart means a stray file like public/reports.html can't open a `/reports/*`
// API namespace to unauthenticated callers.
export type StaticAssetIndex = { files: Set<string>; dirs: Set<string> };

// Enumerate the top-level entries of the built SPA directory. A missing dir
// yields an empty index — in dev/test the UI is served by Vite, not this server.
export function readStaticAssetIndex(root: string): StaticAssetIndex {
  const index: StaticAssetIndex = { files: new Set(), dirs: new Set() };
  if (!fs.existsSync(root)) return index;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.isDirectory()) index.dirs.add(entry.name);
    else index.files.add(entry.name);
  }
  return index;
}

// The SPA shell + its assets must load before a session exists so the login
// screen can render. They are matched against the files actually served at '/'
// (never guessed), so an API route can't masquerade as a public asset. GET/HEAD
// only — nothing under the SPA root is writable.
export function isStaticAssetRequest(method: string, url: string, assets: StaticAssetIndex): boolean {
  if (method !== 'GET' && method !== 'HEAD') return false;
  const p = url.split('?')[0];
  if (p === '/') return true;                          // index.html
  const rel = p.slice(1);                              // strip leading '/'
  if (assets.files.has(rel)) return true;              // e.g. index.html, favicon.ico
  const seg = rel.split('/')[0];
  return seg !== '' && assets.dirs.has(seg);           // e.g. /assets/<hashed>.js
}

// Deny-by-default: a request is protected unless it is an exempt API surface or a
// static SPA asset.
export function isProtectedRequest(method: string, url: string, assets: StaticAssetIndex): boolean {
  if (isExemptPath(url)) return false;
  if (isStaticAssetRequest(method, url, assets)) return false;
  return true;
}

// Top-level segments that are exempt regardless of static assets — shadowing one
// changes nothing (it's already open), so it isn't a collision worth failing on.
const ALWAYS_EXEMPT_SEGMENTS = new Set(['health', 'webhooks', 'files', 'media']);

// A static asset (root file or directory) whose name matches a *protected* API
// route segment would be served without authentication by fastify-static at '/'
// — the mirror image of the deny-by-default win. Rather than couple the gate to a
// hand-maintained list of API prefixes, the caller passes the segments it
// collected from the router; this returns the offending names so startup can fail
// closed. `apiSegments` are the first path segments of registered routes.
export function findStaticApiCollisions(assets: StaticAssetIndex, apiSegments: Set<string>): string[] {
  const clashes: string[] = [];
  for (const name of [...assets.dirs, ...assets.files]) {
    if (apiSegments.has(name) && !ALWAYS_EXEMPT_SEGMENTS.has(name)) clashes.push(name);
  }
  return clashes;
}

// Attach a Set-Cookie for a freshly minted session token.
function setSessionCookie(reply: FastifyReply, config: AuthConfig, token: string): void {
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: config.cookieSameSite,
    secure: config.cookieSecure,
    path: '/',
    maxAge: Math.floor(config.sessionTtlMs / 1000),
  });
}

function clearSessionCookie(reply: FastifyReply, config: AuthConfig): void {
  reply.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    sameSite: config.cookieSameSite,
    secure: config.cookieSecure,
    path: '/',
  });
}

const GENERIC_LOGIN_ERROR = 'Invalid username or password';

async function authPlugin(app: FastifyInstance, opts: { config: AuthConfig; staticAssets?: StaticAssetIndex }): Promise<void> {
  const { config } = opts;
  // The set of files served as the SPA at '/'. Empty when this server doesn't
  // serve the UI (dev/test) — then only the exempt API surfaces stay open.
  const staticAssets: StaticAssetIndex = opts.staticAssets ?? { files: new Set(), dirs: new Set() };

  await app.register(cookie);

  // Per-request identity. null until the gate resolves a session; premium
  // multi-tenant scoping reads this to filter resources by owner.
  app.decorateRequest('user', null);

  // The gate. Runs on every request; lets exempt/non-API paths through, resolves
  // the session cookie on protected paths, and 401s when it is missing/invalid.
  app.addHook('onRequest', async (req, reply) => {
    if (req.method === 'OPTIONS') return; // CORS preflight carries no credentials
    if (!isProtectedRequest(req.method, req.url, staticAssets)) return;

    // Internal loopback: the run engine's worker threads call back into this
    // server (async run-workflow node, error-handler firing) with the per-boot
    // internal token. Not a user path — a random secret only this process's own
    // threads hold. See auth/internalToken.ts.
    const internal = req.headers[INTERNAL_TOKEN_HEADER];
    if (typeof internal === 'string' && matchesInternalToken(internal)) {
      req.user = { id: 'service', username: 'service', role: 'service' };
      return;
    }

    const token = req.cookies?.[SESSION_COOKIE];
    const resolved = token ? resolveSession(token, config.sessionTtlMs) : null;
    if (!resolved) {
      return reply.code(401).send({ error: 'Authentication required' });
    }
    req.user = resolved.user;
    // Sliding expiry: when the session slid forward, refresh the cookie's Max-Age
    // so the browser keeps it in step with the server-side expiry.
    if (resolved.refreshedExpiresAt && token) setSessionCookie(reply, config, token);
  });

  app.post<{ Body: { username?: string; password?: string } }>('/api/auth/login', async (req, reply) => {
    // Escalating delay on repeated failures — slows brute force without ever
    // locking the (single) legitimate user out. See throttle.ts.
    const delay = failureDelayMs(req.ip);
    if (delay > 0) await sleep(delay);

    const username = typeof req.body?.username === 'string' ? req.body.username : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    const user = username ? getUserByUsername(username) : undefined;
    const ok = !!user && !!password && verifyPassword(password, user.password_hash);
    if (!ok || !user) {
      recordFailure(req.ip);
      // One generic error — never reveal whether the username exists.
      return reply.code(401).send({ error: GENERIC_LOGIN_ERROR });
    }

    recordSuccess(req.ip);
    const { token } = createSession(user.id, config.sessionTtlMs);
    setSessionCookie(reply, config, token);
    return reply.send({ user: { id: user.id, username: user.username, role: user.role } });
  });

  app.post('/api/auth/logout', async (req, reply) => {
    const token = req.cookies?.[SESSION_COOKIE];
    if (token) destroySession(token);
    clearSessionCookie(reply, config);
    return reply.send({ ok: true });
  });

  // Identity probe. Reaches here only when the gate accepted the session (it is a
  // protected /api path), so req.user is populated; the UI reads it for the
  // logged-in name and to decide whether to show the login screen.
  app.get('/api/auth/check', async (req) => {
    return { user: req.user };
  });
}

export const registerAuth = fp(authPlugin, { name: 'flowline-auth' });
