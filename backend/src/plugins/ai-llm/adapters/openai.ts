export type ChatMessage = { role: 'user' | 'assistant'; content: string };

export type LLMRequest = {
  model:       string;
  prompt:      string;
  system:      string;
  temperature: number;
  maxTokens:   number;   // 0 = provider default
  apiKey:      string;
  // Optional multi-turn conversation. When present it supersedes `prompt`
  // (used by the LLM assistant; the single-prompt nodes leave it undefined).
  messages?:   ChatMessage[];
};

export type LLMResponse = {
  text:  string;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
};

export async function callOpenAI(req: LLMRequest): Promise<LLMResponse> {
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

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${req.apiKey}` },
    body:    JSON.stringify(body),
  });

  if (!resp.ok) {
    const raw = await resp.text().catch(() => '');
    let msg = resp.statusText;
    try { msg = (JSON.parse(raw) as { error?: { message?: string } }).error?.message ?? raw; } catch { msg = raw || msg; }
    throw new Error(`OpenAI ${resp.status}: ${msg}`);
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
