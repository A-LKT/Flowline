import { z } from 'zod';
import { registerNode } from '../engine/nodeRegistry';

const configSchema = z.object({
  input: z.string().min(1, 'Input expression required'),
  key:   z.string().default(''),
  type:  z.enum(['auto', 'string', 'number']).default('auto'),
  order: z.enum(['asc', 'desc']).default('asc'),
});

registerNode({
  type: 'sort',
  label: 'Sort',
  description: 'Sorts an array by a field. key = field name (leave empty to sort primitives).',
  category: 'Data',
  configSchema,
  defaultConfig: { input: '', key: '', type: 'auto', order: 'asc' },
  fieldMeta: {
    type:  { type: 'select', options: ['auto', 'string', 'number'] },
    order: { type: 'select', options: ['asc', 'desc'] },
  },
});
