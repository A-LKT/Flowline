import { z } from 'zod';
import { registerNode } from '../engine/nodeRegistry';

const configSchema = z.object({
  path:   z.string().min(1, 'Path is required'),
  format: z.enum(['text', 'json']).default('text'),
});

registerNode({
  type: 'read-local-file',
  label: 'Read Local File',
  description: 'Reads a file from the server data files area by relative path (text or JSON). Distinct from Read File, which fetches a URL.',
  category: 'File',
  configSchema,
  defaultConfig: { path: 'queue/job.json', format: 'json' },
  fieldMeta: {
    format: { type: 'select', options: ['text', 'json'] },
  },
});
