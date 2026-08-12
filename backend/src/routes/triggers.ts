import { createHmac, timingSafeEqual, randomUUID } from 'crypto';
import cron from 'node-cron';
import type { FastifyInstance } from 'fastify';
import * as db from '../db';
import { startTrigger, stopTrigger, getAdapter } from '../triggers';
import { fireWorkflowRun } from '../runner/fire';
import { runUserCode } from '../engine/expression';
import type { Trigger, WebhookConfig, ScheduleConfig } from '../types';

const WEBHOOK_PATH_RE = /^[a-z0-9][a-z0-9\-_]{0,63}$/i;

// Filters are user-authored JS evaluated against attacker-controlled payloads.
// Run them in the vm sandbox with a hard timeout — never new Function on the
// main process, where a while(true) would freeze the whole backend.
function evalFilter(filter: string, body: unknown): boolean {
  try {
    return !!runUserCode(`return !!(${filter});`, ['body', 'payload'], [body, body], 500);
  } catch {
    return false;
  }
}

function verifySignature(secret: string, rawBody: string, header: string | undefined): boolean {
  if (!header) return false;
  const expected = 'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex');
  const expectedBuf = Buffer.from(expected);
  const actualBuf   = Buffer.from(header);
  return expectedBuf.length === actualBuf.length && timingSafeEqual(expectedBuf, actualBuf);
}

// Reject unparseable cron expressions at write time instead of silently never
// firing (scheduleTrigger drops invalid expressions without surfacing an error).
function scheduleConfigError(kind: string | undefined, config: unknown): string | null {
  if (kind !== 'schedule') return null;
  const cfg = config as ScheduleConfig | undefined;
  if (!cfg?.cron || !cron.validate(cfg.cron)) {
    return `Invalid cron expression: "${cfg?.cron ?? ''}"`;
  }
  return null;
}

// A workflow-targeted trigger whose workflow doesn't exist is worse than useless:
// fireWorkflowRun returns null on a missing workflow (runner/fire.ts), so an
// enabled schedule ticks forever into nothing — no run row, no error, no log,
// while the UI shows it as applied. Reject a dangling target at write time. Only
// checked for `type: 'workflow'` targets (the only kind that resolves to an id).
function targetError(target: unknown): string | null {
  const t = target as { type?: string; id?: string } | undefined;
  if (!t || t.type !== 'workflow') return null;
  if (!t.id || !db.getWorkflow(t.id)) {
    return `Trigger target workflow "${t.id ?? ''}" does not exist. Create/apply the workflow first, then wire the trigger to it.`;
  }
  return null;
}

export const triggerRoutes = async (app: FastifyInstance) => {
  // GET /triggers — each trigger augmented with lastRunAt (when it last fired)
  // and canRunNow (whether its adapter supports on-demand firing).
  app.get('/triggers', async () => {
    const lastRuns = db.getLastRunAtByTrigger();
    return db.getAllTriggers().map((t) => ({
      ...t,
      lastRunAt: lastRuns.get(t.id) ?? null,
      canRunNow: !!getAdapter(t.kind)?.runNow,
    }));
  });

  // POST /triggers — create
  app.post('/triggers', async (req, reply) => {
    const body = req.body as Omit<Trigger, 'id' | 'createdAt' | 'updatedAt'>;
    if (!body?.name || !body.kind || !body.target) {
      return reply.code(400).send({ error: 'name, kind and target are required' });
    }
    if (body.kind === 'webhook') {
      const cfg = body.config as WebhookConfig;
      if (!cfg?.path || !WEBHOOK_PATH_RE.test(cfg.path)) {
        return reply.code(400).send({ error: 'webhook path must be 1-64 url-safe characters' });
      }
    } else if (body.kind !== 'webhook' && !getAdapter(body.kind)) {
      return reply.code(400).send({ error: `Unknown trigger kind: ${body.kind}` });
    }
    const cronError = scheduleConfigError(body.kind, body.config);
    if (cronError) return reply.code(400).send({ error: cronError });
    const targetErr = targetError(body.target);
    if (targetErr) return reply.code(400).send({ error: targetErr });
    const now = Date.now();
    const trigger: Trigger = { ...body, id: randomUUID(), createdAt: now, updatedAt: now };
    db.upsertTrigger(trigger);
    if (trigger.enabled) startTrigger(trigger);
    return reply.code(201).send(trigger);
  });

  // PUT /triggers/:id — full update
  app.put<{ Params: { id: string } }>('/triggers/:id', async (req, reply) => {
    const existing = db.getTrigger(req.params.id);
    if (!existing) return reply.code(404).send({ error: 'Not found' });

    const body = req.body as Partial<Trigger>;
    if (body.kind === 'webhook') {
      const cfg = body.config as WebhookConfig | undefined;
      if (cfg?.path && !WEBHOOK_PATH_RE.test(cfg.path)) {
        return reply.code(400).send({ error: 'webhook path must be 1-64 url-safe characters' });
      }
    }
    if (body.config !== undefined) {
      const cronError = scheduleConfigError(body.kind ?? existing.kind, body.config);
      if (cronError) return reply.code(400).send({ error: cronError });
    }
    if (body.target !== undefined) {
      const targetErr = targetError(body.target);
      if (targetErr) return reply.code(400).send({ error: targetErr });
    }

    // lastRunAt and canRunNow are derived fields the client echoes back; never persist them onto the entity.
    const { lastRunAt: _drop, canRunNow: _drop2, ...patch } =
      body as Partial<Trigger> & { lastRunAt?: number | null; canRunNow?: boolean };
    const updated: Trigger = { ...existing, ...patch, id: existing.id, createdAt: existing.createdAt, updatedAt: Date.now() };
    db.upsertTrigger(updated);

    stopTrigger(updated.id);
    if (updated.enabled) startTrigger(updated);

    return {
      ...updated,
      lastRunAt: db.getLastRunAtForTrigger(updated.id),
      canRunNow: !!getAdapter(updated.kind)?.runNow,
    };
  });

  // POST /triggers/:id/run — fire the trigger on demand (manual run)
  app.post<{ Params: { id: string } }>('/triggers/:id/run', async (req, reply) => {
    const trigger = db.getTrigger(req.params.id);
    if (!trigger) return reply.code(404).send({ error: 'Not found' });

    const adapter = getAdapter(trigger.kind);
    if (!adapter?.runNow) {
      return reply.code(400).send({ error: `Trigger kind '${trigger.kind}' cannot be run on demand` });
    }

    const runId = adapter.runNow(trigger);
    if (!runId) return reply.code(422).send({ error: 'Trigger did not start a run (no workflow target?)' });
    return reply.code(202).send({ runId });
  });

  // DELETE /triggers/:id
  app.delete<{ Params: { id: string } }>('/triggers/:id', async (req, reply) => {
    stopTrigger(req.params.id);
    const deleted = db.deleteTrigger(req.params.id);
    if (!deleted) return reply.code(404).send({ error: 'Not found' });
    return reply.code(204).send();
  });

  // POST /webhooks/:path — inbound webhook
  app.post<{ Params: { path: string } }>('/webhooks/:path', async (req, reply) => {
    const candidates = db.getAllTriggers().filter(
      (t) => t.kind === 'webhook' && t.enabled && (t.config as WebhookConfig).path === req.params.path,
    );
    if (candidates.length === 0) return reply.code(404).send({ error: 'No active webhook found for this path' });

    const body = req.body as Record<string, unknown>;
    // HMAC is verified over the raw request bytes (what the sender actually
    // signed), not a re-serialisation. Both our own header and the GitHub-style
    // one are accepted.
    const rawBody = (req as typeof req & { rawBody?: string }).rawBody ?? JSON.stringify(req.body ?? {});
    const sigHeader = (req.headers['x-webhook-signature'] ?? req.headers['x-hub-signature-256']) as string | undefined;

    const runIds: string[] = [];
    let sigFailed = false;

    for (const trigger of candidates) {
      const config = trigger.config as WebhookConfig;

      // A bad signature skips this trigger but must not abort triggers that
      // already fired (or secret-less triggers still to come).
      if (config.secret && !verifySignature(config.secret, rawBody, sigHeader)) {
        sigFailed = true;
        continue;
      }

      if (config.filter && !evalFilter(config.filter, body)) continue;
      if (trigger.target.type !== 'workflow') continue;

      const runId = fireWorkflowRun(trigger.target.id, body, 'webhook', trigger.id);
      if (runId) runIds.push(runId);
    }

    if (runIds.length === 0) {
      if (sigFailed) return reply.code(401).send({ error: 'Invalid or missing webhook signature' });
      return reply.code(422).send({ error: 'No trigger filter matched the payload' });
    }
    return reply.code(202).send({ runIds });
  });
};
