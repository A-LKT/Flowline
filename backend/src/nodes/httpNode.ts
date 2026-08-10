import { z } from 'zod';
import { registerNode } from '../engine/nodeRegistry';
import { resolveString } from '../engine/expression';
import type { ExecutionContext, NodeExecutionResult, WorkflowNode } from '../types';

const schema = z.object({
  url:     z.string().min(1),
  method:  z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']),
  headers: z.string().optional(),
  body:    z.string().optional(),
});

const execute = async (node: WorkflowNode, context: ExecutionContext): Promise<NodeExecutionResult> => {
  const startedAt = Date.now();
  const config = schema.parse(node.config);
  try {
    const url  = resolveString(config.url, context);
    const body = config.body ? resolveString(config.body, context) : undefined;

    let parsedHeaders: Record<string, string> = {};
    if (config.headers?.trim()) {
      const resolvedHeaders = resolveString(config.headers, context);
      try { parsedHeaders = JSON.parse(resolvedHeaders) as Record<string, string>; }
      catch { throw new Error('headers must be valid JSON'); }
    }
    const headers: Record<string, string> = { 'Content-Type': 'application/json', ...parsedHeaders };

    const response = await fetch(url, {
      method: config.method,
      headers,
      body: body && config.method !== 'GET' ? body : undefined,
    });

    let data: unknown;
    const ct = response.headers.get('content-type') ?? '';
    try {
      data = ct.includes('application/json') ? await response.json() : await response.text();
    } catch {
      data = await response.text();
    }

    let errorMsg: string | undefined;
    if (!response.ok) {
      const detail = typeof data === 'object' && data !== null
        ? ((data as Record<string, unknown>)?.error as Record<string, unknown>)?.message as string | undefined
          ?? JSON.stringify(data)
        : String(data);
      errorMsg = `HTTP ${response.status} ${response.statusText}: ${detail}`;
    }

    return {
      nodeId: node.id,
      status: response.ok ? 'success' : 'error',
      output: { status: response.status, data, url },
      error: errorMsg,
      startedAt,
      finishedAt: Date.now(),
    };
  } catch (err) {
    if (!(err instanceof Error)) return { nodeId: node.id, status: 'error', output: null, error: String(err), startedAt, finishedAt: Date.now() };
    const cause = (err as NodeJS.ErrnoException).cause;
    const causeMsg = cause instanceof Error ? cause.message : cause != null ? String(cause) : null;
    const error = causeMsg ? `${err.message}: ${causeMsg}` : err.message;
    return { nodeId: node.id, status: 'error', output: null, error, startedAt, finishedAt: Date.now() };
  }
};

registerNode({
  type: 'http',
  label: 'HTTP Request',
  description: "Sends an HTTP request (GET/POST/PUT/DELETE/PATCH) and returns the response.",
  category: 'Integration',
  configSchema: schema,
  outputSchema: z.object({ status: z.number(), data: z.unknown(), url: z.string() }),
  execute,
});
