import { z } from 'zod';
import { registerNode } from '../engine/nodeRegistry';
import { evaluateExpression } from '../engine/expression';
import type { ExecutionContext, NodeExecutionResult, WorkflowNode } from '../types';

const schema = z.object({ name: z.string().min(1), value: z.string() });

const execute = async (node: WorkflowNode, context: ExecutionContext): Promise<NodeExecutionResult> => {
  const startedAt = Date.now();
  const config = schema.parse(node.config);
  try {
    const resolved = evaluateExpression(config.value, context);
    context.variables[config.name] = resolved;
    return { nodeId: node.id, status: 'success', output: { name: config.name, value: resolved }, startedAt, finishedAt: Date.now() };
  } catch (err) {
    return { nodeId: node.id, status: 'error', output: null, error: err instanceof Error ? err.message : String(err), startedAt, finishedAt: Date.now() };
  }
};

registerNode({
  type: 'set-variable',
  label: 'Set Variable',
  description: "Creates or updates a workflow variable visible to all downstream nodes.",
  category: 'Control',
  configSchema: schema,
  outputSchema: z.object({ name: z.string(), value: z.unknown() }),
  execute,
});
