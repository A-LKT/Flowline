import { z } from 'zod';
import { registerNode } from '../engine/nodeRegistry';

const configSchema = z.object({
  expression: z.string().min(1, 'Expression is required'),
});

registerNode({
  type: 'math',
  label: 'Math',
  description: 'Evaluates a mathematical expression. Variables, outputs, and Math are in scope.',
  category: 'Data',
  configSchema,
  defaultConfig: { expression: '1 + 1' },
});
