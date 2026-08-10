import { z } from 'zod';
import { registerNode } from '../../engine/nodeRegistry';

registerNode({
  type:        'transcribe-audio',
  label:       'Transcribe Audio',
  description: 'Sends an audio URL to the Voice to Text service and returns the transcript.',
  category:    'AI',
  plugin:      'voice-to-text',
  configSchema: z.object({
    audioUrl:    z.string().min(1, 'Audio URL is required'),
    language:    z.string().default(''),
    endpoint:    z.string().default('/transcribe'),
    timeoutSecs: z.coerce.number().int().min(10).max(7200).default(1800),
  }),
  defaultConfig: {
    audioUrl:    '{{trigger.media[0].url}}',
    language:    '',
    endpoint:    '/transcribe',
    timeoutSecs: 1800,
  },
  fieldMeta: {
    audioUrl:    { type: 'text' },
    language:    { type: 'text' },
    endpoint:    { type: 'text' },
    timeoutSecs: { type: 'number' },
  },
});
