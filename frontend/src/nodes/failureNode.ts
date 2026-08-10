import { z } from 'zod';
import { registerNode } from '../engine/nodeRegistry';

registerNode({
  type: 'failure',
  label: 'Failure',
  description: 'Always fails unconditionally. Use to test error paths and failure handling in a workflow.',
  category: 'Control',
  configSchema: z.object({}),
  defaultConfig: {},
});
