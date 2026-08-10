import { z } from 'zod';
import { registerNode } from '../engine/nodeRegistry';

registerNode({
  type:        'run-workflow',
  label:       'Run Workflow',
  description: 'Triggers another workflow. Sync mode waits for completion and returns its results; async mode fires it and returns the run ID immediately.',
  category:    'Control',
  configSchema: z.object({
    workflowId: z.string().min(1, 'Workflow is required'),
    mode:       z.enum(['sync', 'async']).default('sync'),
    variables:  z.string().default(''),
  }),
  defaultConfig: { workflowId: '', mode: 'sync', variables: '' },
  fieldMeta: {
    workflowId: { type: 'workflow-select' },
    mode:       { type: 'select', options: ['sync', 'async'] },
    variables:  { type: 'monaco', language: 'json' },
  },
});
