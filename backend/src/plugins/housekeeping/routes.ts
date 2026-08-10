import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { db } from '../../db';
import { getConfig, saveConfig, DEFAULT_CONFIG } from './config';
import { runHousekeeping } from './runner';

const configSchema = z.object({
  enabled:         z.boolean(),
  maxAgeDays:      z.number().int().min(0).max(3650),
  keepPerWorkflow: z.number().int().min(0).max(100000),
  statuses:        z.array(z.enum(['queued', 'running', 'success', 'error', 'cancelled'])),
  intervalHours:   z.number().int().min(1).max(720),
  vacuum:          z.boolean(),
  pruneDeprecated: z.boolean(),
}).partial();

export const housekeepingRoutes: FastifyPluginAsync = async (app) => {
  app.get('/housekeeping/config', async () => {
    const totalRuns = (db.prepare('SELECT COUNT(*) AS n FROM runs').get() as { n: number }).n;
    return { config: getConfig(), stats: { totalRuns } };
  });

  app.put<{ Body: unknown }>('/housekeeping/config', async (req, reply) => {
    const parsed = configSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid config' });
    // Merge onto the stored config so partial updates keep bookkeeping fields
    // (lastRunAt/lastRemovedRuns) intact.
    const next = { ...getConfig(), ...parsed.data };
    saveConfig(next);
    return { config: next };
  });

  // Run the purge immediately and report what it removed.
  app.post('/housekeeping/run', async () => {
    const result = runHousekeeping();
    return { config: getConfig(), result };
  });

  app.get('/housekeeping/defaults', async () => DEFAULT_CONFIG);
};
