import { z } from 'zod';
import { registerNode } from '../engine/nodeRegistry';

const configSchema = z.object({
  name:  z.string().min(1, 'Variable name is required'),
  value: z.string(),
});

registerNode({
  type: 'set-variable',
  label: 'Set Variable',
  description: 'Sets or updates a workflow variable visible to all downstream nodes.',
  category: 'Control',
  configSchema,
  defaultConfig: { name: '', value: '' },
});
