import type { FastifyInstance } from 'fastify';
import * as db from '../db';
import type { Script } from '../types';

export const scriptRoutes = async (app: FastifyInstance) => {
  app.get('/scripts', async () => db.getAllScripts());

  app.get<{ Params: { id: string } }>('/scripts/:id', async (req, reply) => {
    const sc = db.getScript(req.params.id);
    if (!sc) return reply.code(404).send({ error: 'Not found' });
    return sc;
  });

  app.post('/scripts', async (req, reply) => {
    const sc = req.body as Script;
    if (!sc?.id || typeof sc.id !== 'string') return reply.code(400).send({ error: 'id is required' });
    if (!sc.name || typeof sc.name !== 'string') return reply.code(400).send({ error: 'name is required' });
    db.upsertScript(sc);
    return reply.code(201).send(sc);
  });

  app.delete<{ Params: { id: string } }>('/scripts/:id', async (req, reply) => {
    const deleted = db.deleteScript(req.params.id);
    if (!deleted) return reply.code(404).send({ error: 'Not found' });
    return reply.code(204).send();
  });
};
