import { z } from 'zod';
import { registerNode } from '../engine/nodeRegistry';

const configSchema = z.object({
  expression: z.string().min(1, 'Expression is required'),
});

registerNode({
  type: 'fork',
  label: 'Fork',
  description: 'Evaluates an expression and routes execution to the true or false branch.',
  category: 'Logic',
  configSchema,
  defaultConfig: { expression: 'true' },
});
