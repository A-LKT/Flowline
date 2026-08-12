import { randomUUID } from 'crypto';
import { TOOL_SCHEMAS, PROPOSE_SCHEMA, runTool, validateProposal, resolveProposalTarget, type ChatScope, type Proposal, type ProposalKind } from './tools';
import type { ChatMessage } from '../ai-llm/adapters/openai';

type ToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } };
type OAMessage =
  | { role: 'system' | 'user' | 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

export type AgentResult = {
  text: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
  trace: { name: string; args: unknown; permitted: boolean }[];
  proposals: Proposal[];
};

// The model sometimes ends a turn by promising to act ("let me propose…",
// "I'll fix that") without actually calling a tool — so the user never gets the
// result. If the tail of a tool-less reply reads like such a promise and nothing
// was proposed this turn, we nudge it once to act now instead of finishing.
const PROMISE_RE = /\b(i['’]?ll|i will|i'?m going to|i am going to|let me|give me a (?:sec|second|moment)|one moment|hang on|coming up|shortly|next,? i)\b/i;
const looksLikePromise = (text: string): boolean => PROMISE_RE.test(text.slice(-200));

// The model is told to call propose_artifact, never to paste the artifact JSON in
// its reply. With tool_choice:'auto' it sometimes ignores that and dumps a fenced
// JSON block instead — which never becomes an Apply card, so the user can't act on
// it. Detect a fenced block whose body looks like one of our artifact shapes
// (workflow/script/trigger, keyed on the documented fields) so we can nudge it to
// resubmit through the tool. Deliberately narrow, to avoid firing on the small
// illustrative snippets a normal explanation might include.
const FENCED_BLOCK_RE = /```[a-zA-Z]*\s*([\s\S]*?)```/g;
export const looksLikePastedArtifact = (text: string): boolean => {
  for (const m of text.matchAll(FENCED_BLOCK_RE)) {
    const body = m[1];
    if (!body.includes('{')) continue;
    if (/"nodes"\s*:/.test(body) || /"edges"\s*:/.test(body)) return true;   // workflow
    if (/"kind"\s*:/.test(body) && /"config"\s*:/.test(body)) return true;   // trigger
    if (/"code"\s*:/.test(body) && /"name"\s*:/.test(body)) return true;     // script
  }
  return false;
};

// Decide whether a tool-less final reply should be nudged once, and with what
// message. Returns null to let the reply stand. Shared by both provider loops.
const ACT_NUDGE =
  'You said you would act but produced nothing. Do it now, in this turn — call propose_artifact (or the read tools you need). If you have in fact already finished, restate the concrete result without promising further steps.';
const PASTED_NUDGE =
  'You pasted an artifact as JSON in your reply instead of calling propose_artifact, so the user got no Apply card and cannot act on it. Resubmit it now, in this turn, by calling propose_artifact with { kind, json } in the documented format (set targetId to update an existing artifact). Keep only a short plain-language explanation in your reply — do not paste the JSON again.';
function nudgeFor(text: string): string | null {
  if (!text.trim()) return null;
  if (looksLikePromise(text)) return ACT_NUDGE;
  if (looksLikePastedArtifact(text)) return PASTED_NUDGE;
  return null;
}

// ── Shared tool handling (used by both the OpenAI and Anthropic loops) ─────────
// propose_artifact is not a read tool: validate structure, resolve/scope-check an
// update target, record the proposal for the UI, and return the model-facing
// result. Mutates `trace`/`proposals`. Never mutates the user's artifacts.
function recordProposal(
  args: Record<string, unknown>,
  scope: ChatScope,
  trace: AgentResult['trace'],
  proposals: Proposal[],
): { ok: true; note: string } | { ok: false; errors: string[] } {
  const kind = String(args.kind ?? '');
  const check = validateProposal(kind, args.json);
  const errors: string[] = check.ok ? [] : (check.errors ?? []);

  // If the model asked to update an existing artifact, resolve its id to a real,
  // in-scope one now — so the client never gets a name it can't act on and the
  // update can't silently no-op. Reject (don't fall back to a create) if it
  // doesn't resolve, so the model fixes it or lists first.
  const rawTarget = args.targetId != null ? String(args.targetId).trim() : '';
  let targetId: string | undefined;
  const knownKind = kind === 'workflow' || kind === 'script' || kind === 'trigger';
  if (rawTarget && knownKind) {
    const resolved = resolveProposalTarget(kind as ProposalKind, rawTarget, scope);
    if (resolved) targetId = resolved;
    else errors.push(`Cannot update "${rawTarget}" — no ${kind} with that id or name is in this chat's read scope. Call list_${kind}s first to get a valid id, or omit targetId to create a new one.`);
  }

  const permitted = errors.length === 0;
  trace.push({ name: 'propose_artifact', args: { kind, targetId: targetId ?? (rawTarget || undefined) }, permitted });
  if (permitted) {
    proposals.push({ id: randomUUID(), kind: kind as ProposalKind, summary: check.summary ?? kind, json: args.json, targetId });
    return { ok: true, note: targetId
      ? 'Update proposal shown to the user as an Update card. Do not repeat the JSON in your reply.'
      : 'Proposal shown to the user as an Apply card. Do not repeat the JSON in your reply.' };
  }
  return { ok: false, errors };
}

// Run a scope-gated read tool, record it in the trace, and return its result.
function recordToolRun(name: string, args: Record<string, unknown>, scope: ChatScope, trace: AgentResult['trace']): unknown {
  const result = runTool(name, args, scope);
  const permitted = !(result && typeof result === 'object' && 'error' in (result as object) && String((result as { error?: string }).error).startsWith('Not permitted'));
  trace.push({ name, args, permitted });
  return result;
}

// Agentic loop over OpenAI function-calling. The model may call the scope-gated
// read tools (tools.ts) to pull in the user's own artifacts/runs before answering.
// Read-only: no tool mutates anything. Capped iterations bound cost/latency.
export async function runOpenAIAgent(opts: {
  apiKey: string;
  model: string;
  system: string;
  messages: ChatMessage[];
  scope: ChatScope;
  temperature: number;
  maxIterations?: number;
}): Promise<AgentResult> {
  const maxIterations = opts.maxIterations ?? 8;
  const convo: OAMessage[] = [
    { role: 'system', content: opts.system },
    ...opts.messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  const trace: AgentResult['trace'] = [];
  const proposals: Proposal[] = [];
  let inputTokens = 0, outputTokens = 0, model = opts.model;
  let nudged = false;   // continuation nudge fires at most once per turn

  for (let i = 0; i < maxIterations; i++) {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${opts.apiKey}` },
      body:    JSON.stringify({ model: opts.model, messages: convo, tools: [...TOOL_SCHEMAS, PROPOSE_SCHEMA], tool_choice: 'auto', temperature: opts.temperature }),
    });
    if (!resp.ok) {
      const raw = await resp.text().catch(() => '');
      let msg = resp.statusText;
      try { msg = (JSON.parse(raw) as { error?: { message?: string } }).error?.message ?? raw; } catch { msg = raw || msg; }
      throw new Error(`OpenAI ${resp.status}: ${msg}`);
    }
    const data = await resp.json() as {
      choices: { message: { content: string | null; tool_calls?: ToolCall[] } }[];
      model: string;
      usage?: { prompt_tokens: number; completion_tokens: number };
    };
    model = data.model;
    if (data.usage) { inputTokens += data.usage.prompt_tokens; outputTokens += data.usage.completion_tokens; }

    const message = data.choices[0]?.message;
    if (!message) break;

    if (message.tool_calls?.length) {
      // Record the assistant turn (with tool_calls) then each tool result.
      convo.push({ role: 'assistant', content: message.content ?? null, tool_calls: message.tool_calls });
      for (const call of message.tool_calls) {
        let args: Record<string, unknown> = {};
        try { args = JSON.parse(call.function.arguments || '{}'); } catch { /* leave empty */ }

        // propose_artifact is handled specially (not a read tool); everything else
        // is a scope-gated read. Both go through the shared handlers.
        const result = call.function.name === 'propose_artifact'
          ? recordProposal(args, opts.scope, trace, proposals)
          : recordToolRun(call.function.name, args, opts.scope, trace);
        convo.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
      }
      continue; // let the model consume the tool results
    }

    // No tool calls → final answer. But if the model just promised to act, or
    // pasted an artifact as JSON instead of proposing it, nudge it once to follow
    // through in this turn.
    const finalText = message.content ?? '';
    const nudge = !nudged && proposals.length === 0 ? nudgeFor(finalText) : null;
    if (nudge) {
      nudged = true;
      convo.push({ role: 'assistant', content: finalText });
      convo.push({ role: 'user', content: nudge });
      continue;
    }
    return { text: finalText, model, usage: { inputTokens, outputTokens }, trace, proposals };
  }

  // Hit the iteration cap without a final message.
  return {
    text: 'I reached the tool-call limit before finishing. Try narrowing the request.',
    model, usage: { inputTokens, outputTokens }, trace, proposals,
  };
}

// ── Anthropic agent loop ──────────────────────────────────────────────────────
// Parity with runOpenAIAgent over the Anthropic Messages API (tools /
// tool_use / tool_result). Same scope-gated read tools and propose_artifact; the
// only differences are the wire shape and that we don't send `temperature` — it
// is rejected (400) on Opus 4.7+/Opus 5/Sonnet 5, and the model picker is free
// text, so a user could type any of those.
const ANTHROPIC_VERSION = '2023-06-01';
const ANTHROPIC_MAX_TOKENS = 16000; // stays under the SDK/HTTP timeout for non-streaming

// The OpenAI-style function schemas, converted to Anthropic's tool shape once.
const ANTHROPIC_TOOLS: { name: string; description: string; input_schema: unknown }[] =
  [...TOOL_SCHEMAS, PROPOSE_SCHEMA].map((t) => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters,
  }));

type AnthropicBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: string; [k: string]: unknown };
type AnthropicMessage = { role: 'user' | 'assistant'; content: string | AnthropicBlock[] };

// Note: no `temperature` — it 400s on Opus 4.7+/Opus 5/Sonnet 5 and the model
// picker is free text. Omitting it from the signature stops a caller from passing
// one, so the constraint is enforced by the type system, not just a comment.
export async function runAnthropicAgent(opts: {
  apiKey: string;
  model: string;
  system: string;
  messages: ChatMessage[];
  scope: ChatScope;
  maxIterations?: number;
}): Promise<AgentResult> {
  const maxIterations = opts.maxIterations ?? 8;
  const convo: AnthropicMessage[] = opts.messages.map((m) => ({ role: m.role, content: m.content }));

  const trace: AgentResult['trace'] = [];
  const proposals: Proposal[] = [];
  let inputTokens = 0, outputTokens = 0, model = opts.model;
  let nudged = false;

  for (let i = 0; i < maxIterations; i++) {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': opts.apiKey, 'anthropic-version': ANTHROPIC_VERSION },
      body:    JSON.stringify({ model: opts.model, system: opts.system, messages: convo, tools: ANTHROPIC_TOOLS, max_tokens: ANTHROPIC_MAX_TOKENS }),
    });
    if (!resp.ok) {
      const raw = await resp.text().catch(() => '');
      let msg = resp.statusText;
      try { msg = (JSON.parse(raw) as { error?: { message?: string } }).error?.message ?? raw; } catch { msg = raw || msg; }
      throw new Error(`Anthropic ${resp.status}: ${msg}`);
    }
    const data = await resp.json() as {
      content: AnthropicBlock[];
      model: string;
      stop_reason: string | null;
      usage?: { input_tokens: number; output_tokens: number };
    };
    model = data.model;
    if (data.usage) { inputTokens += data.usage.input_tokens; outputTokens += data.usage.output_tokens; }

    const content = data.content ?? [];
    const toolUses = content.filter((b): b is { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> } => b.type === 'tool_use');
    const text = content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('');

    if (toolUses.length) {
      // A turn cut off at max_tokens can leave a tool_use block with truncated
      // input JSON (e.g. a half-written workflow). Feeding that to the tools would
      // just produce confusing validation errors, so stop and say so.
      if (data.stop_reason === 'max_tokens') {
        return { text: 'My response was cut off before I finished — the artifact may be too large. Try a smaller or simpler request.', model, usage: { inputTokens, outputTokens }, trace, proposals };
      }
      // Echo the assistant turn (must include the tool_use blocks), then reply
      // with one tool_result per call in a single user message.
      convo.push({ role: 'assistant', content });
      const results: AnthropicBlock[] = [];
      for (const call of toolUses) {
        const args = (call.input ?? {}) as Record<string, unknown>; // already parsed by the API
        const result = call.name === 'propose_artifact'
          ? recordProposal(args, opts.scope, trace, proposals)
          : recordToolRun(call.name, args, opts.scope, trace);
        results.push({ type: 'tool_result', tool_use_id: call.id, content: JSON.stringify(result) });
      }
      convo.push({ role: 'user', content: results });
      continue;
    }

    // No tool use → final answer. Nudge once if the model only promised to act,
    // or pasted an artifact as JSON instead of proposing it.
    const nudge = !nudged && proposals.length === 0 ? nudgeFor(text) : null;
    if (nudge) {
      nudged = true;
      convo.push({ role: 'assistant', content: text });
      convo.push({ role: 'user', content: nudge });
      continue;
    }
    // An empty final turn (e.g. cut off at max_tokens) would render as a blank
    // bubble — say something instead.
    const finalText = text.trim()
      ? text
      : (data.stop_reason === 'max_tokens'
        ? 'My response was cut off before I finished. Try narrowing the request.'
        : text);
    return { text: finalText, model, usage: { inputTokens, outputTokens }, trace, proposals };
  }

  return {
    text: 'I reached the tool-call limit before finishing. Try narrowing the request.',
    model, usage: { inputTokens, outputTokens }, trace, proposals,
  };
}
