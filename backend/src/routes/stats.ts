import type { FastifyInstance } from 'fastify';
import * as db from '../db';

const WINDOW_MS = 24 * 60 * 60 * 1000;

export const statsRoutes = async (app: FastifyInstance) => {
  app.get('/stats', async () => db.getRunStats(Date.now() - WINDOW_MS));
};
