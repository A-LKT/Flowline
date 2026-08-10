import { z } from 'zod';
import { registerNode } from '../../engine/nodeRegistry';

const PROVIDER_MODELS: Record<string, string> = {
  openai:     'gpt-5.4-mini',
  anthropic:  'claude-sonnet-4-6',
  perplexity: 'llama-3.1-sonar-small-128k-online',
};

registerNode({
  type:        'ai-completion',
  label:       'AI Completion',
  description: 'Sends a prompt to OpenAI, Anthropic Claude, or Perplexity and returns the generated text. API keys are read from Secrets (OPENAI_API_KEY, ANTHROPIC_API_KEY, PERPLEXITY_API_KEY).',
  category:    'AI',
  plugin:      'ai-llm',
  configSchema: z.object({
    provider:    z.enum(['openai', 'anthropic', 'perplexity']),
    model:       z.string().min(1, 'Model is required'),
    system:      z.string().default(''),
    prompt:      z.string().min(1, 'Prompt is required'),
    temperature: z.coerce.number().min(0).max(2).default(0.7),
    maxTokens:   z.coerce.number().int().min(0).catch(0).default(0),
  }),
  defaultConfig: {
    provider:    'openai',
    model:       PROVIDER_MODELS['openai'],
    system:      '',
    prompt:      '',
    temperature: 0.7,
    maxTokens:   0,
  },
  fieldMeta: {
    provider:    { type: 'select', options: ['openai', 'anthropic', 'perplexity'] },
    system:      { type: 'textarea' },
    prompt:      { type: 'textarea' },
    temperature: { type: 'number' },
    maxTokens:   { type: 'number' },
  },
});

export { PROVIDER_MODELS };
