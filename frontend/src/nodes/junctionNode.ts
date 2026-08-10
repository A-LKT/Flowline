import { z } from 'zod';
import { registerNode } from '../engine/nodeRegistry';

registerNode({
  type: 'junction',
  label: 'Junction',
  description: 'A visual waypoint for organizing edge routing on the canvas. Has no effect on execution.',
  category: 'Decoration',
  configSchema: z.object({
    orientation: z.enum(['vertical', 'horizontal']),
  }),
  defaultConfig: {
    orientation: 'vertical',
  },
  fieldMeta: {
    orientation: { type: 'select', options: ['vertical', 'horizontal'] },
  },
});
