import { z } from 'zod';
import { registerNode } from '../engine/nodeRegistry';

const configSchema = z.object({
  serviceUrl: z.string().min(1, 'Service URL is required'),
  apiKey:     z.string().default(''),
  to:         z.string().min(1, 'Recipient is required'),
  from:       z.string().default(''),
  subject:    z.string().default(''),
  body:       z.string().default(''),
});

registerNode({
  type: 'send-email',
  label: 'Send Email',
  description: 'Sends an email via a REST endpoint (SMTP relay, SendGrid, Mailgun, etc.).',
  category: 'Notification',
  configSchema,
  defaultConfig: { serviceUrl: '', apiKey: '', to: '', from: '', subject: '', body: '' },
  fieldMeta: { body: { type: 'textarea' } },
});
