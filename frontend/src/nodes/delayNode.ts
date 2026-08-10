import { z } from 'zod';
import { registerNode } from '../engine/nodeRegistry';

const configSchema = z.object({
  ms: z.coerce.number().int().min(0).max(300_000).default(1000),
});

registerNode({
  type: 'delay',
  label: 'Delay',
  description: 'Pauses execution for a fixed number of milliseconds.',
  category: 'Control',
  configSchema,
  defaultConfig: { ms: 1000 },
  fieldMeta: { ms: { type: 'number' } },
});
