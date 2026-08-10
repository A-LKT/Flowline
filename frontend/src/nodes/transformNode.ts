import { z } from 'zod';
import { registerNode } from '../engine/nodeRegistry';

const configSchema = z.object({
  code: z.string().min(1, 'Code is required'),
});


registerNode({
  type: 'transform',
  label: 'Transform',
  description: 'Runs inline JS to reshape data. return the new value. input = variables, context.outputs available.',
  category: 'Data',
  configSchema,
  defaultConfig: { code: 'return input;' },
});
