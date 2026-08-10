import { z } from 'zod';
import { registerNode } from '../engine/nodeRegistry';
import type { ExecutionContext, NodeExecutionResult, WorkflowNode } from '../types';

const schema = z.object({ ms: z.coerce.number().int().min(0).max(300_000).default(1000) });

const execute = async (node: WorkflowNode, _context: ExecutionContext): Promise<NodeExecutionResult> => {
  const startedAt = Date.now();
  const { ms } = schema.parse(node.config);
  await new Promise<void>((r) => setTimeout(r, ms));
  return { nodeId: node.id, status: 'success', output: { waited: ms }, startedAt, finishedAt: Date.now() };
};

registerNode({
  type: 'delay',
  label: 'Delay',
  description: "Pauses execution for a fixed number of milliseconds (max 300000).",
  category: 'Control',
  configSchema: schema,
  outputSchema: z.object({ waited: z.number() }),
  execute,
});
