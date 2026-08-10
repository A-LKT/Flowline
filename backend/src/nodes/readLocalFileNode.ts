import { z } from 'zod';
import fs from 'fs/promises';
import { registerNode } from '../engine/nodeRegistry';
import { resolveString } from '../engine/expression';
import { safeResolve } from './_fileRoot';
import type { ExecutionContext, NodeExecutionResult, WorkflowNode } from '../types';

const schema = z.object({
  path:   z.string().min(1).describe('Path relative to the data files root, e.g. "queue/job-123.json".'),
  format: z.enum(['text', 'json']).default('text'),
});

const execute = async (node: WorkflowNode, context: ExecutionContext): Promise<NodeExecutionResult> => {
  const startedAt = Date.now();
  const config = schema.parse(node.config);
  try {
    const rel = resolveString(config.path, context);
    const abs = safeResolve(rel);
    const raw = await fs.readFile(abs, 'utf-8');
    const content: unknown = config.format === 'json' ? JSON.parse(raw) : raw;
    return { nodeId: node.id, status: 'success', output: { content, path: rel, size: raw.length }, startedAt, finishedAt: Date.now() };
  } catch (err) {
    return { nodeId: node.id, status: 'error', output: null, error: err instanceof Error ? err.message : String(err), startedAt, finishedAt: Date.now() };
  }
};

registerNode({
  type: 'read-local-file',
  label: 'Read Local File',
  description: 'Reads a file from the server data files area by relative path (text or JSON). For a queue job written by write-file. (Distinct from read-file, which fetches a URL.)',
  category: 'File',
  configSchema: schema,
  outputSchema: z.object({ content: z.unknown(), path: z.string(), size: z.number() }),
  execute,
});
