import './completionNode';
import './visionNode';
import type { Plugin } from '../types';
import type { FastifyInstance } from 'fastify';

const routes = async (app: FastifyInstance) => {
  app.get('/plugins/ollama/models', async (_req, reply) => {
    const serviceUrl = process.env.OLLAMA_URL ?? 'http://host.docker.internal:11434';
    try {
      const resp = await fetch(`${serviceUrl.replace(/\/$/, '')}/api/tags`);
      if (!resp.ok) return reply.status(resp.status).send({ error: 'Ollama unreachable' });
      const data = await resp.json() as { models?: { name: string }[] };
      return (data.models ?? []).map((m) => m.name);
    } catch {
      return reply.status(503).send({ error: 'Ollama unreachable' });
    }
  });
};

export const plugin: Plugin = {
  name: 'ollama',
  manifest: {
    service: {
      displayName: 'Ollama',
      envVar:      'OLLAMA_URL',
      defaultUrl:  'http://host.docker.internal:11434',
      healthPath:  '/api/tags',
    },
  },
  routes,
};
