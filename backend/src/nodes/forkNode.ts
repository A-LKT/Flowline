import { z } from 'zod';
import { registerNode } from '../engine/nodeRegistry';
import { evaluateExpression } from '../engine/expression';
import type { ExecutionContext, NodeExecutionResult, WorkflowNode } from '../types';

const schema = z.object({ expression: z.string().min(1) });

const execute = async (node: WorkflowNode, context: ExecutionContext): Promise<NodeExecutionResult> => {
  const startedAt = Date.now();
  const { expression } = schema.parse(node.config);
  try {
    const result = evaluateExpression(expression, context);
    return { nodeId: node.id, status: 'success', output: { result: Boolean(result), branch: result ? 'true' : 'false' }, startedAt, finishedAt: Date.now() };
  } catch (err) {
    return { nodeId: node.id, status: 'error', output: null, error: err instanceof Error ? err.message : String(err), startedAt, finishedAt: Date.now() };
  }
};

registerNode({
  type: 'fork',
  label: 'Fork',
  description: "Like Condition but rendered as a diamond. Routes to `true`/`false` handle.",
  category: 'Logic',
  configSchema: schema,
  outputSchema: z.object({ result: z.boolean(), branch: z.enum(["true","false"]) }),
  handles: ["true","false"],
  execute,
});
