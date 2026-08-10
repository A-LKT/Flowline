import { z } from 'zod';
import { registerNode } from '../engine/nodeRegistry';

const configSchema = z.object({
  webhookUrl: z.string().min(1, 'Webhook URL is required'),
  text:       z.string().min(1, 'Message text is required'),
  username:   z.string().default(''),
  iconEmoji:  z.string().default(''),
  channel:    z.string().default(''),
});

registerNode({
  type: 'send-slack',
  label: 'Send Slack',
  description: 'Posts a message to a Slack channel via an incoming webhook.',
  category: 'Notification',
  configSchema,
  defaultConfig: { webhookUrl: '', text: '', username: '', iconEmoji: '', channel: '' },
  fieldMeta: { text: { type: 'textarea' } },
});
