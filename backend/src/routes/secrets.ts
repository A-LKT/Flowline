import type { FastifyInstance, FastifyReply } from 'fastify';
import * as db from '../db';
import { encrypt, isVaultKeySet } from '../crypto';

const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

function requireVault(reply: FastifyReply): boolean {
  if (!isVaultKeySet()) {
    void reply.code(503).send({ error: 'VAULT_KEY is not configured — set it in the server environment to enable secrets' });
    return false;
  }
  return true;
}

export const secretRoutes = async (app: FastifyInstance) => {
  app.get('/secrets', async (_req, reply) => {
    if (!requireVault(reply)) return;
    return { names: db.getAllSecretNames() };
  });

  app.post('/secrets', async (req, reply) => {
    if (!requireVault(reply)) return;
    const { name, value } = req.body as { name?: unknown; value?: unknown };
    if (typeof name !== 'string' || !NAME_RE.test(name)) {
      return reply.code(400).send({ error: 'Invalid name — letters, digits, underscores only; must start with a letter or underscore' });
    }
    if (typeof value !== 'string') {
      return reply.code(400).send({ error: 'value must be a string' });
    }
    db.setSecret(name, encrypt(value));
    return reply.code(201).send({ name });
  });

  app.delete<{ Params: { name: string } }>('/secrets/:name', async (req, reply) => {
    if (!requireVault(reply)) return;
    const deleted = db.deleteSecret(req.params.name);
    if (!deleted) return reply.code(404).send({ error: 'Not found' });
    return reply.code(204).send();
  });
};
