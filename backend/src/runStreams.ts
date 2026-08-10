import EventEmitter from 'events';
import type { WorkerEvent } from './types';

export type RunStream = {
  emitter: EventEmitter;
  buffer:  WorkerEvent[];
  done:    boolean;
};

const STREAM_TTL_MS = 5 * 60_000;

export const activeStreams = new Map<string, RunStream>();

export function createRunStream(runId: string): RunStream {
  const stream: RunStream = { emitter: new EventEmitter(), buffer: [], done: false };
  stream.emitter.setMaxListeners(20);
  activeStreams.set(runId, stream);
  return stream;
}

export function scheduleStreamCleanup(runId: string): void {
  setTimeout(() => activeStreams.delete(runId), STREAM_TTL_MS);
}
