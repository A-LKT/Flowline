import { z } from 'zod';
import { registerNode } from '../engine/nodeRegistry';
import { resolveString } from '../engine/expression';
import type { ExecutionContext, NodeExecutionResult, WorkflowNode } from '../types';

const schema = z.object({ template: z.string() });

const execute = async (node: WorkflowNode, context: ExecutionContext): Promise<NodeExecutionResult> => {
  const startedAt = Date.now();
  const { template } = schema.parse(node.config);
  try {
    const text = resolveString(template, context);
    return { nodeId: node.id, status: 'success', output: { text }, startedAt, finishedAt: Date.now() };
  } catch (err) {
    return { nodeId: node.id, status: 'error', output: null, error: err instanceof Error ? err.message : String(err), startedAt, finishedAt: Date.now() };
  }
};

registerNode({
  type: 'render-template',
  label: 'Render Template',
  description: "Interpolates a template string using {{expression}} placeholders.",
  category: 'Data',
  configSchema: schema,
  outputSchema: z.object({ text: z.string() }),
  execute,
});
