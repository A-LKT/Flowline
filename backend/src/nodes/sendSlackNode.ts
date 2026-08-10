import { z } from 'zod';
import { registerNode } from '../engine/nodeRegistry';
import { resolveString } from '../engine/expression';
import type { ExecutionContext, NodeExecutionResult, WorkflowNode } from '../types';

const schema = z.object({
  webhookUrl: z.string().min(1),
  text:       z.string().min(1),
  username:   z.string().default(''),
  iconEmoji:  z.string().default(''),
  channel:    z.string().default(''),
});

const execute = async (node: WorkflowNode, context: ExecutionContext): Promise<NodeExecutionResult> => {
  const startedAt = Date.now();
  const config = schema.parse(node.config);
  try {
    const r = (s: string) => resolveString(s, context);
    const payload: Record<string, string> = { text: r(config.text) };
    if (config.username)  payload.username   = config.username;
    if (config.iconEmoji) payload.icon_emoji = config.iconEmoji;
    if (config.channel)   payload.channel    = config.channel;
    const response = await fetch(config.webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
    return { nodeId: node.id, status: 'success', output: { sent: true, text: payload.text }, startedAt, finishedAt: Date.now() };
  } catch (err) {
    return { nodeId: node.id, status: 'error', output: null, error: err instanceof Error ? err.message : String(err), startedAt, finishedAt: Date.now() };
  }
};

registerNode({
  type: 'send-slack',
  label: 'Send Slack',
  description: "Posts a message to a Slack Incoming Webhook URL.",
  category: 'Notification',
  configSchema: schema,
  outputSchema: z.object({ sent: z.boolean(), text: z.string() }),
  execute,
});
