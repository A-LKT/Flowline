import { z } from 'zod';
import { registerNode } from '../engine/nodeRegistry';

const configSchema = z.object({
  dir:     z.string().default(''),
  pattern: z.string().default(''),
});

registerNode({
  type: 'list-files',
  label: 'List Files',
  description: 'Lists files in a subdirectory of the server data files area (oldest first). Use to enumerate a filesystem queue.',
  category: 'File',
  configSchema,
  defaultConfig: { dir: 'queue', pattern: '*.json' },
});
