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

const HANDLES = [
  { id: '1',       pct: '12%',  label: '1' },
  { id: '2',       pct: '30%',  label: '2' },
  { id: '3',       pct: '50%',  label: '3' },
  { id: '4',       pct: '70%',  label: '4' },
  { id: 'default', pct: '88%',  label: '·' },
];

export const SwitchNodeComponent = ({ data, selected }: NodeProps<NodeData>) => {
  const isLR      = data.direction === 'LR';
  const targetPos = isLR ? Position.Left  : Position.Top;
  const sourcePos = isLR ? Position.Right : Position.Bottom;
  const Icon      = getNodeIcon('switch');

  return (
    <div
      className="wf-node wf-node--switch"
      data-status={data.status}
      data-active={data.isActive        ? 'true' : undefined}
      data-entrypoint={data.isEntrypoint ? 'true' : undefined}
      data-selected={selected            ? 'true' : undefined}
      data-disabled={!data.enabled       ? 'true' : undefined}
    >
      <Handle type="target" position={targetPos} />

      <div className="wf-node-header">
        <span className="wf-node-icon" data-type="switch">
          <Icon size={13} strokeWidth={2} />
        </span>
        <span className="wf-node-type" data-type="switch">switch</span>
      </div>

      {data.label && <div className="wf-node-label">{data.label}</div>}
      {data.nodeDescription && <div className="wf-node-desc">{data.nodeDescription}</div>}
      {data.status !== 'idle' && <div className="wf-node-status">{data.status}</div>}
      {data.showTiming && (
        <NodeTimingBadge status={data.status} startedAt={data.startedAt} finishedAt={data.finishedAt} />
      )}

      <div className="switch-handle-labels" data-dir={data.direction}>
        {HANDLES.map((h) => (
          <span key={h.id} className={"switch-label"}>
            {h.label}
          </span>
        ))}
      </div>

      {HANDLES.map((h) => (
        <Handle
          key={h.id}
          type="source"
          id={h.id}
          position={sourcePos}
          style={isLR ? { top: h.pct } : { left: h.pct }}
          className={h.id === 'default' ? 'switch-handle--default' : undefined}
        />
      ))}
    </div>
  );
};
