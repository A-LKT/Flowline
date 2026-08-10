import { registerNode } from '../engine/nodeRegistry';
import type { ExecutionContext, NodeExecutionResult, WorkflowNode } from '../types';

const execute = async (node: WorkflowNode, _context: ExecutionContext): Promise<NodeExecutionResult> => ({
  nodeId: node.id, status: 'error', output: null, error: 'Failure node: intentional failure for testing', startedAt: Date.now(), finishedAt: Date.now(),
});

registerNode({
  type: 'failure',
  label: 'Failure',
  description: "Always fails — for testing error handlers and error-handler workflows.",
  category: 'Control',
  execute,
});
