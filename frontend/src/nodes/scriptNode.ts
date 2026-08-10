import { z } from 'zod';
import { registerNode } from '../engine/nodeRegistry';

const inputBindingSchema = z.object({
  kind: z.enum(['node', 'primitive', 'variable']),
  nodeId: z.string().optional(),
  value: z.string().optional(),
  varName: z.string().optional(),
});

const scriptConfigSchema = z.object({
  scriptName: z.string().min(1, 'Script name is required'),
  inputs: z.record(z.string(), inputBindingSchema).optional(),
});

registerNode({
  type: 'script',
  label: 'Script',
  description: 'Runs a named script with access to workflow context.',
  category: 'Logic',
  configSchema: scriptConfigSchema,
  defaultConfig: { scriptName: '', inputs: {} },
  fieldMeta: { scriptName: { type: 'script-select' } },
});
