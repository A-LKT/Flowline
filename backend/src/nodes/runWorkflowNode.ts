import { z } from 'zod';
import { registerNode } from '../engine/nodeRegistry';
import { resolveString } from '../engine/expression';
import { executeWorkflow } from '../engine/executor';
import { getWorkflow, getAllScripts } from '../db';
import { loadSecrets } from '../runner/secrets';
import type { ExecutionContext, NodeExecutionResult, WorkflowNode } from '../types';

const MAX_DEPTH = 5;

const configSchema = z.object({
  workflowId: z.string().min(1, 'Workflow is required'),
  mode:       z.enum(['sync', 'async']).default('sync'),
  variables:  z.string().default(''),
});

const execute = async (node: WorkflowNode, context: ExecutionContext): Promise<NodeExecutionResult> => {
  const startedAt = Date.now();
  try {
    const config = configSchema.parse(node.config);

    const depth = (context.variables.__workflowDepth__ as number | undefined) ?? 0;
    if (depth >= MAX_DEPTH) {
      throw new Error(`Max workflow nesting depth (${MAX_DEPTH}) exceeded`);
    }

    const target = getWorkflow(config.workflowId);
    if (!target) throw new Error(`Workflow not found: ${config.workflowId}`);

    const vars: Record<string, unknown> = { __workflowDepth__: depth + 1 };
    if (config.variables.trim()) {
      const raw = resolveString(config.variables, context);
      Object.assign(vars, JSON.parse(raw) as Record<string, unknown>);
    }

    if (config.mode === 'async') {
      const port = process.env.PORT ?? '3001';
      const resp = await fetch(`http://localhost:${port}/workflows/${config.workflowId}/run`, {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(process.env.API_TOKEN ? { Authorization: `Bearer ${process.env.API_TOKEN}` } : {}),
        },
        body:    JSON.stringify(vars),
      });
      if (!resp.ok) throw new Error(`Failed to start workflow: HTTP ${resp.status}`);
      const { runId } = await resp.json() as { runId: string };
      return { nodeId: node.id, status: 'success', output: { runId, mode: 'async' }, startedAt, finishedAt: Date.now() };
    }

    // Sync — execute directly in this worker thread and await completion.
    const scripts = getAllScripts();
    const secrets = loadSecrets();
    const prefix  = `[↳ ${target.name}]`;

    const childCtx = await executeWorkflow(target, scripts, secrets, {
      onNodeStart: (_id, nodeName) => {
        context.log(`${prefix} → [${nodeName}]`);
      },
      onNodeComplete: (_id, nodeName, status, _input, _output, error, startedAt: number, finishedAt: number) => {
        const dur = finishedAt - startedAt;
        context.log(status === 'error'
          ? `${prefix} ✗ [${nodeName}] ${dur}ms — ${error ?? 'unknown error'}`
          : `${prefix} ✓ [${nodeName}] ${dur}ms`);
      },
      onLog: (msg) => context.log(`${prefix} ${msg}`),
    }, vars);

    const failed = Object.values(childCtx.results).find((r) => r.status === 'error');
    if (failed) {
      const failedNode = target.nodes.find((n) => n.id === failed.nodeId);
      throw new Error(`[${failedNode?.name ?? failed.nodeId}] ${failed.error ?? 'unknown error'}`);
    }

    return { nodeId: node.id, status: 'success', output: childCtx.results, startedAt, finishedAt: Date.now() };
  } catch (err) {
    return { nodeId: node.id, status: 'error', output: null, error: err instanceof Error ? err.message : String(err), startedAt, finishedAt: Date.now() };
  }
};

registerNode({
  type: 'run-workflow',
  label: 'Run Workflow',
  description: "Runs another workflow. sync: returns child results map; async: returns {runId, mode}. Max nesting depth 5.",
  category: 'Control',
  configSchema: configSchema,
  outputSchema: z.unknown(),
  execute,
});
