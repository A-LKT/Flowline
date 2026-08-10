import { z } from 'zod';
import { registerNode } from '../../engine/nodeRegistry';

registerNode({
  type:        'ollama-completion',
  label:       'Ollama Completion',
  description: 'Sends a prompt to a local Ollama model and returns the generated text.',
  category:    'AI',
  plugin:      'ollama',
  configSchema: z.object({
    model:       z.string().min(1, 'Model name is required'),
    prompt:      z.string().min(1, 'Prompt is required'),
    system:      z.string().default(''),
    temperature: z.coerce.number().min(0).max(2).default(0.7),
  }),
  defaultConfig: {
    model:       'llama3',
    prompt:      '{{trigger.text}}',
    system:      '',
    temperature: 0.7,
  },
  fieldMeta: {
    model:       { type: 'ollama-model' },
    prompt:      { type: 'textarea' },
    system:      { type: 'textarea' },
    temperature: { type: 'number' },
  },
});
