import { z } from 'zod';
import { registerNode } from '../engine/nodeRegistry';

registerNode({
  type:        'datastore-upsert',
  label:       'Datastore Upsert',
  description: 'Inserts or updates a row in a user-managed data store table.',
  category:    'Data Store',
  configSchema: z.object({
    tableId: z.string().min(1, 'tableId is required'),
    data:    z.string().min(1, 'data is required'),
  }),
  defaultConfig: { tableId: '', data: '{{JSON.stringify(input)}}' },
  fieldMeta: {
    tableId: { type: 'datastore-table' },
    data:    { type: 'textarea' },
  },
});
