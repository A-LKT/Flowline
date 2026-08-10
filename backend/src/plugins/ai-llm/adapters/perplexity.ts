import type { LLMRequest, LLMResponse } from './openai';

// Perplexity uses the OpenAI wire format — only the base URL and auth differ.
export async function callPerplexity(req: LLMRequest): Promise<LLMResponse> {
  type Message = { role: string; content: string };
  const messages: Message[] = [];
  if (req.system) messages.push({ role: 'system', content: req.system });
  if (req.messages?.length) messages.push(...req.messages);
  else messages.push({ role: 'user', content: req.prompt });

  const body: Record<string, unknown> = {
    model:       req.model,
    messages,
    temperature: req.temperature,
  };
  if (req.maxTokens > 0) body.max_tokens = req.maxTokens;

  const resp = await fetch('https://api.perplexity.ai/chat/completions', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${req.apiKey}` },
    body:    JSON.stringify(body),
  });

  if (!resp.ok) {
    const raw = await resp.text().catch(() => '');
    let msg = resp.statusText;
    try { msg = (JSON.parse(raw) as { error?: { message?: string } }).error?.message ?? raw; } catch { msg = raw || msg; }
    throw new Error(`Perplexity ${resp.status}: ${msg}`);
  }

  const data = await resp.json() as {
    choices: { message: { content: string } }[];
    model:   string;
    usage:   { prompt_tokens: number; completion_tokens: number };
  };

  return {
    text:  data.choices[0]?.message?.content ?? '',
    model: data.model,
    usage: { inputTokens: data.usage.prompt_tokens, outputTokens: data.usage.completion_tokens },
  };
}
