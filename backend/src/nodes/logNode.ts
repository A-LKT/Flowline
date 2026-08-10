import { z } from 'zod';
import { registerNode } from '../engine/nodeRegistry';
import { resolveString } from '../engine/expression';
import type { ExecutionContext, NodeExecutionResult, WorkflowNode } from '../types';

const schema = z.object({
  message: z.string().default(''),
  level:   z.enum(['info', 'warn', 'error']).default('info'),
});

const PREFIX: Record<string, string> = { info: '[INFO]', warn: '[WARN]', error: '[ERROR]' };

const execute = async (node: WorkflowNode, context: ExecutionContext): Promise<NodeExecutionResult> => {
  const startedAt = Date.now();
  const { message, level } = schema.parse(node.config);
  const text = resolveString(message, context);
  context.log(`${PREFIX[level]} ${text}`);
  return { nodeId: node.id, status: 'success', output: { message: text, level }, startedAt, finishedAt: Date.now() };
};

registerNode({
  type: 'log',
  label: 'Log',
  description: "Writes a message to the run log at info|warn|error. Passes input through.",
  category: 'Control',
  configSchema: schema,
  outputSchema: z.object({ message: z.string(), level: z.string() }),
  execute,
});
