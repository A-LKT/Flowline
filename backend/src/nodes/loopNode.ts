import { z } from 'zod';
import { registerNode } from '../engine/nodeRegistry';
import { buildOutputsMap, runUserCode } from '../engine/expression';
import type { ExecutionContext, NodeExecutionResult, WorkflowNode } from '../types';

const schema = z.object({
  condition:        z.string().min(1),
  maxIterations:    z.coerce.number().int().min(1).max(10_000).default(100),
  tolerateFailures: z.boolean().default(true),
});

const execute = async (node: WorkflowNode, context: ExecutionContext): Promise<NodeExecutionResult> => {
  const startedAt = Date.now();
  const config = schema.parse(node.config);
  try {
    const prevOutput  = context.results[node.id]?.output as { iteration?: number } | null;
    const iteration   = prevOutput ? (prevOutput.iteration ?? -1) + 1 : 0;
    const outputs     = buildOutputsMap(context);
    const shouldContinue = runUserCode(
      `return Boolean(${config.condition.trim()});`,
      ['context', 'variables', 'outputs', 'secrets', 'iteration', 'input', 'trigger'],
      [context, context.variables, outputs, context.secrets, iteration, context.input, context.variables.trigger ?? null],
      2000,
    ) as boolean;
    return { nodeId: node.id, status: 'success', output: { continue: shouldContinue, iteration }, startedAt, finishedAt: Date.now() };
  } catch (err) {
    return { nodeId: node.id, status: 'error', output: null, error: err instanceof Error ? err.message : String(err), startedAt, finishedAt: Date.now() };
  }
};

registerNode({
  type: 'loop',
  label: 'Loop',
  description: "Repeats the `loop` body while the condition stays true, then fires `done`. Loop via a back-edge with fromHandle \"loop\". maxIterations default 100.",
  category: 'Logic',
  configSchema: schema,
  outputSchema: z.object({ continue: z.boolean(), iteration: z.number() }),
  handles: ["loop","done"],
  execute,
});
