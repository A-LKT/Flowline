import { z } from 'zod';
import { registerNode } from '../engine/nodeRegistry';

const configSchema = z.object({
  webhookUrl:  z.string().min(1, 'Webhook URL is required'),
  title:       z.string().default(''),
  text:        z.string().min(1, 'Message text is required'),
  themeColor:  z.string().default('0076D7'),
});

registerNode({
  type: 'send-teams',
  label: 'Send Teams',
  description: 'Posts a MessageCard to a Microsoft Teams channel via an incoming webhook.',
  category: 'Notification',
  configSchema,
  defaultConfig: { webhookUrl: '', title: '', text: '', themeColor: '0076D7' },
  fieldMeta: { text: { type: 'textarea' } },
});
