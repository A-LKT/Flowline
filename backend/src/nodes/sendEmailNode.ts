import { z } from 'zod';
import { registerNode } from '../engine/nodeRegistry';
import { resolveString } from '../engine/expression';
import type { ExecutionContext, NodeExecutionResult, WorkflowNode } from '../types';

const schema = z.object({
  serviceUrl: z.string().min(1),
  apiKey:     z.string().default(''),
  to:         z.string().min(1),
  from:       z.string().default(''),
  subject:    z.string().default(''),
  body:       z.string().default(''),
});

const execute = async (node: WorkflowNode, context: ExecutionContext): Promise<NodeExecutionResult> => {
  const startedAt = Date.now();
  const config = schema.parse(node.config);
  try {
    const r = (s: string) => resolveString(s, context);
    const payload = { to: r(config.to), from: r(config.from), subject: r(config.subject), body: r(config.body) };
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`;
    const response = await fetch(config.serviceUrl, { method: 'POST', headers, body: JSON.stringify(payload) });
    if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
    return { nodeId: node.id, status: 'success', output: { sent: true, to: payload.to, subject: payload.subject, status: response.status }, startedAt, finishedAt: Date.now() };
  } catch (err) {
    return { nodeId: node.id, status: 'error', output: null, error: err instanceof Error ? err.message : String(err), startedAt, finishedAt: Date.now() };
  }
};

registerNode({
  type: 'send-email',
  label: 'Send Email',
  description: "Posts an email payload to a configured HTTP email relay (SendGrid/Mailgun/etc).",
  category: 'Notification',
  configSchema: schema,
  outputSchema: z.object({ sent: z.boolean(), to: z.string(), subject: z.string(), status: z.number() }),
  execute,
});
