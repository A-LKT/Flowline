import { z } from 'zod';
import { registerNode } from '../engine/nodeRegistry';
import { evaluateExpression } from '../engine/expression';
import type { ExecutionContext, NodeExecutionResult, WorkflowNode } from '../types';

const schema = z.object({
  input: z.string().min(1),
  key:   z.string().default(''),
  type:  z.enum(['auto', 'string', 'number']).default('auto'),
  order: z.enum(['asc', 'desc']).default('asc'),
});

const getValue = (item: unknown, key: string): unknown =>
  key ? (item as Record<string, unknown>)[key] : item;

const execute = async (node: WorkflowNode, context: ExecutionContext): Promise<NodeExecutionResult> => {
  const startedAt = Date.now();
  const config = schema.parse(node.config);
  try {
    const raw = evaluateExpression(config.input, context);
    if (!Array.isArray(raw)) throw new Error(`input must be an array, got ${typeof raw}`);
    const sorted = [...(raw as unknown[])].sort((a, b) => {
      const av = getValue(a, config.key);
      const bv = getValue(b, config.key);
      const useNum = config.type === 'number' || (config.type === 'auto' && typeof av === 'number' && typeof bv === 'number');
      const cmp = useNum ? Number(av) - Number(bv) : String(av ?? '').localeCompare(String(bv ?? ''));
      return config.order === 'desc' ? -cmp : cmp;
    });
    return { nodeId: node.id, status: 'success', output: { result: sorted, count: sorted.length }, startedAt, finishedAt: Date.now() };
  } catch (err) {
    return { nodeId: node.id, status: 'error', output: null, error: err instanceof Error ? err.message : String(err), startedAt, finishedAt: Date.now() };
  }
};

registerNode({
  type: 'sort',
  label: 'Sort',
  description: "Sorts an array of objects by a field, ascending or descending.",
  category: 'Data',
  configSchema: schema,
  outputSchema: z.object({ result: z.array(z.unknown()), count: z.number() }),
  execute,
});
