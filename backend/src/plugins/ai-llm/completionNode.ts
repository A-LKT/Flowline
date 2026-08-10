import { z } from 'zod';
import { registerNode } from '../../engine/nodeRegistry';
import { resolveString } from '../../engine/expression';
import type { ExecutionContext, NodeExecutionResult, WorkflowNode } from '../../types';
import { callOpenAI }    from './adapters/openai';
import { callAnthropic } from './adapters/anthropic';
import { callPerplexity } from './adapters/perplexity';
import type { LLMRequest } from './adapters/openai';

const SECRET_KEYS: Record<string, string> = {
  openai:     'OPENAI_API_KEY',
  anthropic:  'ANTHROPIC_API_KEY',
  perplexity: 'PERPLEXITY_API_KEY',
};

const schema = z.object({
  provider:    z.enum(['openai', 'anthropic', 'perplexity']),
  model:       z.string().min(1, 'Model is required'),
  system:      z.string().default(''),
  prompt:      z.string().min(1, 'Prompt is required'),
  temperature: z.coerce.number().min(0).max(2).default(0.7),
  maxTokens:   z.coerce.number().int().min(0).catch(0).default(0),
});

function formatError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const cause = (err as NodeJS.ErrnoException).cause;
  const causeMsg = cause instanceof Error ? cause.message : cause != null ? String(cause) : null;
  return causeMsg ? `${err.message}: ${causeMsg}` : err.message;
}

const execute = async (node: WorkflowNode, context: ExecutionContext): Promise<NodeExecutionResult> => {
  const startedAt = Date.now();
  const config = schema.parse(node.config);

  try {
    const provider    = config.provider;
    const secretKey   = SECRET_KEYS[provider];
    const apiKey      = context.secrets[secretKey] ?? '';

    if (!apiKey) throw new Error(`Secret "${secretKey}" is not set. Add it in the Secrets panel.`);

    const req: LLMRequest = {
      model:       resolveString(config.model, context),
      prompt:      resolveString(config.prompt, context),
      system:      resolveString(config.system, context),
      temperature: config.temperature,
      maxTokens:   config.maxTokens,
      apiKey,
    };

    const adapter = provider === 'anthropic' ? callAnthropic
                  : provider === 'perplexity' ? callPerplexity
                  : callOpenAI;

    const result = await adapter(req);

    return {
      nodeId: node.id,
      status: 'success',
      output: { ...result, provider },
      startedAt,
      finishedAt: Date.now(),
    };
  } catch (err) {
    return {
      nodeId: node.id,
      status: 'error',
      output: null,
      error:  formatError(err),
      startedAt,
      finishedAt: Date.now(),
    };
  }
};

registerNode({
  type: 'ai-completion',
  label: 'AI Completion',
  description: 'Sends a prompt to OpenAI, Anthropic, or Perplexity. API keys come from Secrets (OPENAI_API_KEY, ANTHROPIC_API_KEY, PERPLEXITY_API_KEY).',
  category: 'AI',
  plugin: 'ai-llm',
  configSchema: schema,
  outputSchema: z.object({ text: z.string(), model: z.string(), provider: z.string(), usage: z.unknown().optional() }),
  execute,
});
