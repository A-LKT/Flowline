import { z } from 'zod';
import { registerNode } from '../engine/nodeRegistry';

const configSchema = z.object({
  path: z.string().min(1, 'Path is required'),
});

registerNode({
  type: 'delete-file',
  label: 'Delete File',
  description: 'Deletes a file from the data files area by relative path. Returns deleted:false if already gone. Use to remove a queue job after processing.',
  category: 'File',
  configSchema,
  defaultConfig: { path: 'processing/job.json' },
});
