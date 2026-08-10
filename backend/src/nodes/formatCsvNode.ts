import { z } from 'zod';
import { registerNode } from '../engine/nodeRegistry';
import { evaluateExpression } from '../engine/expression';
import type { ExecutionContext, NodeExecutionResult, WorkflowNode } from '../types';

const schema = z.object({ input: z.string().min(1), delimiter: z.string().default(',') });

const escapeCell = (v: unknown, delim: string): string => {
  const s = String(v ?? '');
  return s.includes(delim) || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
};

const execute = async (node: WorkflowNode, context: ExecutionContext): Promise<NodeExecutionResult> => {
  const startedAt = Date.now();
  const config = schema.parse(node.config);
  try {
    const raw = evaluateExpression(config.input, context);
    if (!Array.isArray(raw) || raw.length === 0) {
      return { nodeId: node.id, status: 'success', output: { csv: '', rows: 0 }, startedAt, finishedAt: Date.now() };
    }
    const rows = raw as Record<string, unknown>[];
    const headers = Object.keys(rows[0]);
    const d = config.delimiter;
    const lines = [
      headers.map((h) => escapeCell(h, d)).join(d),
      ...rows.map((row) => headers.map((h) => escapeCell(row[h], d)).join(d)),
    ];
    return { nodeId: node.id, status: 'success', output: { csv: lines.join('\n'), rows: rows.length }, startedAt, finishedAt: Date.now() };
  } catch (err) {
    return { nodeId: node.id, status: 'error', output: null, error: err instanceof Error ? err.message : String(err), startedAt, finishedAt: Date.now() };
  }
};

registerNode({
  type: 'format-csv',
  label: 'Format CSV',
  description: "Converts an array of objects to a CSV string (header from first object).",
  category: 'File',
  configSchema: schema,
  outputSchema: z.object({ csv: z.string(), rows: z.number() }),
  execute,
});
