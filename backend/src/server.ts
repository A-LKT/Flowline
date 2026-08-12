import path from 'path';
import fs from 'fs';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { healthRoutes } from './routes/health';
import { workflowRoutes } from './routes/workflows';
import { scriptRoutes } from './routes/scripts';
import { runRoutes } from './routes/runs';
import { triggerRoutes } from './routes/triggers';
import { serviceRoutes } from './routes/services';
import { statsRoutes } from './routes/stats';
import { secretRoutes } from './routes/secrets';
import { datastoreRoutes } from './datastore/routes';
import { adminRoutes } from './routes/admin';
import { aiReferenceRoutes } from './routes/aiReference';
import { registerAdapter, startAllTriggers } from './triggers';
import { startCatchupWatcher } from './catchup';
import { isVaultKeySet } from './crypto';
import { plugins } from './plugins';
import { EDITION, features, licenseInfo } from './edition';
import { db, failStaleActiveRuns, pruneOldRuns, pruneOrphanedDeprecatedWorkflows } from './db';
import { resolveAuthConfig, usesPlaintextPassword } from './auth/config';
import { reconcileConfigUser } from './auth/seed';
import { registerAuth, readStaticAssetIndex, findStaticApiCollisions, type StaticAssetIndex } from './auth/plugin';
import { pruneExpiredSessions } from './auth/sessions';

const DATA_DIR        = path.resolve(process.env.DB_PATH ? path.dirname(process.env.DB_PATH) : './data');
const FILE_TTL_MS     = 7 * 24 * 60 * 60 * 1000; // 7 days
const SANDBOX_TTL_MS  = 1 * 24 * 60 * 60 * 1000; // 1 day

const cleanupDir = (dir: string, ttlMs: number, lastUsedFile?: string) => {
  if (!fs.existsSync(dir)) return;
  const cutoff = Date.now() - ttlMs;
  for (const entry of fs.readdirSync(dir)) {
    const entryPath = path.join(dir, entry);
    try {
      let ts: number;
      if (lastUsedFile) {
        const marker = path.join(entryPath, lastUsedFile);
        ts = fs.existsSync(marker)
          ? Number(fs.readFileSync(marker, 'utf8').trim())
          : fs.statSync(entryPath).mtimeMs;
      } else {
        ts = fs.statSync(entryPath).mtimeMs;
      }
      if (ts < cutoff) fs.rmSync(entryPath, { recursive: true, force: true });
    } catch { /* skip */ }
  }
};

const cleanupOldFiles   = () => cleanupDir(path.join(DATA_DIR, 'files'),   FILE_TTL_MS);
const cleanupOldSandbox = () => cleanupDir(path.join(DATA_DIR, 'sandbox'), SANDBOX_TTL_MS, '.last-used');

// ─── Authentication ──────────────────────────────────────────────────────────
// Every protected route requires a valid login session (see auth/plugin.ts). The
// single free-tier user is configured statically via AUTH_USERNAME / AUTH_PASSWORD
// (or AUTH_PASSWORD_HASH); resolveAuthConfig throws if no credential is set, so an
// instance can never come up unauthenticated. The users/sessions schema is the
// substrate the premium multi-tenant feature builds on.
export const buildServer = async () => {
  // Resolve auth config first so a misconfiguration fails fast, before any
  // listeners or side effects. Throws AuthConfigError (handled in index.ts).
  const authConfig = resolveAuthConfig();
  reconcileConfigUser(authConfig);

  // Index the SPA root up-front (only served in production) so the deny-by-default
  // auth gate can tell a genuine public asset from an API call without an allowlist
  // of API prefixes. A missing build dir yields an empty index (see the guard in
  // the static registration below).
  const spaStaticRoot = process.env.NODE_ENV === 'production'
    ? path.resolve(process.env.STATIC_DIR ?? './public')
    : null;
  const staticAssets: StaticAssetIndex = spaStaticRoot
    ? readStaticAssetIndex(spaStaticRoot)
    : { files: new Set(), dirs: new Set() };

  const app = Fastify({
    // Behind a reverse proxy (the supported deployment), set TRUST_PROXY so req.ip
    // reflects the real client via X-Forwarded-For — used for login throttling and
    // request logs. Accepts a boolean, a hop count, or a CIDR/IP allowlist. Leave
    // unset when the app is directly exposed, so clients can't spoof their IP.
    trustProxy: (() => {
      const v = process.env.TRUST_PROXY?.trim();
      if (!v) return false;
      if (/^(true|false)$/i.test(v)) return v.toLowerCase() === 'true';
      if (/^\d+$/.test(v)) return Number(v);
      return v; // comma-separated IP/CIDR list
    })(),
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      transport: process.env.NODE_ENV !== 'production'
        ? { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } }
        : undefined,
      // Keep the session cookie and the internal loopback token out of the logs.
      redact: ['req.headers.cookie', 'req.headers["x-internal-token"]'],
      serializers: {
        req: (req: { method: string; url: string; ip: string }) => ({
          method: req.method,
          url:    req.url,
          ip:     req.ip,
        }),
      },
    },
  });

  // CORS: default is same-origin only (no cross-origin headers at all) — the
  // UI is served from this server and sidecars are not browsers. Set
  // CORS_ORIGIN to a comma-separated origin list (or '*') to open it up.
  // When cross-origin is enabled, credentials must be allowed so the browser
  // sends the session cookie (paired with SameSite=None on the cookie).
  const corsOrigin = process.env.CORS_ORIGIN;
  await app.register(cors, {
    origin: !corsOrigin ? false : corsOrigin === '*' ? true : corsOrigin.split(',').map((s) => s.trim()),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: !!corsOrigin,
  });

  // Collect the top-level segment of every registered route so we can fail closed
  // if a served SPA asset shadows one (checked after all routes register).
  const apiSegments = new Set<string>();
  app.addHook('onRoute', (route) => {
    const seg = route.url.split('/')[1];
    if (seg && seg !== '*') apiSegments.add(seg);
  });

  // Login/session gate for every protected route, plus /api/auth/{login,logout,check}.
  // Registered globally (fastify-plugin) so the onRequest gate covers all routes.
  // staticAssets lets the gate serve the SPA shell + assets before a session exists.
  await app.register(registerAuth, { config: authConfig, staticAssets });

  // Edition + feature flags — the UI reads this to gate premium surfaces.
  app.get('/api/edition', async () => ({
    edition: EDITION,
    features,
    licensedTo: licenseInfo?.customer ?? null,
    expiresAt: licenseInfo?.expiresAt ?? null,
  }));

  // Parse JSON bodies. The raw string is kept on the request so webhook HMAC
  // verification can hash the exact bytes the sender signed (re-serialising
  // the parsed object breaks signatures whenever whitespace differs).
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    (req as typeof req & { rawBody?: string }).rawBody = body as string;
    try { done(null, JSON.parse(body as string)); } catch (e) { done(e as Error); }
  });

  for (const p of plugins) {
    if (p.migrate) {
      app.log.info(`[plugin:${p.name}] migrating`);
      p.migrate(db);
    }
    if (p.triggerAdapters) {
      for (const [kind, adapter] of Object.entries(p.triggerAdapters)) {
        app.log.info(`[plugin:${p.name}] registering trigger adapter: ${kind}`);
        registerAdapter(kind, adapter);
      }
    }
    if (p.init) {
      app.log.info(`[plugin:${p.name}] init`);
      p.init();
    }
  }

  await app.register(healthRoutes);
  await app.register(workflowRoutes);
  await app.register(scriptRoutes);
  await app.register(runRoutes);
  await app.register(triggerRoutes);
  await app.register(serviceRoutes);
  await app.register(statsRoutes);
  await app.register(secretRoutes);
  await app.register(datastoreRoutes);
  await app.register(adminRoutes);
  await app.register(aiReferenceRoutes);

  for (const p of plugins) {
    if (p.routes) await app.register(p.routes);
  }

  if (!isVaultKeySet()) {
    app.log.warn('VAULT_KEY is not set — secrets are disabled. Set VAULT_KEY in the environment to enable the secrets store.');
  }
  if (usesPlaintextPassword()) {
    app.log.warn('AUTH_PASSWORD is set as plaintext — hashed at startup, but the cleartext lives in your deploy config. Prefer AUTH_PASSWORD_HASH (generate with `npm run auth:hash-password`).');
  }
  if (!authConfig.cookieSecure) {
    app.log.warn('Session cookie is not marked Secure — fine for local HTTP, but set AUTH_COOKIE_SECURE=true (and serve over HTTPS) before exposing this instance publicly.');
  }

  const stale = failStaleActiveRuns();
  if (stale > 0) app.log.warn(`Marked ${stale} run(s) left over from a previous process as errored`);

  // Opt-in run retention: RUN_RETENTION_DAYS > 0 deletes finished runs older
  // than that (default 0 = keep everything, matching previous behaviour).
  const retentionDays = Number(process.env.RUN_RETENTION_DAYS ?? 0);
  const pruneRuns = () => {
    if (!(retentionDays > 0)) return;
    const deleted = pruneOldRuns(retentionDays * 24 * 60 * 60 * 1000);
    if (deleted > 0) app.log.info(`Pruned ${deleted} run(s) older than ${retentionDays} day(s)`);
    // A deprecated workflow is kept only for its run history — once retention has
    // removed all of its runs, it preserves nothing, so drop it too.
    const droppedWfs = pruneOrphanedDeprecatedWorkflows();
    if (droppedWfs > 0) app.log.info(`Removed ${droppedWfs} deprecated workflow(s) with no remaining runs`);
  };

  const pruneSessions = () => {
    const removed = pruneExpiredSessions();
    if (removed > 0) app.log.info(`Pruned ${removed} expired session(s)`);
  };

  startAllTriggers();
  startCatchupWatcher();
  cleanupOldFiles();
  cleanupOldSandbox();
  pruneRuns();
  pruneSessions();

  // File/sandbox TTLs, retention, and expired sessions were only enforced at boot
  // — long-lived servers never cleaned up again. Re-run periodically.
  const CLEANUP_INTERVAL_MS = 12 * 60 * 60 * 1000;
  setInterval(() => {
    cleanupOldFiles();
    cleanupOldSandbox();
    pruneRuns();
    pruneSessions();
  }, CLEANUP_INTERVAL_MS).unref();

  // Serve files produced by sandboxed script nodes
  const filesDir = path.resolve(process.env.DB_PATH ? path.dirname(process.env.DB_PATH) : './data', 'files');
  fs.mkdirSync(filesDir, { recursive: true });
  await app.register(fastifyStatic, {
    root:   filesDir,
    prefix: '/files/',
    decorateReply: false,
  });

  // Serve WhatsApp media files (wa_media volume shared with whatsapp-bridge)
  const waMediaDir = path.resolve(process.env.WA_MEDIA_DIR ?? '/app/wa-media');
  fs.mkdirSync(waMediaDir, { recursive: true });
  await app.register(fastifyStatic, {
    root:   waMediaDir,
    prefix: '/media/',
    decorateReply: false,
  });

  if (spaStaticRoot) {
    await app.register(fastifyStatic, { root: spaStaticRoot, prefix: '/' });
    app.setNotFoundHandler((_req, reply) => { reply.sendFile('index.html'); });
  }

  // Fail closed: a SPA asset that shadows a protected route would be served
  // unauthenticated by the '/' static mount — the mirror image of the gate we
  // just hardened. Refuse to start on such a collision.
  const collisions = findStaticApiCollisions(staticAssets, apiSegments);
  if (collisions.length > 0) {
    throw new Error(
      `SPA static asset(s) shadow protected API route(s): ${collisions.map((c) => `/${c}`).join(', ')}. ` +
      'Rename the asset (e.g. vite build.assetsDir) or the route so the auth gate cannot serve it unauthenticated.',
    );
  }

  return app;
};
