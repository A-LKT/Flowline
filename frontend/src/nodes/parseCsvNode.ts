import { z } from 'zod';
import { registerNode } from '../engine/nodeRegistry';

const configSchema = z.object({
  input:     z.string().min(1, 'Input expression required'),
  delimiter: z.string().default(','),
  hasHeader: z.boolean().default(true),
});

registerNode({
  type: 'parse-csv',
  label: 'Parse CSV',
  description: 'Parses a CSV string into an array of row objects (or arrays if no header).',
  category: 'File',
  configSchema,
  defaultConfig: { input: '', delimiter: ',', hasHeader: true },
  fieldMeta: { hasHeader: { type: 'checkbox' } },
});
