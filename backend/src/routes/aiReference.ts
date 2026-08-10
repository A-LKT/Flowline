/**
 * AI capability reference routes — the surface a gen-AI agent reads to learn
 * what this engine can do, so it can author workflow/script files offline.
 *
 * Constraints (enforced structurally + by tests):
 *  - GET-only. There is no create/update/delete here; the AI never mutates the
 *    system. It returns files/instructions to a human who applies them.
 *  - Reads no user data. This module and ../reference/* must not import ../db.
 */
import type { FastifyInstance } from 'fastify';
import { buildCapabilityReference } from '../reference/capabilities';
import { renderReferenceMarkdown } from '../reference/markdown';

export const aiReferenceRoutes = async (app: FastifyInstance): Promise<void> => {
  // Machine-readable capability reference.
  app.get('/api/ai/capabilities', async (_req, reply) => {
    const ref = buildCapabilityReference();
    reply.header('Cache-Control', 'no-store');
    return ref;
  });

  // LLM-pasteable Markdown rendering of the same reference.
  app.get('/api/ai/reference.md', async (_req, reply) => {
    const md = renderReferenceMarkdown(buildCapabilityReference());
    reply.header('Content-Type', 'text/markdown; charset=utf-8');
    reply.header('Cache-Control', 'no-store');
    return md;
  });
};
