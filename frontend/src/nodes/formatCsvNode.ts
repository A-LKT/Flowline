import { z } from 'zod';
import { registerNode } from '../engine/nodeRegistry';

const configSchema = z.object({
  input:     z.string().min(1, 'Input expression required'),
  delimiter: z.string().default(','),
});

registerNode({
  type: 'format-csv',
  label: 'Format CSV',
  description: 'Serialises an array of objects to a CSV string with a header row.',
  category: 'File',
  configSchema,
  defaultConfig: { input: '', delimiter: ',' },
});
