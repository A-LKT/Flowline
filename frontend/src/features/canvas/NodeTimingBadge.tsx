import { useEffect, useState } from 'react';
import type { ExecutionStatus } from '../../types/workflow';

function formatMs(ms: number): string {
  if (ms < 1000) return '<1s';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

type Props = {
  status:     ExecutionStatus;
  startedAt:  number;
  finishedAt: number;
};

export const NodeTimingBadge = ({ status, startedAt, finishedAt }: Props) => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (status !== 'running') return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [status]);

  if (status === 'idle' || startedAt === 0) return null;

  const elapsed = status === 'running' ? now - startedAt : finishedAt - startedAt;
  return <span className="wf-node-timing">{formatMs(elapsed)}</span>;
};
