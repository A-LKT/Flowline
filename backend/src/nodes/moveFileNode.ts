import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';
import { registerNode } from '../engine/nodeRegistry';
import { resolveString } from '../engine/expression';
import { safeResolve } from './_fileRoot';
import type { ExecutionContext, NodeExecutionResult, WorkflowNode } from '../types';

const schema = z.object({
  from: z.string().min(1).describe('Source path relative to the data files root.'),
  to:   z.string().min(1).describe('Destination path relative to the data files root. Parent dirs are created.'),
});

const execute = async (node: WorkflowNode, context: ExecutionContext): Promise<NodeExecutionResult> => {
  const startedAt = Date.now();
  const config = schema.parse(node.config);
  try {
    const from = resolveString(config.from, context);
    const to   = resolveString(config.to, context);
    const fromAbs = safeResolve(from);
    const toAbs   = safeResolve(to);

    await fs.mkdir(path.dirname(toAbs), { recursive: true });
    try {
      await fs.rename(fromAbs, toAbs);
    } catch (err) {
      // Source gone — typically because a parallel run already claimed it.
      // Report moved:false rather than throwing, so this works as an atomic
      // claim primitive for filesystem-queue draining.
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return { nodeId: node.id, status: 'success', output: { from, to, moved: false }, startedAt, finishedAt: Date.now() };
      }
      throw err;
    }
    return { nodeId: node.id, status: 'success', output: { from, to, moved: true }, startedAt, finishedAt: Date.now() };
  } catch (err) {
    return { nodeId: node.id, status: 'error', output: null, error: err instanceof Error ? err.message : String(err), startedAt, finishedAt: Date.now() };
  }
};

registerNode({
  type: 'move-file',
  label: 'Move File',
  description: 'Atomically moves/renames a file within the data files area. Returns moved:false (no error) if the source is missing — use this as an atomic "claim" so two parallel drainer runs never grab the same queue file.',
  category: 'File',
  configSchema: schema,
  outputSchema: z.object({ from: z.string(), to: z.string(), moved: z.boolean() }),
  execute,
});
