import { z } from 'zod';
import { registerNode } from '../engine/nodeRegistry';
import { evaluateExpression } from '../engine/expression';
import type { ExecutionContext, NodeExecutionResult, WorkflowNode } from '../types';

const schema = z.object({
  data:             z.string().default(''),
  tolerateFailures: z.boolean().default(true),
});

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const execute = async (node: WorkflowNode, context: ExecutionContext): Promise<NodeExecutionResult> => {
  const startedAt = Date.now();
  const config = schema.parse(node.config);

  try {
    const prevOutput = context.results[node.id]?.output as { index?: number } | undefined;
    const index = (prevOutput?.index ?? -1) + 1;

    // Resolve data: evaluate the expression if configured, otherwise use node input.
    const raw = config.data.trim() ? evaluateExpression(config.data, context) : context.input;
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;

    if (Array.isArray(data)) {
      if (index >= data.length) {
        return { nodeId: node.id, status: 'success', output: { continue: false }, startedAt, finishedAt: Date.now() };
      }
      return { nodeId: node.id, status: 'success', output: { continue: true, index, item: data[index] }, startedAt, finishedAt: Date.now() };
    }

    if (isPlainObject(data)) {
      const entries = Object.entries(data);
      if (index >= entries.length) {
        return { nodeId: node.id, status: 'success', output: { continue: false }, startedAt, finishedAt: Date.now() };
      }
      return { nodeId: node.id, status: 'success', output: { continue: true, index, item: entries[index] }, startedAt, finishedAt: Date.now() };
    }

    throw new Error('Iterator expects an array or object');
  } catch (err) {
    return {
      nodeId: node.id,
      status: 'error',
      output: null,
      error: err instanceof Error ? err.message : String(err),
      startedAt,
      finishedAt: Date.now(),
    };
  }
};

registerNode({
  type: 'iterator',
  label: 'Iterator',
  description: "Iterates an array/object, emitting one item per pass through the `iterator` body handle until exhausted, then the `done` handle. Loop via a back-edge with fromHandle \"iterator\".",
  category: 'Logic',
  configSchema: schema,
  outputSchema: z.object({ continue: z.boolean(), index: z.number().optional(), item: z.unknown().optional() }),
  handles: ["iterator","done"],
  execute,
});
