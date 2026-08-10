import { z } from 'zod';
import { registerNode } from '../engine/nodeRegistry';
import { evaluateExpression } from '../engine/expression';
import type { ExecutionContext, NodeExecutionResult, WorkflowNode } from '../types';

const schema = z.object({
  expression: z.string().min(1),
  case1: z.string().default(''),
  case2: z.string().default(''),
  case3: z.string().default(''),
  case4: z.string().default(''),
});

const execute = async (node: WorkflowNode, context: ExecutionContext): Promise<NodeExecutionResult> => {
  const startedAt = Date.now();
  const config = schema.parse(node.config);
  try {
    const value    = evaluateExpression(config.expression, context);
    const valueStr = String(value ?? '');
    const cases    = [config.case1, config.case2, config.case3, config.case4];
    let branch = 'default';
    for (let i = 0; i < cases.length; i++) {
      if (cases[i] && valueStr === String(cases[i])) { branch = String(i + 1); break; }
    }
    return { nodeId: node.id, status: 'success', output: { branch, value }, startedAt, finishedAt: Date.now() };
  } catch (err) {
    return { nodeId: node.id, status: 'error', output: null, error: err instanceof Error ? err.message : String(err), startedAt, finishedAt: Date.now() };
  }
};

registerNode({
  type: 'switch',
  label: 'Switch',
  description: "Routes to a case handle (1-4) by matching the expression value, else `default`. The matched handle id is in output.branch.",
  category: 'Logic',
  configSchema: schema,
  outputSchema: z.object({ branch: z.string(), value: z.string() }),
  handles: ["1","2","3","4","default"],
  execute,
});
