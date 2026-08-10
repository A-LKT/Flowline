import { z } from 'zod';
import { registerNode } from '../engine/nodeRegistry';

const configSchema = z.object({
  input:     z.string().min(1, 'Input expression required'),
  predicate: z.string().min(1, 'Predicate expression required'),
});

registerNode({
  type: 'filter',
  label: 'Filter',
  description: 'Filters an array. Predicate receives item, index, array, outputs, variables.',
  category: 'Data',
  configSchema,
  defaultConfig: { input: '', predicate: 'true' },
});
