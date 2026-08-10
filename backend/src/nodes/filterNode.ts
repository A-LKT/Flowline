import { z } from 'zod';
import { registerNode } from '../engine/nodeRegistry';
import { buildOutputsMap, evaluateExpression, runUserCode } from '../engine/expression';
import type { ExecutionContext, NodeExecutionResult, WorkflowNode } from '../types';

const schema = z.object({
  input:     z.string().min(1),
  predicate: z.string().min(1),
});

const execute = async (node: WorkflowNode, context: ExecutionContext): Promise<NodeExecutionResult> => {
  const startedAt = Date.now();
  const config = schema.parse(node.config);
  try {
    const raw = evaluateExpression(config.input, context);
    if (!Array.isArray(raw)) throw new Error(`input must be an array, got ${typeof raw}`);
    const outputs = buildOutputsMap(context);
    const result = (raw as unknown[]).filter((item, index) =>
      runUserCode(
        `return Boolean(${config.predicate});`,
        ['item', 'index', 'array', 'outputs', 'variables', 'input'],
        [item, index, raw, outputs, context.variables, context.input],
        1000,
      ) as boolean
    );
    return { nodeId: node.id, status: 'success', output: { result, count: result.length, total: raw.length }, startedAt, finishedAt: Date.now() };
  } catch (err) {
    return { nodeId: node.id, status: 'error', output: null, error: err instanceof Error ? err.message : String(err), startedAt, finishedAt: Date.now() };
  }
};

registerNode({
  type: 'filter',
  label: 'Filter',
  description: "Filters an array by a predicate expression (scope: item, index, array).",
  category: 'Data',
  configSchema: schema,
  outputSchema: z.object({ result: z.array(z.unknown()), count: z.number(), total: z.number() }),
  execute,
});
