import type { FastifyInstance } from 'fastify';
import * as db from '../db';
import { pool } from '../runner/pool';
import { loadSecrets } from '../runner/secrets';
import { fireWorkflowRun } from '../runner/fire';
import { activeStreams } from '../runStreams';
import { getNode } from '../engine/nodeRegistry';
import '../nodes/index'; // populate registry for single-node re-runs
import type { WorkerEvent, NodeExecutionResult, ExecutionContext, WorkflowNode } from '../types';

export const runRoutes = async (app: FastifyInstance) => {
  // POST /workflows/:id/run — queue a run, return runId immediately.
  // The JSON body (if any) becomes the run's initial variables: exposed as
  // top-level variables and as `trigger`. Used by the Run panel, the async
  // run-workflow node (carries __workflowDepth__), and error-handler firing.
  app.post<{ Params: { id: string }; Body: Record<string, unknown> | undefined }>('/workflows/:id/run', async (req, reply) => {
    const initialVariables = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
      ? req.body
      : undefined;
    const wf = db.getWorkflow(req.params.id);
    if (!wf) return reply.code(404).send({ error: 'Not found' });
    if (wf.deprecated) return reply.code(409).send({ error: 'Workflow is deprecated and cannot be run' });
    const runId = fireWorkflowRun(req.params.id, initialVariables, 'manual');
    if (!runId) return reply.code(404).send({ error: 'Not found' });
    return reply.code(202).send({ runId });
  });

  // GET /runs — global paginated run list. status / trigger_type accept a
  // comma-separated list (OR within the field); since / until bound created_at.
  app.get<{ Querystring: { workflow_id?: string; status?: string; trigger_type?: string; since?: string; until?: string; limit?: string; offset?: string } }>('/runs', async (req, reply) => {
    const { workflow_id, status, trigger_type, since, until, limit, offset } = req.query;
    const csv = (v?: string) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : undefined);
    const num = (v?: string) => (v && /^\d+$/.test(v) ? parseInt(v, 10) : undefined);
    return db.getAllRuns({
      workflowId:  csv(workflow_id),
      status:      csv(status),
      triggerType: csv(trigger_type),
      since:       num(since),
      until:       num(until),
      limit:  limit  ? Math.min(parseInt(limit,  10), 200) : 50,
      offset: offset ? parseInt(offset, 10) : 0,
    });
  });

  // DELETE /runs/:id — cancel an active run
  app.delete<{ Params: { id: string } }>('/runs/:id', async (req, reply) => {
    const { id } = req.params;
    const run = db.getRun(id);
    if (!run) return reply.code(404).send({ error: 'Not found' });
    if (run.status !== 'running' && run.status !== 'queued') {
      return reply.code(409).send({ error: 'Run is not active' });
    }
    pool.cancel(id);
    db.updateRun(id, { status: 'cancelled', finishedAt: Date.now() });
    return reply.code(202).send({ ok: true });
  });

  // GET /runs/:id — fetch persisted run record
  app.get<{ Params: { id: string } }>('/runs/:id', async (req, reply) => {
    const run = db.getRun(req.params.id);
    if (!run) return reply.code(404).send({ error: 'Not found' });
    return run;
  });

  // GET /runs/:id/events — SSE stream of execution events
  app.get<{ Params: { id: string } }>('/runs/:id/events', async (req, reply) => {
    const { id } = req.params;
    const run = db.getRun(id);
    if (!run) return reply.code(404).send({ error: 'Not found' });

    reply.hijack();
    const res = reply.raw;

    res.writeHead(200, {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection':    'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const sendEvent = (event: WorkerEvent) => {
      try { res.write(`data: ${JSON.stringify(event)}\n\n`); } catch { /* client disconnected */ }
    };

    const stream = activeStreams.get(id);

    if (stream) {
      // Replay already-buffered events so the client catches up instantly.
      for (const ev of stream.buffer) sendEvent(ev);

      if (!stream.done) {
        // Subscribe to live events.
        const onEvent = (ev: WorkerEvent) => {
          sendEvent(ev);
          if (ev.type === 'done' || ev.type === 'error') res.end();
        };
        stream.emitter.on('event', onEvent);
        req.raw.on('close', () => stream.emitter.off('event', onEvent));
        return; // keep connection open
      }
    } else if (run.status === 'success' || run.status === 'error') {
      // Run finished and stream was cleaned up — synthesise a done event from DB.
      sendEvent({
        type:    'done',
        runId:   id,
        status:  run.status,
        results: run.results ?? {},
        logs:    run.logs ?? [],
      });
    }

    res.end();
  });

  // POST /runs/:id/rerun-node/:nodeId — re-execute one node with the inputs it had during the original run
  app.post<{
    Params: { id: string; nodeId: string };
    Body: { input: unknown; resolvedConfig: Record<string, unknown> };
  }>('/runs/:id/rerun-node/:nodeId', async (req, reply) => {
    const run = db.getRun(req.params.id);
    if (!run) return reply.code(404).send({ error: 'Run not found' });

    const wf = db.getWorkflow(run.workflowId);
    if (!wf) return reply.code(404).send({ error: 'Workflow not found' });
    if (wf.deprecated) return reply.code(409).send({ error: 'Workflow is deprecated and cannot be run' });

    const node = wf.nodes.find((n) => n.id === req.params.nodeId);
    if (!node) return reply.code(404).send({ error: 'Node not found in workflow' });

    const handler = getNode(node.type);
    if (!handler) return reply.code(400).send({ error: `Unknown node type: ${node.type}` });

    const { input, resolvedConfig } = req.body;
    const scripts = db.getAllScripts();
    const secrets = loadSecrets();

    // Use stored resolvedConfig so that handlers re-resolving template strings
    // get the already-interpolated values from the original run.
    const syntheticNode: WorkflowNode = { ...node, config: resolvedConfig ?? node.config };

    // Inject the run's stored results so that script nodes with node-binding inputs
    // can resolve upstream outputs correctly.
    const ctx: ExecutionContext = {
      runId:     `rerun-${req.params.id}`,
      results:   (run.results as Record<string, NodeExecutionResult>) ?? {},
      variables: {},
      scripts,
      secrets,
      log:       () => {},
      input,
    };

    const startedAt = Date.now();
    let result: NodeExecutionResult;
    try {
      result = await handler.execute(syntheticNode, ctx);
    } catch (err) {
      result = {
        nodeId:     node.id,
        status:     'error',
        output:     null,
        error:      err instanceof Error ? err.message : String(err),
        startedAt,
        finishedAt: Date.now(),
      };
    }
    result.input          = input;
    result.resolvedConfig = resolvedConfig ?? node.config;
    return reply.send(result);
  });
};

