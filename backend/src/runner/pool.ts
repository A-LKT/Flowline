import { Worker } from 'worker_threads';
import path from 'path';
import os from 'os';
import type { WorkerInbound, WorkerEvent, Workflow, Script } from '../types';

type EventCallback = (event: WorkerEvent) => void;

type QueueEntry = {
  msg: WorkerInbound;
  onEvent: EventCallback;
  resolve: () => void;
  reject: (e: Error) => void;
};

class WorkerWrapper {
  private worker: Worker;
  busy = false;

  constructor(workerFile: string) {
    // In dev (tsx), inject the CJS loader so .ts imports resolve inside the worker.
    // In production (compiled .js), no extra loader needed.
    const execArgv = workerFile.endsWith('.ts')
      ? ['--require', require.resolve('tsx/cjs')]
      : [];
    this.worker = new Worker(workerFile, { execArgv });
  }

  execute(msg: WorkerInbound, onEvent: EventCallback): Promise<void> {
    this.busy = true;

    return new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        this.worker.off('message', onMessage);
        this.worker.off('error', onError);
        this.worker.off('exit', onExit);
        this.busy = false;
      };
      const onMessage = (event: WorkerEvent) => {
        onEvent(event);
        if (event.type === 'done' || event.type === 'error') {
          cleanup();
          resolve();
        }
      };
      // A worker that throws or dies mid-run would otherwise leave the run
      // 'running' forever and this wrapper busy forever. Emit a synthetic
      // error event so the run record is finalised, then reject so the pool
      // replaces this worker.
      const onError = (err: Error) => {
        onEvent({ type: 'error', runId: msg.runId, error: `Worker crashed: ${err.message}` });
        cleanup();
        reject(err);
      };
      const onExit = (code: number) => {
        onEvent({ type: 'error', runId: msg.runId, error: `Worker exited unexpectedly (code ${code})` });
        cleanup();
        reject(new Error(`worker exited with code ${code}`));
      };
      this.worker.on('message', onMessage);
      this.worker.on('error', onError);
      this.worker.on('exit', onExit);
      this.worker.postMessage(msg);
    });
  }

  sendCancel(runId: string) {
    this.worker.postMessage({ type: 'cancel', runId } satisfies WorkerInbound);
  }

  terminate(): Promise<number> {
    return this.worker.terminate();
  }
}

export class WorkerPool {
  private workers: WorkerWrapper[];
  private queue: QueueEntry[] = [];
  private workerFile: string;
  private activeRuns = new Map<string, WorkerWrapper>();

  constructor(size?: number) {
    const count = size ?? Math.max(2, Math.min(os.cpus().length, 8));
    const ext   = __filename.endsWith('.ts') ? '.ts' : '.js';
    this.workerFile = path.join(__dirname, `worker${ext}`);
    this.workers = Array.from({ length: count }, () => new WorkerWrapper(this.workerFile));
  }

  // Primary dispatch — awaitable, used when the caller wants to know when the run finishes.
  dispatch(runId: string, worker: WorkerWrapper, msg: WorkerInbound, onEvent: EventCallback): Promise<void> {
    this.activeRuns.set(runId, worker);
    return worker.execute(msg, onEvent)
      .catch((err: unknown) => {
        // Replace the crashed worker with a fresh one and make sure the old
        // thread is gone (terminate is a no-op if it already exited).
        const idx = this.workers.indexOf(worker);
        if (idx >= 0) this.workers[idx] = new WorkerWrapper(this.workerFile);
        void worker.terminate().catch(() => {});
        throw err;
      })
      .finally(() => {
        this.activeRuns.delete(runId);
        this.drainQueue();
      });
  }

  private drainQueue() {
    if (this.queue.length === 0) return;
    const available = this.workers.find((w) => !w.busy);
    if (!available) return;
    const entry = this.queue.shift()!;
    void this.dispatch(entry.msg.runId, available, entry.msg, entry.onEvent)
      .then(entry.resolve)
      .catch(entry.reject);
  }

  // Fire-and-forget submission used by the HTTP route.
  // Crash rejections are swallowed here: the WorkerWrapper already emitted a
  // synthetic 'error' event that finalises the run record.
  submit(runId: string, workflow: Workflow, scripts: Script[], secrets: Record<string, string>, onEvent: EventCallback, initialVariables?: Record<string, unknown>): void {
    const msg: WorkerInbound = { type: 'run', runId, workflow, scripts, secrets, initialVariables };
    const worker = this.workers.find((w) => !w.busy);

    if (worker) {
      void this.dispatch(runId, worker, msg, onEvent).catch(() => {});
    } else {
      this.queue.push({
        msg,
        onEvent,
        resolve: () => { /* fire-and-forget */ },
        reject: () => { /* error event already emitted by WorkerWrapper */ },
      });
    }
  }

  cancel(runId: string): boolean {
    const worker = this.activeRuns.get(runId);
    if (worker) {
      worker.sendCancel(runId);
      return true;
    }
    // Run is still queued — remove it and synthesise a cancelled done event.
    const idx = this.queue.findIndex((e) => e.msg.runId === runId);
    if (idx >= 0) {
      const [entry] = this.queue.splice(idx, 1);
      entry.onEvent({ type: 'done', runId, status: 'cancelled', results: {}, logs: [] });
      entry.resolve();
      return true;
    }
    return false;
  }

  get poolSize(): number  { return this.workers.length; }
  get busyCount(): number { return this.workers.filter((w) => w.busy).length; }
  get queueLength(): number { return this.queue.length; }
}

export const pool = new WorkerPool(Number(process.env.WORKER_COUNT) || undefined);
