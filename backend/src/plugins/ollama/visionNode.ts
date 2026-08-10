import { z } from 'zod';
import { registerNode } from '../../engine/nodeRegistry';
import { resolveString } from '../../engine/expression';
import type { ExecutionContext, NodeExecutionResult, WorkflowNode } from '../../types';
import { readFileSync } from 'fs';

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
  temperature: z.coerce.number().min(0).max(2).default(0.1),
  // Either a file path or a base64 string (with or without data-URI prefix)
  image:       z.string().min(1),
});

async function toBase64(image: string): Promise<string> {
  if (image.startsWith('data:')) {
    return image.split(',')[1] ?? image;
  }
  if (image.startsWith('http://') || image.startsWith('https://')) {
    const resp = await fetch(image);
    if (!resp.ok) throw new Error(`Failed to fetch image: ${resp.status} ${resp.statusText}`);
    return Buffer.from(await resp.arrayBuffer()).toString('base64');
  }
  // Looks like base64 (no path separators)
  if (!/[\\/]/.test(image) && image.length > 64) {
    return image;
  }
  return readFileSync(image).toString('base64');
}

const execute = async (node: WorkflowNode, context: ExecutionContext): Promise<NodeExecutionResult> => {
  const startedAt = Date.now();
  const config = schema.parse(node.config);
  try {
    const model      = resolveString(config.model, context);
    const prompt     = resolveString(config.prompt, context);
    const system     = resolveString(config.system, context);
    const imageRaw   = resolveString(config.image, context);
    const imageB64   = await toBase64(imageRaw);
    const serviceUrl = process.env.OLLAMA_URL ?? 'http://host.docker.internal:11434';
    const url        = `${serviceUrl.replace(/\/$/, '')}/api/generate`;

    const body: Record<string, unknown> = {
      model,
      prompt,
      images:  [imageB64],
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

    // Attempt to parse JSON from the response if it contains a JSON block
    let parsed: unknown = null;
    const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) ?? text.match(/(\{[\s\S]*\})/);
    if (jsonMatch) {
      try { parsed = JSON.parse(jsonMatch[1]); } catch { /* leave null */ }
    }

    return {
      nodeId: node.id,
      status: 'success',
      output: { text, parsed, model },
      startedAt,
      finishedAt: Date.now(),
    };
  } catch (err) {
    return { nodeId: node.id, status: 'error', output: null, error: formatError(err), startedAt, finishedAt: Date.now() };
  }
};

registerNode({
  type: 'ollama-vision',
  label: 'Ollama Vision',
  description: 'Sends an image (file path or base64) plus a prompt to a vision-capable Ollama model (e.g. llava). Good for trigger.media[0].',
  category: 'AI',
  plugin: 'ollama',
  configSchema: schema,
  outputSchema: z.object({ text: z.string(), parsed: z.unknown(), model: z.string() }),
  execute,
});
