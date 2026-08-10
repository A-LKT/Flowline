import { z } from 'zod';
import { registerNode } from '../engine/nodeRegistry';

const conditionConfigSchema = z.object({
  expression: z.string().min(1, 'Expression is required'),
});

registerNode({
  type: 'condition',
  label: 'Condition',
  description: 'Evaluates an expression and branches on true or false.',
  category: 'Logic',
  configSchema: conditionConfigSchema,
  defaultConfig: { expression: 'true' },
});
