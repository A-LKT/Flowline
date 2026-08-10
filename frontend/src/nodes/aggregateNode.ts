import { z } from 'zod';
import { registerNode } from '../engine/nodeRegistry';

const configSchema = z.object({
  input:     z.string().min(1, 'Input expression required'),
  operation: z.enum(['count', 'sum', 'avg', 'min', 'max', 'first', 'last', 'join']).default('count'),
  field:     z.string().default(''),
  separator: z.string().default(', '),
});

registerNode({
  type: 'aggregate',
  label: 'Aggregate',
  description: 'Reduces an array to a single value: count, sum, avg, min, max, first, last, or join.',
  category: 'Data',
  configSchema,
  defaultConfig: { input: '', operation: 'count', field: '', separator: ', ' },
  fieldMeta: {
    operation: { type: 'select', options: ['count', 'sum', 'avg', 'min', 'max', 'first', 'last', 'join'] },
  },
});
