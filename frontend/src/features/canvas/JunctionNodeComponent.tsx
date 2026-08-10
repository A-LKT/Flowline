import { Handle, Position, type NodeProps } from 'reactflow';
import type { ExecutionStatus } from '../../types/workflow';

type NodeData = {
  status:      ExecutionStatus;
  isActive:    boolean;
  orientation: 'vertical' | 'horizontal';
};

export const JunctionNodeComponent = ({ data, selected }: NodeProps<NodeData>) => {
  const isLR      = data.orientation === 'horizontal';
  const targetPos = isLR ? Position.Left  : Position.Top;
  const sourcePos = isLR ? Position.Right : Position.Bottom;

  return (
    <div
      className="junction-node"
      data-status={data.status}
      data-active={data.isActive ? 'true' : undefined}
      data-selected={selected   ? 'true' : undefined}
    >
      <Handle type="target" position={targetPos} />
      <Handle type="source" position={sourcePos} />
    </div>
  );
};
