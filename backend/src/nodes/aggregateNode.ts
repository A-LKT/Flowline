import { z } from 'zod';
import { registerNode } from '../engine/nodeRegistry';
import { evaluateExpression } from '../engine/expression';
import type { ExecutionContext, NodeExecutionResult, WorkflowNode } from '../types';

const schema = z.object({
  input:     z.string().min(1),
  operation: z.enum(['count', 'sum', 'avg', 'min', 'max', 'first', 'last', 'join']).default('count'),
  field:     z.string().default(''),
  separator: z.string().default(', '),
});

const pick = (item: unknown, field: string): unknown =>
  field ? (item as Record<string, unknown>)[field] : item;

const execute = async (node: WorkflowNode, context: ExecutionContext): Promise<NodeExecutionResult> => {
  const startedAt = Date.now();
  const config = schema.parse(node.config);
  try {
    const raw = evaluateExpression(config.input, context);
    if (!Array.isArray(raw)) throw new Error(`input must be an array, got ${typeof raw}`);
    const items = raw as unknown[];
    let result: unknown;
    switch (config.operation) {
      case 'count': result = items.length; break;
      case 'first': result = items[0]; break;
      case 'last':  result = items[items.length - 1]; break;
      case 'join':  result = items.map((i) => String(pick(i, config.field) ?? '')).join(config.separator); break;
      case 'sum':   result = items.reduce((a: number, i) => a + Number(pick(i, config.field) ?? 0), 0); break;
      case 'avg': { const s = items.reduce((a: number, i) => a + Number(pick(i, config.field) ?? 0), 0); result = items.length ? s / items.length : 0; break; }
      case 'min': result = Math.min(...items.map((i) => Number(pick(i, config.field) ?? Infinity))); break;
      case 'max': result = Math.max(...items.map((i) => Number(pick(i, config.field) ?? -Infinity))); break;
    }
    return { nodeId: node.id, status: 'success', output: { result, operation: config.operation, count: items.length }, startedAt, finishedAt: Date.now() };
  } catch (err) {
    return { nodeId: node.id, status: 'error', output: null, error: err instanceof Error ? err.message : String(err), startedAt, finishedAt: Date.now() };
  }
};

registerNode({
  type: 'aggregate',
  label: 'Aggregate',
  description: "Reduces an array to a single value (count, sum, avg, min, max, first, last, join).",
  category: 'Data',
  configSchema: schema,
  outputSchema: z.object({ result: z.unknown(), operation: z.string(), count: z.number() }),
  execute,
});
