import { z } from 'zod';
import { registerNode } from '../engine/nodeRegistry';

registerNode({
  type:        'send-whatsapp',
  label:       'Send WhatsApp',
  description: 'Sends a WhatsApp message via the bridge service. Set imageUrl to send an image with a caption instead of plain text.',
  category:    'Notification',
  configSchema: z.object({
    to:       z.string().min(1, 'Recipient is required'),
    text:     z.string().optional(),
    imageUrl: z.string().optional(),
    caption:  z.string().optional(),
  }),
  defaultConfig: {
    to:   '{{trigger.sender}}',
    text: '',
  },
  fieldMeta: {
    text:    { type: 'textarea' },
    caption: { type: 'textarea' },
  },
});
