import { z } from 'zod';
import { registerNode } from '../engine/nodeRegistry';

registerNode({
  type: 'write-file',
  label: 'Write File',
  description: 'Triggers a browser download with the given content. Content expression can reference outputs.',
  category: 'File',
  configSchema: z.object({
    filename: z.string().min(1, 'Filename is required'),
    content:  z.string().min(1, 'Content expression required'),
    mimeType: z.string().default('text/plain'),
  }),
  defaultConfig: { filename: 'output.txt', content: '', mimeType: 'text/plain' },
  fieldMeta: {
    mimeType: { type: 'text' },
  },
});
