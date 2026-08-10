import { z } from 'zod';
import { registerNode } from '../engine/nodeRegistry';

const configSchema = z.object({
  expression: z.string().min(1, 'Expression is required'),
  case1:      z.string().default(''),
  case2:      z.string().default(''),
  case3:      z.string().default(''),
  case4:      z.string().default(''),
});

registerNode({
  type: 'switch',
  label: 'Switch',
  description: 'Routes to one of 4 branches by matching the expression value. Falls through to "default" if none match.',
  category: 'Logic',
  configSchema,
  defaultConfig: { expression: '', case1: '', case2: '', case3: '', case4: '' },
});
