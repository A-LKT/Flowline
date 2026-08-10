import { z } from 'zod';
import { registerNode } from '../engine/nodeRegistry';

const UNITS = ['minutes', 'hours', 'days', 'weeks', 'months'] as const;
const OUTPUT_MODES = ['date', 'time', 'datetime'] as const;

const configSchema = z.object({
  outputMode:  z.enum(OUTPUT_MODES).default('datetime'),
  offsetValue: z.number().default(0),
  offsetUnit:  z.enum(UNITS).default('days'),
});

registerNode({
  type:        'datetime',
  label:       'Date / Time',
  description: 'Returns the current date, time, or datetime with an optional offset. Output: { value, iso, timestamp }.',
  category:    'Data',
  configSchema,
  defaultConfig: {
    outputMode:  'datetime',
    offsetValue: 0,
    offsetUnit:  'days',
  },
  fieldMeta: {
    outputMode:  { type: 'select', options: [...OUTPUT_MODES] },
    offsetValue: { type: 'number' },
    offsetUnit:  { type: 'select', options: [...UNITS] },
  },
});
