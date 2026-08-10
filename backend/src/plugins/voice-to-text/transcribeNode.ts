import { z } from 'zod';
import { registerNode } from '../../engine/nodeRegistry';
import { resolveString } from '../../engine/expression';
import type { ExecutionContext, NodeExecutionResult, WorkflowNode } from '../../types';

const schema = z.object({
  audioUrl:    z.string().min(1),
  language:    z.string().default(''),
  endpoint:    z.string().default('/transcribe'),
  timeoutSecs: z.coerce.number().int().min(10).max(7200).default(1800),
});

const execute = async (node: WorkflowNode, context: ExecutionContext): Promise<NodeExecutionResult> => {
  const startedAt = Date.now();
  const config = schema.parse(node.config);
  try {
    const audioUrl  = resolveString(config.audioUrl, context);
    const language  = resolveString(config.language, context);
    const serviceUrl = process.env.VOICE_TO_TEXT_URL ?? 'http://voice-to-text:9000';
    const url = `${serviceUrl.replace(/\/$/, '')}${config.endpoint}`;

    const body: Record<string, string> = { url: audioUrl };
    if (language) body.language = language;

    const resp = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
      signal:  AbortSignal.timeout(config.timeoutSecs * 1000),
    });

    if (!resp.ok) throw new Error(`V2T service error: ${resp.status} ${resp.statusText}`);

    const data = await resp.json() as { text?: string; transcript?: string; error?: string };
    if (data.error) throw new Error(data.error);
    const text = data.text ?? data.transcript ?? '';

    return { nodeId: node.id, status: 'success', output: { text }, startedAt, finishedAt: Date.now() };
  } catch (err) {
    if (!(err instanceof Error)) return { nodeId: node.id, status: 'error', output: null, error: String(err), startedAt, finishedAt: Date.now() };
    // Node's fetch throws a terse "fetch failed" and hides the real reason
    // (ECONNREFUSED / ENOTFOUND / timeout) in err.cause — surface it so a
    // failure names *why* the Voice-to-Text service was unreachable.
    const cause = (err as NodeJS.ErrnoException).cause;
    const causeMsg = cause instanceof Error ? cause.message : cause != null ? String(cause) : null;
    const error = causeMsg ? `${err.message}: ${causeMsg}` : err.message;
    return { nodeId: node.id, status: 'error', output: null, error, startedAt, finishedAt: Date.now() };
  }
};

registerNode({
  type: 'transcribe-audio',
  label: 'Transcribe Audio',
  description: 'Sends an audio URL to the Voice-to-Text sidecar (Whisper) and returns the transcript. Default audioUrl: {{trigger.media[0].url}}.',
  category: 'AI',
  plugin: 'voice-to-text',
  configSchema: schema,
  outputSchema: z.object({ text: z.string() }),
  execute,
});
