import { z } from 'zod';
import { registerNode } from '../engine/nodeRegistry';

const configSchema = z.object({
  from: z.string().min(1, 'Source is required'),
  to:   z.string().min(1, 'Destination is required'),
});

registerNode({
  type: 'move-file',
  label: 'Move File',
  description: 'Atomically moves/renames a file within the data files area. Returns moved:false if the source is gone — use as an atomic claim so parallel drainers never grab the same queue file.',
  category: 'File',
  configSchema,
  defaultConfig: { from: 'queue/job.json', to: 'processing/job.json' },
});
