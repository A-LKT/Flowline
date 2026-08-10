import { z } from 'zod';
import { registerNode } from '../engine/nodeRegistry';

const httpConfigSchema = z.object({
  // Relaxed from .url() — templates like {{outputs["id"].host}} are valid at config time
  url:     z.string().min(1, 'URL is required'),
  method:  z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']),
  headers: z.string().default(''),
  body:    z.string().optional(),
});

registerNode({
  type:         'http',
  label:        'HTTP Request',
  description:  'Sends an HTTP request to a URL and returns the response.',
  category:     'Integration',
  configSchema: httpConfigSchema,
  defaultConfig: {
    url:    'https://example.com/api',
    method: 'GET',
    headers: '',
  },
  fieldMeta: {
    headers: { type: 'textarea' },
  },
});
