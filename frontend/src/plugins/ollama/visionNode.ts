import { z } from 'zod';
import { registerNode } from '../../engine/nodeRegistry';

registerNode({
  type:        'ollama-vision',
  label:       'Ollama Vision',
  description: 'Sends an image + prompt to a vision-capable Ollama model (e.g. llava, moondream2). Accepts a file path or base64 string.',
  category:    'AI',
  plugin:      'ollama',
  configSchema: z.object({
    model:       z.string().min(1, 'Model name is required'),
    image:       z.string().min(1, 'Image is required (file path or base64)'),
    prompt:      z.string().min(1, 'Prompt is required'),
    system:      z.string().default(''),
    temperature: z.coerce.number().min(0).max(2).default(0.1),
  }),
  defaultConfig: {
    model:       'llava',
    image:       '{{trigger.imagePath}}',
    prompt:      'Extract all information from this receipt as JSON with fields: merchant, date, currency, total, tax, items (array of {description, qty, unit_price, total}). Return only the JSON object.',
    system:      '',
    temperature: 0.1,
  },
  fieldMeta: {
    model:       { type: 'ollama-model' },
    image:       { type: 'text' },
    prompt:      { type: 'textarea' },
    system:      { type: 'textarea' },
    temperature: { type: 'number' },
  },
});
