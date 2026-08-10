import { registerNode } from '../engine/nodeRegistry';
import type { ExecutionContext, NodeExecutionResult, WorkflowNode } from '../types';

const execute = async (node: WorkflowNode, _context: ExecutionContext): Promise<NodeExecutionResult> => ({
  nodeId: node.id, status: 'success', output: null, startedAt: Date.now(), finishedAt: Date.now(),
});

registerNode({
  type: 'label',
  label: 'Label',
  description: "Decorative canvas annotation. No execution, no edges.",
  category: 'Control',
  execute,
});
