import { Handle, Position, type NodeProps } from 'reactflow';
import type { ExecutionStatus, LayoutDirection } from '../../types/workflow';
import { getNodeIcon } from './nodeIcons';
import { NodeTimingBadge } from './NodeTimingBadge';

type NodeData = {
  label:            string | undefined;
  nodeType:         string;
  nodeDescription:  string | undefined;
  status:           ExecutionStatus;
  isActive:         boolean;
  isEntrypoint:     boolean;
  isLoopEntry:      boolean;
  direction:        LayoutDirection;
  showTiming:       boolean;
  startedAt:        number;
  finishedAt:       number;
  enabled:          boolean;
  onToggleEnabled:  () => void;
};

export const WorkflowNodeComponent = ({ data, selected }: NodeProps<NodeData>) => {
  const isLR      = data.direction === 'LR';
  const targetPos = isLR ? Position.Left  : Position.Top;
  const sourcePos = isLR ? Position.Right : Position.Bottom;
  const Icon      = getNodeIcon(data.nodeType);

  return (
    <div
      className="wf-node"
      data-status={data.status}
      data-active={data.isActive          ? 'true' : undefined}
      data-entrypoint={data.isEntrypoint  ? 'true' : undefined}
      data-loop-entry={data.isLoopEntry   ? 'true' : undefined}
      data-selected={selected             ? 'true' : undefined}
      data-disabled={!data.enabled        ? 'true' : undefined}
    >
      <Handle type="target" position={targetPos} />

      <div className="wf-node-header">
        <span className="wf-node-icon" data-type={data.nodeType}>
          <Icon size={13} strokeWidth={2} />
        </span>
        <span className="wf-node-type" data-type={data.nodeType}>
          {data.nodeType}
        </span>
        {data.status !== 'idle' && <span className="wf-node-dot" />}
      </div>

      {data.label && <div className="wf-node-label">{data.label}</div>}

      {data.nodeDescription && (
        <div className="wf-node-desc">{data.nodeDescription}</div>
      )}

      {data.showTiming && (
        <NodeTimingBadge status={data.status} startedAt={data.startedAt} finishedAt={data.finishedAt} />
      )}

      <Handle type="source" position={sourcePos} />
    </div>
  );
};
