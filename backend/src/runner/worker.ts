// Worker thread entry point.
// Runs the full execution engine in isolation from the main process.
// Each worker handles one workflow run at a time; the pool ensures reuse.
import { parentPort } from 'worker_threads';
import { executeWorkflow } from '../engine/executor';
import '../nodes/index';   // register built-in node types
import '../plugins/index'; // register plugin node types
import type { WorkerInbound, WorkerEvent } from '../types';

if (!parentPort) throw new Error('worker.ts must run as a Worker thread');

const port = parentPort;

port.postMessage({ type: 'ready' } satisfies WorkerEvent);

let currentSignal: { cancelled: boolean } | null = null;

port.on('message', (msg: WorkerInbound) => {
  if (msg.type === 'cancel') {
    if (currentSignal) currentSignal.cancelled = true;
    return;
  }

  if (msg.type !== 'run') return;

  const { runId, workflow, scripts, secrets, initialVariables } = msg;
  const logs: string[] = [];
  const signal = { cancelled: false };
  currentSignal = signal;

  void executeWorkflow(workflow, scripts, secrets ?? {}, {
    onNodeStart: (nodeId, nodeName, resolvedConfig, startedAt) => {
      port.postMessage({ type: 'node:start', runId, nodeId, nodeName, resolvedConfig, startedAt } satisfies WorkerEvent);
    },
    onNodeComplete: (nodeId, nodeName, status, input, output, error, startedAt, finishedAt) => {
      port.postMessage({ type: 'node:complete', runId, nodeId, nodeName, status, input, output, error, startedAt, finishedAt } satisfies WorkerEvent);
    },
    onLog: (message) => {
      logs.push(message);
      port.postMessage({ type: 'log', runId, message } satisfies WorkerEvent);
    },
  }, initialVariables, signal, runId)
    .then((ctx) => {
      currentSignal = null;
      const status = signal.cancelled
        ? 'cancelled'
        : Object.values(ctx.results).some((r) => r.status === 'error') ? 'error' : 'success';
      port.postMessage({ type: 'done', runId, status, results: ctx.results, logs } satisfies WorkerEvent);
    })
    .catch((err: unknown) => {
      currentSignal = null;
      port.postMessage({ type: 'error', runId, error: err instanceof Error ? err.message : String(err) } satisfies WorkerEvent);
    });
});
