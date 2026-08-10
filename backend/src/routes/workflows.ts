import type { FastifyInstance } from 'fastify';
import * as db from '../db';
import type { Workflow } from '../types';

export const workflowRoutes = async (app: FastifyInstance) => {
  // List all workflows
  app.get('/workflows', async () => db.getAllWorkflows());

  // Most recent run timestamp per workflow — { [workflowId]: createdAt }.
  // Static segment, so it is matched ahead of /workflows/:id by the router.
  app.get('/workflows/last-runs', async () =>
    Object.fromEntries(db.getLastRunAtByWorkflow()),
  );

  // Get single workflow
  app.get<{ Params: { id: string } }>('/workflows/:id', async (req, reply) => {
    const wf = db.getWorkflow(req.params.id);
    if (!wf) return reply.code(404).send({ error: 'Not found' });
    return wf;
  });

  // Create or update a workflow (upsert by id)
  app.post('/workflows', async (req, reply) => {
    const wf = req.body as Workflow;
    if (!wf?.id || typeof wf.id !== 'string') return reply.code(400).send({ error: 'id is required' });
    if (!Array.isArray(wf.nodes) || !Array.isArray(wf.edges)) {
      return reply.code(400).send({ error: 'nodes and edges must be arrays' });
    }
    // A deprecated (soft-deleted) workflow is frozen — reject edits so its stored
    // definition keeps matching the runs it's preserved for.
    const existing = db.getWorkflow(wf.id);
    if (existing?.deprecated) {
      return reply.code(409).send({ error: 'Workflow is deprecated and cannot be edited' });
    }
    db.upsertWorkflow(wf);
    return reply.code(201).send(wf);
  });

  // Delete a workflow. If it has run history, deprecate (soft-delete) instead —
  // a hard delete would cascade its runs away and break run review.
  app.delete<{ Params: { id: string }; Querystring: { purge?: string } }>('/workflows/:id', async (req, reply) => {
    const wf = db.getWorkflow(req.params.id);
    if (!wf) return reply.code(404).send({ error: 'Not found' });

    const purge = req.query.purge === '1' || req.query.purge === 'true';
    if (!purge && db.countRunsForWorkflow(wf.id) > 0) {
      db.upsertWorkflow({ ...wf, deprecated: true, updatedAt: Date.now() });
      return reply.code(200).send({ deprecated: true });
    }

    db.deleteWorkflow(wf.id); // cascades runs; only reached when purging or run-free
    return reply.code(200).send({ deprecated: false });
  });

  // Run history for a workflow
  app.get<{ Params: { id: string } }>('/workflows/:id/runs', async (req, reply) => {
    const wf = db.getWorkflow(req.params.id);
    if (!wf) return reply.code(404).send({ error: 'Not found' });
    return db.getRunsForWorkflow(req.params.id);
  });
};
