import { z } from 'zod';
import { registerNode } from '../engine/nodeRegistry';

const configSchema = z.object({
  url:    z.string().min(1, 'URL is required'),
  format: z.enum(['text', 'json', 'base64']).default('text'),
  headers: z.string().default(''),
});

registerNode({
  type: 'read-file',
  label: 'Read File',
  description: 'Fetches a file from a URL and returns its content as text, JSON, or base64.',
  category: 'File',
  configSchema,
  defaultConfig: { url: '', format: 'text', headers: '' },
  fieldMeta: {
    format:  { type: 'select', options: ['text', 'json', 'base64'] },
    headers: { type: 'textarea' },
  },
});
