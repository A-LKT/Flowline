import { z } from 'zod';
import { registerNode } from '../../engine/nodeRegistry';
import { resolveString } from '../../engine/expression';
import type { ExecutionContext, NodeExecutionResult, WorkflowNode } from '../../types';

function formatError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const cause = (err as NodeJS.ErrnoException).cause;
  const causeMsg = cause instanceof Error ? cause.message : cause != null ? String(cause) : null;
  return causeMsg ? `${err.message}: ${causeMsg}` : err.message;
}

const schema = z.object({
  model:       z.string().min(1),
  prompt:      z.string().min(1),
  system:      z.string().default(''),
  temperature: z.coerce.number().min(0).max(2).default(0.7),
});

const execute = async (node: WorkflowNode, context: ExecutionContext): Promise<NodeExecutionResult> => {
  const startedAt = Date.now();
  const config = schema.parse(node.config);
  try {
    const model      = resolveString(config.model, context);
    const prompt     = resolveString(config.prompt, context);
    const system     = resolveString(config.system, context);
    const serviceUrl = process.env.OLLAMA_URL ?? 'http://host.docker.internal:11434';
    const url        = `${serviceUrl.replace(/\/$/, '')}/api/generate`;

    const body: Record<string, unknown> = {
      model,
      prompt,
      stream:  true,
      options: { temperature: config.temperature },
    };
    if (system) body.system = system;

    const resp = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });

    if (!resp.ok) {
      const errBody = await resp.text().catch(() => '');
      let errMsg = resp.statusText;
      if (errBody) {
        try { errMsg = (JSON.parse(errBody) as { error?: string }).error ?? errBody; }
        catch { errMsg = errBody; }
      }
      throw new Error(`Ollama error: ${resp.status} — ${errMsg}`);
    }

    if (!resp.body) throw new Error('Ollama returned no response body');

    // Consume the NDJSON stream, accumulating token chunks until done:true.
    // Streaming keeps the connection alive through Docker/proxy idle timeouts.
    const reader  = resp.body.getReader();
    const decoder = new TextDecoder();
    let text      = '';
    let buf       = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const chunk = JSON.parse(trimmed) as { response?: string; done?: boolean; error?: string };
        if (chunk.error) throw new Error(chunk.error);
        if (chunk.response) text += chunk.response;
        if (chunk.done) break;
      }
    }

    return { nodeId: node.id, status: 'success', output: { text, model }, startedAt, finishedAt: Date.now() };
  } catch (err) {
    return { nodeId: node.id, status: 'error', output: null, error: formatError(err), startedAt, finishedAt: Date.now() };
  }
};

registerNode({
  type: 'ollama-completion',
  label: 'Ollama Completion',
  description: 'Sends a prompt to a locally-running Ollama model. No API keys required.',
  category: 'AI',
  plugin: 'ollama',
  configSchema: schema,
  outputSchema: z.object({ text: z.string(), model: z.string() }),
  execute,
});
