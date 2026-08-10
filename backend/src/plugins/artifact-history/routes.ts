import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { ArtifactType } from '../../db';
import { getKeepVersions, setKeepVersions, listHistory, getVersion } from './store';

const TYPES = ['workflow', 'script', 'trigger'] as const;
const isType = (t: string): t is ArtifactType => (TYPES as readonly string[]).includes(t);

export const artifactHistoryRoutes: FastifyPluginAsync = async (app) => {
  app.get('/artifact-history/config', async () => ({ keepVersions: getKeepVersions() }));

  const cfgBody = z.object({ keepVersions: z.number().int().min(0).max(500) });
  app.put<{ Body: unknown }>('/artifact-history/config', async (req, reply) => {
    const parsed = cfgBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'keepVersions must be an integer 0–500' });
    setKeepVersions(parsed.data.keepVersions);
    return { keepVersions: parsed.data.keepVersions };
  });

  // List saved versions (metadata only) for one artifact, newest first.
  app.get<{ Params: { type: string; id: string } }>('/artifact-history/:type/:id', async (req, reply) => {
    if (!isType(req.params.type)) return reply.code(400).send({ error: 'Unknown artifact type' });
    return { versions: listHistory(req.params.type, req.params.id) };
  });

  // Fetch the stored snapshot for a specific version.
  app.get<{ Params: { type: string; id: string; version: string } }>('/artifact-history/:type/:id/:version', async (req, reply) => {
    if (!isType(req.params.type)) return reply.code(400).send({ error: 'Unknown artifact type' });
    const v = parseInt(req.params.version, 10);
    if (!Number.isFinite(v)) return reply.code(400).send({ error: 'Invalid version' });
    const data = getVersion(req.params.type, req.params.id, v);
    if (data === null) return reply.code(404).send({ error: 'Version not found' });
    return { version: v, data };
  });
};
