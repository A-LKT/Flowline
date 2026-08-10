import { z } from 'zod';
import { registerNode } from '../engine/nodeRegistry';
import { resolveString } from '../engine/expression';
import type { ExecutionContext, NodeExecutionResult, WorkflowNode } from '../types';

const schema = z.object({
  to:       z.string().min(1),
  text:     z.string().optional().default(''),
  imageUrl: z.string().optional(),
  caption:  z.string().optional(),
});

const execute = async (node: WorkflowNode, context: ExecutionContext): Promise<NodeExecutionResult> => {
  const startedAt = Date.now();
  const config = schema.parse(node.config);
  try {
    const to        = resolveString(config.to,      context);
    const imageUrl  = config.imageUrl ? resolveString(config.imageUrl, context) : undefined;
    const bridgeUrl = process.env.WHATSAPP_BRIDGE_URL ?? 'http://whatsapp-bridge:3002';

    let payload: Record<string, string>;
    if (imageUrl) {
      const caption = config.caption ? resolveString(config.caption, context) : '';
      payload = { to, imageUrl, caption };
    } else {
      const text = resolveString(config.text, context);
      if (!text) throw new Error('text is required when imageUrl is not set');
      payload = { to, text };
    }

    const resp = await fetch(`${bridgeUrl}/send`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });

    if (!resp.ok) {
      const respText = await resp.text();
      throw new Error(`Bridge error: ${resp.status} ${resp.statusText} — ${respText}`);
    }

    return { nodeId: node.id, status: 'success', output: payload, startedAt, finishedAt: Date.now() };
  } catch (err) {
    return { nodeId: node.id, status: 'error', output: null, error: err instanceof Error ? err.message : String(err), startedAt, finishedAt: Date.now() };
  }
};

registerNode({
  type: 'send-whatsapp',
  label: 'Send WhatsApp',
  description: "Sends a WhatsApp message (text, or image via imageUrl+caption) through the local WhatsApp bridge. Reply with to: {{trigger.sender}}.",
  category: 'Notification',
  configSchema: schema,
  outputSchema: z.object({ to: z.string(), text: z.string().optional(), imageUrl: z.string().optional(), caption: z.string().optional() }),
  execute,
});
