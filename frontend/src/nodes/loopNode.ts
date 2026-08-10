import { z } from 'zod';
import { registerNode } from '../engine/nodeRegistry';

const configSchema = z.object({
  condition:         z.string().min(1, 'Condition is required'),
  maxIterations:     z.coerce.number().int().min(1).max(10_000).default(100),
  tolerateFailures:  z.boolean().default(true),
});

registerNode({
  type: 'loop',
  label: 'Loop',
  description: 'Repeats a section of the workflow while a condition is true.',
  category: 'Logic',
  configSchema,
  defaultConfig: { condition: 'iteration < 10', maxIterations: 100, tolerateFailures: true },
  fieldMeta: {
    condition:        { type: 'monaco', hint: 'Boolean expression. Available: iteration, context, variables, outputs' },
    maxIterations:    { type: 'number' },
    tolerateFailures: { type: 'checkbox', hint: 'When off, the loop stops as soon as any body node fails.' },
  },
});
