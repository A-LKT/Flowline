import { z } from 'zod';
import { registerNode } from '../engine/nodeRegistry';

const configSchema = z.object({
  data:              z.string().default(''),
  tolerateFailures:  z.boolean().default(true),
});

registerNode({
  type: 'iterator',
  label: 'Iterator',
  description: 'Iterates over each element of an array or each entry of an object.',
  category: 'Logic',
  configSchema,
  defaultConfig: { data: '', tolerateFailures: true },
  fieldMeta: {
    data:             { type: 'text', hint: 'Expression resolving to an array or object. Leave blank to use node input.' },
    tolerateFailures: { type: 'checkbox', hint: 'When off, the iterator stops as soon as any body node fails.' },
  },
});
