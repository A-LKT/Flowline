import { z } from 'zod';
import { registerNode } from '../engine/nodeRegistry';

const configSchema = z.object({
  template: z.string(),
});

registerNode({
  type: 'render-template',
  label: 'Render Template',
  description: 'Interpolates a text template using {{expression}} syntax.',
  category: 'Data',
  configSchema,
  defaultConfig: { template: 'Hello, {{variables.name}}!' },
  fieldMeta: { template: { type: 'textarea' } },
});
