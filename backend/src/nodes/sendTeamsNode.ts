import { z } from 'zod';
import { registerNode } from '../engine/nodeRegistry';
import { resolveString } from '../engine/expression';
import type { ExecutionContext, NodeExecutionResult, WorkflowNode } from '../types';

const schema = z.object({
  webhookUrl: z.string().min(1),
  title:      z.string().default(''),
  text:       z.string().min(1),
  themeColor: z.string().default('0076D7'),
});

const execute = async (node: WorkflowNode, context: ExecutionContext): Promise<NodeExecutionResult> => {
  const startedAt = Date.now();
  const config = schema.parse(node.config);
  try {
    const r = (s: string) => resolveString(s, context);
    const title = r(config.title);
    const text  = r(config.text);
    const response = await fetch(config.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ '@type': 'MessageCard', '@context': 'http://schema.org/extensions', themeColor: config.themeColor, summary: title || text, sections: [{ activityTitle: title, activityText: text }] }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
    return { nodeId: node.id, status: 'success', output: { sent: true, title, text }, startedAt, finishedAt: Date.now() };
  } catch (err) {
    return { nodeId: node.id, status: 'error', output: null, error: err instanceof Error ? err.message : String(err), startedAt, finishedAt: Date.now() };
  }
};

registerNode({
  type: 'send-teams',
  label: 'Send Teams',
  description: "Posts a MessageCard to a Microsoft Teams Incoming Webhook URL.",
  category: 'Notification',
  configSchema: schema,
  outputSchema: z.object({ sent: z.boolean(), title: z.string(), text: z.string() }),
  execute,
});
