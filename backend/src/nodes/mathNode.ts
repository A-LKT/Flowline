import { z } from 'zod';
import { registerNode } from '../engine/nodeRegistry';
import { buildOutputsMap, runUserCode } from '../engine/expression';
import type { ExecutionContext, NodeExecutionResult, WorkflowNode } from '../types';

const schema = z.object({ expression: z.string().min(1) });

const execute = async (node: WorkflowNode, context: ExecutionContext): Promise<NodeExecutionResult> => {
  const startedAt = Date.now();
  const { expression } = schema.parse(node.config);
  try {
    const outputs = buildOutputsMap(context);
    // withScope=true allows `with(variables)` so short names like `x` resolve from variables.
    const result = runUserCode(
      `return (${expression});`,
      ['variables', 'outputs', 'input'],
      [context.variables, outputs, context.input],
      2000,
      true,
    ) as number;
    return { nodeId: node.id, status: 'success', output: { result }, startedAt, finishedAt: Date.now() };
  } catch (err) {
    return { nodeId: node.id, status: 'error', output: null, error: err instanceof Error ? err.message : String(err), startedAt, finishedAt: Date.now() };
  }
};

registerNode({
  type: 'math',
  label: 'Math',
  description: "Evaluates a math expression (Math, Number, parseInt/parseFloat in scope).",
  category: 'Data',
  configSchema: schema,
  outputSchema: z.object({ result: z.number() }),
  execute,
});
