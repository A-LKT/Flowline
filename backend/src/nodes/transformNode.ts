import { z } from 'zod';
import { registerNode } from '../engine/nodeRegistry';
import { buildOutputsMap, runUserCode } from '../engine/expression';
import type { ExecutionContext, NodeExecutionResult, WorkflowNode } from '../types';

const schema = z.object({ code: z.string().min(1) });

const execute = async (node: WorkflowNode, context: ExecutionContext): Promise<NodeExecutionResult> => {
  const startedAt = Date.now();
  const { code } = schema.parse(node.config);
  try {
    const outputs = buildOutputsMap(context);
    const out = runUserCode(code, ['outputs', 'variables', 'secrets', 'log', 'input', 'trigger'], [outputs, context.variables, context.secrets, context.log, context.input, context.variables.trigger ?? null], 5000);
    return { nodeId: node.id, status: 'success', output: out, startedAt, finishedAt: Date.now() };
  } catch (err) {
    return { nodeId: node.id, status: 'error', output: null, error: err instanceof Error ? err.message : String(err), startedAt, finishedAt: Date.now() };
  }
};

registerNode({
  type: 'transform',
  label: 'Transform',
  description: "Runs arbitrary JS (outputs, variables, log in scope) and returns the result.",
  category: 'Data',
  configSchema: schema,
  outputSchema: z.unknown(),
  execute,
});
