import type { LLMRequest, LLMResponse } from './openai';

const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_MAX_TOKENS = 1024; // required by the API

export async function callAnthropic(req: LLMRequest): Promise<LLMResponse> {
  const body: Record<string, unknown> = {
    model:      req.model,
    messages:   req.messages?.length ? req.messages : [{ role: 'user', content: req.prompt }],
    max_tokens: req.maxTokens > 0 ? req.maxTokens : DEFAULT_MAX_TOKENS,
    temperature: req.temperature,
  };
  if (req.system) body.system = req.system;

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: {
      'Content-Type':    'application/json',
      'x-api-key':       req.apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const raw = await resp.text().catch(() => '');
    let msg = resp.statusText;
    try { msg = (JSON.parse(raw) as { error?: { message?: string } }).error?.message ?? raw; } catch { msg = raw || msg; }
    throw new Error(`Anthropic ${resp.status}: ${msg}`);
  }

  const data = await resp.json() as {
    content: { type: string; text: string }[];
    model:   string;
    usage:   { input_tokens: number; output_tokens: number };
  };

  const text = data.content.find((b) => b.type === 'text')?.text ?? '';

  return {
    text,
    model: data.model,
    usage: { inputTokens: data.usage.input_tokens, outputTokens: data.usage.output_tokens },
  };
}
