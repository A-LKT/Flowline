import { z } from 'zod';
import { registerNode } from '../engine/nodeRegistry';
import { resolveString } from '../engine/expression';
import type { ExecutionContext, NodeExecutionResult, WorkflowNode } from '../types';

const schema = z.object({
  url:     z.string().min(1),
  format:  z.enum(['text', 'json', 'base64']).default('text'),
  headers: z.string().default(''),
});

const execute = async (node: WorkflowNode, context: ExecutionContext): Promise<NodeExecutionResult> => {
  const startedAt = Date.now();
  const config = schema.parse(node.config);
  try {
    const resolvedUrl = resolveString(config.url, context);
    let extraHeaders: Record<string, string> = {};
    if (config.headers.trim()) {
      // Resolve {{templates}} (e.g. auth tokens from secrets) like the http node does.
      try { extraHeaders = JSON.parse(resolveString(config.headers, context)) as Record<string, string>; } catch { /* ignore */ }
    }
    const response = await fetch(resolvedUrl, { headers: extraHeaders });
    if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
    let content: unknown;
    const size = Number(response.headers.get('content-length') ?? 0);
    if (config.format === 'json') {
      content = await response.json();
    } else if (config.format === 'base64') {
      const buf = await response.arrayBuffer();
      content   = Buffer.from(buf).toString('base64');
    } else {
      content = await response.text();
    }
    return { nodeId: node.id, status: 'success', output: { content, size, url: resolvedUrl, format: config.format }, startedAt, finishedAt: Date.now() };
  } catch (err) {
    return { nodeId: node.id, status: 'error', output: null, error: err instanceof Error ? err.message : String(err), startedAt, finishedAt: Date.now() };
  }
};

registerNode({
  type: 'read-file',
  label: 'Read File',
  description: "Fetches a resource from a URL as text|json|base64.",
  category: 'File',
  configSchema: schema,
  outputSchema: z.object({ content: z.unknown(), size: z.number(), url: z.string(), format: z.string() }),
  execute,
});
