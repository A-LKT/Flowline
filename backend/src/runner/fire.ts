import { randomUUID, createHash } from 'crypto';
import * as db from '../db';
import { pool } from './pool';
import { loadSecrets } from './secrets';
import { createRunStream, scheduleStreamCleanup } from '../runStreams';
import { sanitizeResults, stripLargeValues } from './sanitizeResults';
import { isExecutionPaused } from '../executionState';
import type { RunTriggerType } from '../types';
import type { WorkerEvent, NodeExecutionResult } from '../types';

// Single dispatch path for every run (manual route, schedules, webhooks,
// file-watch, email, catchup). Creates the run record, wires the SSE stream,
// and finalises the DB row when the worker reports done/error.
export function fireWorkflowRun(
  workflowId: string,
  initialVariables?: Record<string, unknown>,
  triggerType: RunTriggerType | (string & {}) = 'schedule',
  triggerId?: string | null,
): string | null {
  const wf = db.getWorkflow(workflowId);
  if (!wf) return null;
  // Deprecated (soft-deleted) workflows are frozen for history only — never run
  // them, and never create a run row (a stray 'queued' row would be flipped to
  // 'error' at next boot, manufacturing fake failure history).
  if (wf.deprecated) return null;

  // Execution pause: drop automated runs while paused. Manual runs (the Run
  // panel) are exempt so an admin can pause background traffic and still test.
  // Gating here — before createRun — means no stray 'queued' row is created
  // (which failStaleActiveRuns() would flip to 'error' on the next boot).
  if (triggerType !== 'manual' && isExecutionPaused()) return null;

  const runId  = randomUUID();
  const scripts = db.getAllScripts();
  const secrets = loadSecrets();

  // Snapshot the exact graph this run executes against, content-addressed by
  // hash, so run review can render the real canvas even after the workflow is
  // edited. Written BEFORE createRun so a run row never exists without its
  // snapshot (which would fool the orphan-snapshot cleaner). Idempotent: repeat
  // runs of an unchanged graph reuse the one row.
  const snapshotData = JSON.stringify(wf);
  const snapshotHash = createHash('sha256').update(snapshotData).digest('hex');
  db.saveWorkflowSnapshot(wf.id, snapshotHash, snapshotData);

  db.createRun({ id: runId, workflowId: wf.id, status: 'queued', triggerType: triggerType as RunTriggerType, triggerId, createdAt: Date.now(), workflowVersion: wf.version, workflowSnapshotHash: snapshotHash });

  const stream = createRunStream(runId);
  let markedRunning = false;

  pool.submit(runId, wf, scripts, secrets, (event: WorkerEvent) => {
    // Strip oversized base64 blobs before the event is buffered, streamed, or
    // persisted — keeps them out of disk, the SSE replay buffer, and backups.
    // Events arrive structured-cloned from the worker thread, so mutating in
    // place is safe. See sanitizeResults.ts for the trade-offs.
    if (event.type === 'node:complete') {
      event.input  = stripLargeValues(event.input);
      event.output = stripLargeValues(event.output);
    } else if (event.type === 'done') {
      event.results = sanitizeResults(event.results);
    }

    stream.buffer.push(event);
    stream.emitter.emit('event', event);

    if (event.type === 'done') {
      stream.done = true;
      // Junction nodes record startedAt=0 — exclude them or the run appears to
      // have started in 1970.
      const startTimes = Object.values(event.results ?? {})
        .map((r) => r.startedAt)
        .filter((t) => t > 0);
      db.updateRun(runId, {
        status:     event.status,
        results:    event.results as Record<string, NodeExecutionResult>,
        logs:       event.logs,
        startedAt:  startTimes.length > 0 ? Math.min(...startTimes) : undefined,
        finishedAt: Date.now(),
      });
      scheduleStreamCleanup(runId);
    } else if (event.type === 'error') {
      stream.done = true;
      db.updateRun(runId, { status: 'error', finishedAt: Date.now() });
      scheduleStreamCleanup(runId);
    } else if (event.type === 'node:start' && !markedRunning) {
      markedRunning = true;
      db.updateRun(runId, { status: 'running', startedAt: Date.now() });
    }
  }, initialVariables);

  return runId;
}
