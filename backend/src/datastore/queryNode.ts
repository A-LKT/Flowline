import { z } from 'zod';
import { registerNode } from '../engine/nodeRegistry';
import { resolveString, evaluateExpression } from '../engine/expression';
import * as ds from './queries';

registerNode({
  type:  'datastore-query',
  label: 'Datastore Query',
  description: 'Reads rows from a Data Store table by tableId, with an optional equality filter (JSON object) and a row limit (default 100). tableId is the table\'s id — wire it to a table you created in the Data Store UI.',
  category: 'Data Store',
  configSchema: z.object({
    tableId: z.string().min(1),
    filter:  z.string().default('').describe('JSON object of column:value equality filters, or empty for all rows'),
    limit:   z.coerce.number().int().min(1).max(1000).default(100),
  }),
  outputSchema: z.object({ rows: z.array(z.record(z.unknown())) }),
  async execute(node, context) {
    const startedAt = Date.now();
    const cfg     = node.config as { tableId: string; filter: string; limit: number };
    const tableId = resolveString(cfg.tableId, context);
    const limit   = Number(cfg.limit) || 100;

    let filter: Record<string, unknown> | undefined;
    if (cfg.filter?.trim()) {
      const resolved = evaluateExpression(cfg.filter, context);
      if (typeof resolved === 'object' && resolved !== null && !Array.isArray(resolved)) {
        filter = resolved as Record<string, unknown>;
      } else {
        try {
          filter = JSON.parse(typeof resolved === 'string' ? resolved : JSON.stringify(resolved)) as Record<string, unknown>;
        } catch {
          const finishedAt = Date.now();
          return { nodeId: node.id, status: 'error', output: null, error: 'filter must resolve to a JSON object', startedAt, finishedAt };
        }
      }
    }

    const rows = ds.listRows(tableId, filter).slice(0, limit);
    return { nodeId: node.id, status: 'success', output: { rows }, startedAt, finishedAt: Date.now() };
  },
});
