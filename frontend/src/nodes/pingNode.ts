import { z } from 'zod';
import { registerNode } from '../engine/nodeRegistry';

const configSchema = z.object({
  host:      z.string().min(1, 'Host is required'),
  timeoutMs: z.coerce.number().int().min(100).max(30_000).default(5000),
});

registerNode({
  type: 'ping',
  label: 'Ping',
  description: 'ICMP ping — accepts hostnames or IP addresses and reports round-trip latency.',
  category: 'Integration',
  configSchema,
  defaultConfig: { host: '', timeoutMs: 5000 },
  fieldMeta: { timeoutMs: { type: 'number' } },
});
