import { z } from 'zod';
import { registerNode } from '../engine/nodeRegistry';

const labelConfigSchema = z.object({
  text:     z.string(),
  fontSize: z.enum(['sm', 'md', 'lg', 'xl']),
  color:    z.enum(['default', 'blue', 'green', 'amber', 'purple', 'red']),
});

registerNode({
  type: 'label',
  label: 'Label',
  description: 'A free-form text annotation for documenting sections of the workflow.',
  category: 'Decoration',
  configSchema: labelConfigSchema,
  defaultConfig: {
    text:     'Label',
    fontSize: 'md',
    color:    'default',
  },
  fieldMeta: {
    text:     { type: 'textarea' },
    fontSize: { type: 'select', options: ['sm', 'md', 'lg', 'xl'] },
    color:    { type: 'select', options: ['default', 'blue', 'green', 'amber', 'purple', 'red'] },
  },
});
