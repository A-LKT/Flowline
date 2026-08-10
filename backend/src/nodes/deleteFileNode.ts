import { z } from 'zod';
import fs from 'fs/promises';
import { registerNode } from '../engine/nodeRegistry';
import { resolveString } from '../engine/expression';
import { safeResolve } from './_fileRoot';
import type { ExecutionContext, NodeExecutionResult, WorkflowNode } from '../types';

const schema = z.object({
  path: z.string().min(1).describe('Path relative to the data files root to delete.'),
});

const execute = async (node: WorkflowNode, context: ExecutionContext): Promise<NodeExecutionResult> => {
  const startedAt = Date.now();
  const config = schema.parse(node.config);
  try {
    const rel = resolveString(config.path, context);
    const abs = safeResolve(rel);
    let deleted = true;
    try { await fs.rm(abs); }
    catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') deleted = false;
      else throw err;
    }
    return { nodeId: node.id, status: 'success', output: { path: rel, deleted }, startedAt, finishedAt: Date.now() };
  } catch (err) {
    return { nodeId: node.id, status: 'error', output: null, error: err instanceof Error ? err.message : String(err), startedAt, finishedAt: Date.now() };
  }
};

registerNode({
  type: 'delete-file',
  label: 'Delete File',
  description: 'Deletes a file from the data files area by relative path. Returns deleted:false (no error) if it was already gone. Use to remove a queue job after processing.',
  category: 'File',
  configSchema: schema,
  outputSchema: z.object({ path: z.string(), deleted: z.boolean() }),
  execute,
});
