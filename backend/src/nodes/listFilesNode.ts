import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';
import { registerNode } from '../engine/nodeRegistry';
import { resolveString } from '../engine/expression';
import { safeResolve } from './_fileRoot';
import type { ExecutionContext, NodeExecutionResult, WorkflowNode } from '../types';

const schema = z.object({
  dir:     z.string().default('').describe('Subdirectory under the data files root, e.g. "queue". Empty = root.'),
  pattern: z.string().default('').describe('Optional glob on the file name, e.g. "*.json". Empty = all files.'),
});

const globToRegExp = (glob: string): RegExp =>
  new RegExp('^' + glob.split('*').map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');

const execute = async (node: WorkflowNode, context: ExecutionContext): Promise<NodeExecutionResult> => {
  const startedAt = Date.now();
  const config = schema.parse(node.config);
  try {
    const dir = resolveString(config.dir, context);
    const abs = safeResolve(dir);
    const pat = config.pattern ? globToRegExp(resolveString(config.pattern, context)) : null;

    let entries: string[];
    try { entries = await fs.readdir(abs); }
    catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return { nodeId: node.id, status: 'success', output: { files: [], count: 0, dir }, startedAt, finishedAt: Date.now() };
      }
      throw err;
    }

    const files: { name: string; path: string; size: number; mtime: number }[] = [];
    for (const name of entries) {
      if (pat && !pat.test(name)) continue;
      const st = await fs.stat(path.join(abs, name));
      if (!st.isFile()) continue;
      files.push({ name, path: dir ? `${dir}/${name}` : name, size: st.size, mtime: st.mtimeMs });
    }
    // Oldest first — process a queue in arrival order.
    files.sort((a, b) => a.mtime - b.mtime);

    return { nodeId: node.id, status: 'success', output: { files, count: files.length, dir }, startedAt, finishedAt: Date.now() };
  } catch (err) {
    return { nodeId: node.id, status: 'error', output: null, error: err instanceof Error ? err.message : String(err), startedAt, finishedAt: Date.now() };
  }
};

registerNode({
  type: 'list-files',
  label: 'List Files',
  description: 'Lists files in a subdirectory of the server data files area, oldest first. Use to enumerate a filesystem queue. Returns relative paths usable by read-local-file / move-file / delete-file.',
  category: 'File',
  configSchema: schema,
  outputSchema: z.object({
    files: z.array(z.object({ name: z.string(), path: z.string(), size: z.number(), mtime: z.number() })),
    count: z.number(),
    dir: z.string(),
  }),
  execute,
});
