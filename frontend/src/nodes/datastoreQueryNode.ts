import { z } from 'zod';
import { registerNode } from '../engine/nodeRegistry';

registerNode({
  type:        'datastore-query',
  label:       'Datastore Query',
  description: 'Queries rows from a user-managed data store table with optional equality filters.',
  category:    'Data Store',
  configSchema: z.object({
    tableId: z.string().min(1, 'tableId is required'),
    filter:  z.string().default(''),
    limit:   z.coerce.number().int().min(1).max(1000).default(100),
  }),
  defaultConfig: { tableId: '', filter: '', limit: 100 },
  fieldMeta: {
    tableId: { type: 'datastore-table' },
    filter:  { type: 'text' },
    limit:   { type: 'number' },
  },
});
