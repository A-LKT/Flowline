import { z } from 'zod';
import { registerNode } from '../engine/nodeRegistry';
import { evaluateExpression } from '../engine/expression';
import type { ExecutionContext, NodeExecutionResult, WorkflowNode } from '../types';

const schema = z.object({
  input:     z.string().min(1),
  delimiter: z.string().default(','),
  hasHeader: z.boolean().default(true),
});

const parseRow = (line: string, delim: string): string[] => {
  const cells: string[] = [];
  let inQuote = false;
  let cell = '';
  for (const ch of line) {
    if (ch === '"')              { inQuote = !inQuote; continue; }
    if (ch === delim && !inQuote) { cells.push(cell); cell = ''; continue; }
    cell += ch;
  }
  cells.push(cell);
  return cells;
};

const execute = async (node: WorkflowNode, context: ExecutionContext): Promise<NodeExecutionResult> => {
  const startedAt = Date.now();
  const config = schema.parse(node.config);
  try {
    const raw   = evaluateExpression(config.input, context);
    const text  = String(raw ?? '');
    const lines = text.split('\n').map((l) => l.trimEnd()).filter((l) => l.length > 0);
    let rows: unknown[];
    if (config.hasHeader && lines.length > 0) {
      const headers = parseRow(lines[0], config.delimiter);
      rows = lines.slice(1).map((l) => {
        const cells = parseRow(l, config.delimiter);
        return Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? '']));
      });
    } else {
      rows = lines.map((l) => parseRow(l, config.delimiter));
    }
    return { nodeId: node.id, status: 'success', output: { rows, count: rows.length }, startedAt, finishedAt: Date.now() };
  } catch (err) {
    return { nodeId: node.id, status: 'error', output: null, error: err instanceof Error ? err.message : String(err), startedAt, finishedAt: Date.now() };
  }
};

registerNode({
  type: 'parse-csv',
  label: 'Parse CSV',
  description: "Parses a CSV string into an array of row objects (first row = header).",
  category: 'File',
  configSchema: schema,
  outputSchema: z.object({ rows: z.array(z.record(z.unknown())), count: z.number() }),
  execute,
});
