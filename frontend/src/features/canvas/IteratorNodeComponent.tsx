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
  isLoopEntry:     boolean;
  direction:       LayoutDirection;
  showTiming:      boolean;
  startedAt:       number;
  finishedAt:      number;
  enabled:         boolean;
  onToggleEnabled: () => void;
};

export const IteratorNodeComponent = ({ data, selected }: NodeProps<NodeData>) => {
  const isLR        = data.direction === 'LR';
  const targetPos   = isLR ? Position.Left   : Position.Top;
  const sourcePos   = isLR ? Position.Right  : Position.Bottom;
  // Iterator-back handle sits on the side perpendicular to the flow direction.
  // In TB layout it's on the left; in LR layout it's on the bottom.
  const iteratorPos = isLR ? Position.Bottom : Position.Left;
  const Icon        = getNodeIcon('iterator');

  return (
    <div
      className="wf-node wf-node--iterator"
      data-status={data.status}
      data-active={data.isActive          ? 'true' : undefined}
      data-entrypoint={data.isEntrypoint  ? 'true' : undefined}
      data-loop-entry={data.isLoopEntry   ? 'true' : undefined}
      data-selected={selected              ? 'true' : undefined}
      data-disabled={!data.enabled         ? 'true' : undefined}
    >
      <Handle type="target" position={targetPos} />

      {/* Iterator-back handle — connects back to the start of the section to repeat */}
      <Handle
        type="source"
        id="iterator"
        position={iteratorPos}
        className="iterator-back-handle"
        title="Iterator-back — connect this to the start of the section to repeat"
      />

      <div className="wf-node-header">
        <span className="wf-node-icon" data-type="iterator">
          <Icon size={13} strokeWidth={2} />
        </span>
        <span className="wf-node-type" data-type="iterator">iterator</span>
      </div>

      {data.label && <div className="wf-node-label">{data.label}</div>}
      {data.nodeDescription && <div className="wf-node-desc">{data.nodeDescription}</div>}

      {data.status !== 'idle' && <div className="wf-node-status">{data.status}</div>}
      {data.showTiming && (
        <NodeTimingBadge status={data.status} startedAt={data.startedAt} finishedAt={data.finishedAt} />
      )}

      {/* Forward/done handle — execution continues here after the iterator exits */}
      <Handle type="source" id="done" position={sourcePos} />
    </div>
  );
};
