import { z } from 'zod';
import { registerNode } from '../engine/nodeRegistry';
import type { ExecutionContext, NodeExecutionResult, WorkflowNode } from '../types';

const UNITS = ['minutes', 'hours', 'days', 'weeks', 'months'] as const;

const schema = z.object({
  outputMode:  z.enum(['date', 'time', 'datetime']).default('datetime'),
  offsetValue: z.number().default(0),
  offsetUnit:  z.enum(UNITS).default('days'),
});

function applyOffset(date: Date, value: number, unit: typeof UNITS[number]): Date {
  if (value === 0) return date;
  const d = new Date(date);
  switch (unit) {
    case 'minutes': d.setMinutes(d.getMinutes() + value); break;
    case 'hours':   d.setHours(d.getHours() + value); break;
    case 'days':    d.setDate(d.getDate() + value); break;
    case 'weeks':   d.setDate(d.getDate() + value * 7); break;
    case 'months':  d.setMonth(d.getMonth() + value); break;
  }
  return d;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatTime(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

const execute = async (node: WorkflowNode, _context: ExecutionContext): Promise<NodeExecutionResult> => {
  const startedAt = Date.now();
  try {
    const config = schema.parse(node.config);
    const now    = applyOffset(new Date(), config.offsetValue, config.offsetUnit);
    let value: string;
    switch (config.outputMode) {
      case 'date':     value = formatDate(now); break;
      case 'time':     value = formatTime(now); break;
      default:         value = `${formatDate(now)} ${formatTime(now)}`; break;
    }
    return { nodeId: node.id, status: 'success', output: { value, iso: now.toISOString(), timestamp: now.getTime() }, startedAt, finishedAt: Date.now() };
  } catch (err) {
    return { nodeId: node.id, status: 'error', output: null, error: err instanceof Error ? err.message : String(err), startedAt, finishedAt: Date.now() };
  }
};

registerNode({
  type: 'datetime',
  label: 'Date / Time',
  description: "Returns the current date/time, optionally offset, in date|time|datetime mode.",
  category: 'Data',
  configSchema: schema,
  outputSchema: z.object({ value: z.string(), iso: z.string(), timestamp: z.number() }),
  execute,
});
