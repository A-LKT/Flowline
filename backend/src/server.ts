import path from 'path';
import fs from 'fs';
import { createHash, timingSafeEqual } from 'crypto';
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

// ─── API authentication ──────────────────────────────────────────────────────
// Set API_TOKEN to require a shared token on every API route. Unset = open
// (previous behaviour), with a startup warning.
//
// Exempt by design:
//   /webhooks/*  — external senders; protected by per-trigger HMAC secrets
//   /health      — service liveness probes
//   /api/ai/*    — AI capability reference: capability shapes only, never user
//                  data (enforced by test), consumed by external AI tools
//   /files/*, /media/* — static media fetched by sidecars (voice-to-text)
//   static SPA assets  — the UI must load before a token can be entered
const API_TOKEN = process.env.API_TOKEN ?? '';

const PROTECTED_PREFIXES = [
  '/workflows', '/scripts', '/runs', '/triggers', '/secrets',
  '/datastore', '/admin', '/services', '/stats', '/plugins', '/api',
  '/assistant',
];

const sha256 = (s: string) => createHash('sha256').update(s).digest();

// Hash both sides so timingSafeEqual gets equal-length buffers.
const tokenMatches = (candidate: string): boolean =>
  timingSafeEqual(sha256(candidate), sha256(API_TOKEN));

const extractToken = (req: { headers: Record<string, unknown>; query: unknown }): string | undefined => {
  const auth = req.headers['authorization'];
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) return auth.slice(7);
  const headerToken = req.headers['x-api-token'];
  if (typeof headerToken === 'string') return headerToken;
  // EventSource cannot set headers — SSE connects with ?token=…
  const queryToken = (req.query as Record<string, unknown> | undefined)?.token;
  if (typeof queryToken === 'string') return queryToken;
  return undefined;
};

const isProtectedPath = (url: string): boolean => {
  const p = url.split('?')[0];
  if (p.startsWith('/api/ai/') || p === '/api/ai') return false;
  return PROTECTED_PREFIXES.some((prefix) => p === prefix || p.startsWith(prefix + '/'));
};

export const buildServer = async () => {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      transport: process.env.NODE_ENV !== 'production'
        ? { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } }
        : undefined,
      redact: ['req.headers.authorization', 'req.headers["x-api-token"]'],
      serializers: {
        // Keep SSE ?token=… out of the logs.
        req: (req: { method: string; url: string; ip: string }) => ({
          method: req.method,
          url:    req.url.replace(/([?&]token=)[^&]*/g, '$1[redacted]'),
          ip:     req.ip,
        }),
      },
    },
  });

  // CORS: default is same-origin only (no cross-origin headers at all) — the
  // UI is served from this server and sidecars are not browsers. Set
  // CORS_ORIGIN to a comma-separated origin list (or '*') to open it up.
  const corsOrigin = process.env.CORS_ORIGIN;
  await app.register(cors, {
    origin: !corsOrigin ? false : corsOrigin === '*' ? true : corsOrigin.split(',').map((s) => s.trim()),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  if (API_TOKEN) {
    app.addHook('onRequest', async (req, reply) => {
      if (!isProtectedPath(req.url)) return;
      if (req.method === 'OPTIONS') return; // CORS preflight carries no credentials
      const token = extractToken(req);
      if (token && tokenMatches(token)) return;
      return reply.code(401).send({ error: 'Unauthorized — provide the API token (Authorization: Bearer <token>)' });
    });
  }

  // The UI checks this (protected) endpoint to decide whether to ask for a token.
  app.get('/api/auth/check', async () => ({ ok: true }));

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
  if (!API_TOKEN) {
    app.log.warn('API_TOKEN is not set — the API (including secrets export and workflow execution) is open to anyone who can reach this port. Set API_TOKEN to require authentication.');
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

  startAllTriggers();
  startCatchupWatcher();
  cleanupOldFiles();
  cleanupOldSandbox();
  pruneRuns();

  // File/sandbox TTLs and retention were only enforced at boot — long-lived
  // servers never cleaned up again. Re-run periodically.
  const CLEANUP_INTERVAL_MS = 12 * 60 * 60 * 1000;
  setInterval(() => {
    cleanupOldFiles();
    cleanupOldSandbox();
    pruneRuns();
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

  if (process.env.NODE_ENV === 'production') {
    const staticRoot = path.resolve(process.env.STATIC_DIR ?? './public');
    await app.register(fastifyStatic, { root: staticRoot, prefix: '/' });
    app.setNotFoundHandler((_req, reply) => { reply.sendFile('index.html'); });
  }

  return app;
};
