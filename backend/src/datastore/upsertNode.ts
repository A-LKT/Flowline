import { z } from 'zod';
import { registerNode } from '../engine/nodeRegistry';
import { resolveString, evaluateExpression } from '../engine/expression';
import * as ds from './queries';

registerNode({
  type:  'datastore-upsert',
  label: 'Datastore Upsert',
  description: 'Inserts or updates a row in a Data Store table. If key columns (set in the Data Store UI) match an existing row it updates, else inserts. data is a JSON object of column:value; unknown columns are ignored. tableId is the table\'s id.',
  category: 'Data Store',
  configSchema: z.object({
    tableId: z.string().min(1),
    data:    z.string().min(1).describe('JSON object mapping column names to values; supports {{expressions}}'),
  }),
  outputSchema: z.object({ action: z.enum(['inserted', 'updated']), row: z.record(z.unknown()) }),
  async execute(node, context) {
    const startedAt = Date.now();
    const cfg     = node.config as { tableId: string; data: string };
    const tableId = resolveString(cfg.tableId, context);

    const rawData = evaluateExpression(cfg.data, context);
    let data: Record<string, unknown>;
    if (typeof rawData === 'object' && rawData !== null && !Array.isArray(rawData)) {
      data = rawData as Record<string, unknown>;
    } else {
      try {
        data = JSON.parse(typeof rawData === 'string' ? rawData : JSON.stringify(rawData)) as Record<string, unknown>;
      } catch {
        return { nodeId: node.id, status: 'error', output: null, error: 'data must resolve to a JSON object', startedAt, finishedAt: Date.now() };
      }
    }

    const result = ds.upsertRow(tableId, data);
    return { nodeId: node.id, status: 'success', output: result, startedAt, finishedAt: Date.now() };
  },
});
