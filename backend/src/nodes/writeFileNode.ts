import { z } from 'zod';
import path from 'path';
import fs from 'fs/promises';
import { registerNode } from '../engine/nodeRegistry';
import { evaluateExpression, resolveString } from '../engine/expression';
import { safeResolve } from './_fileRoot';
import type { ExecutionContext, NodeExecutionResult, WorkflowNode } from '../types';

const schema = z.object({
  filename: z.string().min(1).describe('Path relative to the data files root. Subdirectories allowed, e.g. "queue/job-123.json".'),
  content:  z.string().min(1),
  mimeType: z.string().default('text/plain'),
});

const execute = async (node: WorkflowNode, context: ExecutionContext): Promise<NodeExecutionResult> => {
  const startedAt = Date.now();
  const config = schema.parse(node.config);
  try {
    const resolvedContent = evaluateExpression(config.content, context);
    const text = typeof resolvedContent === 'string'
      ? resolvedContent
      : JSON.stringify(resolvedContent, null, 2);

    // Resolve {{expressions}} in the name, then map under the files root
    // (subdirectories allowed, path traversal rejected by safeResolve).
    const relName = resolveString(config.filename, context);
    const outputPath = safeResolve(relName);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, text, 'utf-8');

    return { nodeId: node.id, status: 'success', output: { filename: relName, size: text.length, path: outputPath }, startedAt, finishedAt: Date.now() };
  } catch (err) {
    return { nodeId: node.id, status: 'error', output: null, error: err instanceof Error ? err.message : String(err), startedAt, finishedAt: Date.now() };
  }
};

registerNode({
  type: 'write-file',
  label: 'Write File',
  description: 'Writes a file to the server data files area and returns its relative path. Subdirectories are allowed (e.g. "queue/job.json"), enabling filesystem queues. Served under /files/.',
  category: 'File',
  configSchema: schema,
  outputSchema: z.object({ filename: z.string(), size: z.number(), path: z.string() }),
  execute,
});
