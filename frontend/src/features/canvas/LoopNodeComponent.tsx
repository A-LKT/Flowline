import { Handle, Position, type NodeProps } from 'reactflow';
import type { ExecutionStatus, LayoutDirection } from '../../types/workflow';
import { getNodeIcon } from './nodeIcons';
import { NodeTimingBadge } from './NodeTimingBadge';

type NodeData = {
  label:           string | undefined;
  nodeType:        string;
  nodeDescription: string | undefined;
  status:          ExecutionStatus;
  isActive:        boolean;
  isEntrypoint:    boolean;
  direction:       LayoutDirection;
  showTiming:      boolean;
  startedAt:       number;
  finishedAt:      number;
  enabled:         boolean;
  onToggleEnabled: () => void;
};

export const LoopNodeComponent = ({ data, selected }: NodeProps<NodeData>) => {
  const isLR      = data.direction === 'LR';
  const targetPos = isLR ? Position.Left   : Position.Top;
  const sourcePos = isLR ? Position.Right  : Position.Bottom;
  // Loop-back handle sits on the side perpendicular to the flow direction.
  // In TB layout it's on the left; in LR layout it's on the top.
  const loopPos   = isLR ? Position.Bottom    : Position.Left;
  const Icon      = getNodeIcon('loop');

  return (
    <div
      className="wf-node wf-node--loop"
      data-status={data.status}
      data-active={data.isActive        ? 'true' : undefined}
      data-entrypoint={data.isEntrypoint ? 'true' : undefined}
      data-selected={selected            ? 'true' : undefined}
      data-disabled={!data.enabled       ? 'true' : undefined}
    >
      <Handle type="target" position={targetPos} />

      {/* Loop-back handle — connects back to an earlier node in the loop body */}
      <Handle
        type="source"
        id="loop"
        position={loopPos}
        className="loop-back-handle"
        title="Loop-back — connect this to the start of the section to repeat"
      />

      <div className="wf-node-header">
        <span className="wf-node-icon" data-type="loop">
          <Icon size={13} strokeWidth={2} />
        </span>
        <span className="wf-node-type" data-type="loop">loop</span>
      </div>

      {data.label && <div className="wf-node-label">{data.label}</div>}
      {data.nodeDescription && <div className="wf-node-desc">{data.nodeDescription}</div>}

      {data.status !== 'idle' && <div className="wf-node-status">{data.status}</div>}
      {data.showTiming && (
        <NodeTimingBadge status={data.status} startedAt={data.startedAt} finishedAt={data.finishedAt} />
      )}

      {/* Forward/done handle — execution continues here after the loop exits */}
      <Handle type="source" id="done" position={sourcePos} />
    </div>
  );
};
