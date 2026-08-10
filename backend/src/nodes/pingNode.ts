import { z } from 'zod';
import { exec } from 'child_process';
import { promisify } from 'util';
import { registerNode } from '../engine/nodeRegistry';
import { resolveString } from '../engine/expression';
import type { ExecutionContext, NodeExecutionResult, WorkflowNode } from '../types';

const execAsync = promisify(exec);

const schema = z.object({
  host:      z.string().min(1),
  timeoutMs: z.coerce.number().int().min(100).max(30_000).default(5000),
});

const execute = async (node: WorkflowNode, context: ExecutionContext): Promise<NodeExecutionResult> => {
  const startedAt = Date.now();
  const config = schema.parse(node.config);
  const host = resolveString(config.host, context);

  const isWindows = process.platform === 'win32';
  const cmd = isWindows
    ? `ping -n 1 -w ${config.timeoutMs} ${host}`
    : `ping -c 1 ${host}`;

  try {
    const { stdout } = await execAsync(cmd, { timeout: config.timeoutMs + 2000 });

    let latency: number | null = null;
    if (isWindows) {
      const m = stdout.match(/time[=<](\d+)ms/i) ?? stdout.match(/Average\s*=\s*(\d+)\s*ms/i);
      if (m) latency = parseInt(m[1], 10);
    } else {
      const m = stdout.match(/time=([\d.]+)\s*ms/i);
      if (m) latency = Math.round(parseFloat(m[1]));
    }

    return {
      nodeId: node.id, status: 'success',
      output: { ok: true, host, latency },
      startedAt, finishedAt: Date.now(),
    };
  } catch (err) {
    return {
      nodeId: node.id, status: 'error',
      output: { ok: false, host, latency: null },
      error: `Host unreachable: ${host}`,
      startedAt, finishedAt: Date.now(),
    };
  }
};

registerNode({
  type: 'ping',
  label: 'Ping',
  description: "Sends an ICMP echo to a host and reports reachability and latency.",
  category: 'Integration',
  configSchema: schema,
  outputSchema: z.object({ ok: z.boolean(), host: z.string(), latency: z.number().nullable() }),
  execute,
});
