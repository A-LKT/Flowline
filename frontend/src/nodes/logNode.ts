import { z } from 'zod';
import { registerNode } from '../engine/nodeRegistry';

const configSchema = z.object({
  message: z.string().default(''),
  level:   z.enum(['info', 'warn', 'error']).default('info'),
});

registerNode({
  type:          'log',
  label:         'Log',
  description:   'Prints a message to the execution log.',
  category:      'Control',
  configSchema,
  defaultConfig: { message: '', level: 'info' },
  fieldMeta: {
    message: { type: 'text' },
    level:   { type: 'select', options: ['info', 'warn', 'error'] },
  },
});
