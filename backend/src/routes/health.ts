import type { FastifyInstance } from 'fastify';
import { pool } from '../runner/pool';
import { VERSION } from '../version';

export const healthRoutes = async (app: FastifyInstance) => {
  app.get('/health', async () => ({
    status: 'ok',
    version: VERSION,
    timestamp: Date.now(),
    workers: { total: pool.poolSize, busy: pool.busyCount, queued: pool.queueLength },
  }));
};
