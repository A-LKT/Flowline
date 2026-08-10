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

export const ForkNodeComponent = ({ data, selected }: NodeProps<NodeData>) => {
  const isLR      = data.direction === 'LR';
  const targetPos = isLR ? Position.Left  : Position.Top;
  const sourcePos = isLR ? Position.Right : Position.Bottom;
  const Icon      = getNodeIcon('fork');

  const trueStyle  = isLR ? { top: '33%'  } : { left: '33%'  };
  const falseStyle = isLR ? { top: '67%'  } : { left: '67%'  };

  return (
    <div
      className="wf-node wf-node--fork"
      data-status={data.status}
      data-active={data.isActive        ? 'true' : undefined}
      data-entrypoint={data.isEntrypoint ? 'true' : undefined}
      data-selected={selected            ? 'true' : undefined}
      data-disabled={!data.enabled       ? 'true' : undefined}
    >
      <Handle type="target" position={targetPos} />

      <div className="wf-node-header">
        <span className="wf-node-icon" data-type="fork">
          <Icon size={13} strokeWidth={2} />
        </span>
        <span className="wf-node-type" data-type="fork">fork</span>
      </div>

      {data.label && <div className="wf-node-label">{data.label}</div>}
      {data.nodeDescription && <div className="wf-node-desc">{data.nodeDescription}</div>}
      {/* {data.status !== 'idle' && <div className="wf-node-status">{data.status}</div>} */}
      {data.showTiming && (
        <NodeTimingBadge status={data.status} startedAt={data.startedAt} finishedAt={data.finishedAt} />
      )}

      <Handle type="source" id="true"  position={sourcePos} style={trueStyle}  className="fork-handle--true"  />
      <Handle type="source" id="false" position={sourcePos} style={falseStyle} className="fork-handle--false" />
    </div>
  );
};
