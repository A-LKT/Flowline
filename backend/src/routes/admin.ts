import type { FastifyInstance } from 'fastify';
import { db, getAllWorkflows, getAllScripts, getAllTriggers, getAllRuns, getAllSecretsEncrypted, getAllWorkflowSnapshots, importWorkflowSnapshot, upsertWorkflow, upsertScript, upsertTrigger, setSecret, type WorkflowSnapshotRow } from '../db';
import { encrypt, decrypt, isVaultKeySet } from '../crypto';
import { sanitizeResults } from '../runner/sanitizeResults';
import { isExecutionPaused, setExecutionPaused } from '../executionState';
import type { Workflow, Script, Trigger, Run } from '../types';

type BackupData = {
  workflows?: Workflow[];
  scripts?:   Script[];
  triggers?:  Trigger[];
  runs?:      Run[];
  // Captured run canvases, bundled with runs (same 'runs' include). Restored runs
  // without these fall back to the version-mismatch warning.
  snapshots?: WorkflowSnapshotRow[];
  secrets?:   { name: string; value: string }[];
};

type Backup = {
  version:    number;
  exportedAt: string;
  data:       BackupData;
};

export const adminRoutes = async (app: FastifyInstance) => {

  // GET /admin/execution — current execution-pause state
  app.get('/admin/execution', async () => ({ paused: isExecutionPaused() }));

  // POST /admin/execution { paused } — pause/resume automated execution.
  // Manual runs are never affected; see runner/fire.ts.
  app.post<{ Body: { paused?: boolean } }>('/admin/execution', async (req, reply) => {
    const paused = !!req.body?.paused;
    setExecutionPaused(paused);
    return reply.send({ paused });
  });

  // GET /admin/export?include=workflows,scripts,triggers,runs,secrets
  app.get<{ Querystring: { include?: string } }>('/admin/export', async (req, reply) => {
    const parts = new Set((req.query.include ?? '').split(',').map((s) => s.trim()).filter(Boolean));

    const data: BackupData = {};

    if (parts.has('workflows')) data.workflows = getAllWorkflows();
    if (parts.has('scripts'))   data.scripts   = getAllScripts();
    if (parts.has('triggers'))  data.triggers  = getAllTriggers();

    if (parts.has('runs')) {
      // Safety net: strip oversized blobs at export time too, so runs written
      // before the persistence-boundary fix (or before the one-time cleanup
      // script) don't bloat the backup. New runs are already sanitized on write.
      data.runs = getAllRuns({ limit: 999999, offset: 0, includeData: true }).map((r) =>
        r.results ? { ...r, results: sanitizeResults(r.results) } : r,
      );
      // Bundle the run canvases so restored runs can still show the graph that ran.
      data.snapshots = getAllWorkflowSnapshots();
    }

    if (parts.has('secrets')) {
      if (!isVaultKeySet()) {
        return reply.code(400).send({ error: 'VAULT_KEY is not set — cannot export secrets' });
      }
      data.secrets = getAllSecretsEncrypted().flatMap((row) => {
        try   { return [{ name: row.name, value: decrypt(row.encrypted_value) }]; }
        catch { return []; }
      });
    }

    const backup: Backup = { version: 1, exportedAt: new Date().toISOString(), data };
    const filename = `workflow-backup-${new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-')}.json`;

    reply.header('Content-Type', 'application/json');
    reply.header('Content-Disposition', `attachment; filename="${filename}"`);
    return reply.send(backup);
  });

  // POST /admin/import  { backup: Backup, include: string[] }
  app.post<{ Body: { backup: Backup; include: string[] } }>('/admin/import', async (req, reply) => {
    const { backup, include } = req.body ?? {};
    if (!backup?.data) return reply.code(400).send({ error: 'Invalid backup — missing data field' });

    const parts  = new Set(include ?? []);
    const counts: Record<string, number> = {};
    const errors: string[] = [];

    if (parts.has('workflows') && Array.isArray(backup.data.workflows)) {
      let n = 0;
      for (const wf of backup.data.workflows) {
        try { upsertWorkflow(wf as Workflow); n++; } catch (e) { errors.push(`workflow ${(wf as Workflow).id}: ${String(e)}`); }
      }
      counts.workflows = n;
    }

    if (parts.has('scripts') && Array.isArray(backup.data.scripts)) {
      let n = 0;
      for (const sc of backup.data.scripts) {
        try { upsertScript(sc as Script); n++; } catch (e) { errors.push(`script ${(sc as Script).id}: ${String(e)}`); }
      }
      counts.scripts = n;
    }

    if (parts.has('triggers') && Array.isArray(backup.data.triggers)) {
      let n = 0;
      for (const t of backup.data.triggers) {
        try { upsertTrigger(t as Trigger); n++; } catch (e) { errors.push(`trigger ${(t as Trigger).id}: ${String(e)}`); }
      }
      counts.triggers = n;
    }

    // Run canvases travel with runs (same 'runs' include). Import them first so a
    // restored run's snapshot is present; each requires its workflow to exist (FK),
    // and skips (with an error) otherwise — same contract as runs themselves.
    if (parts.has('runs') && Array.isArray(backup.data.snapshots)) {
      let n = 0;
      for (const snap of backup.data.snapshots as WorkflowSnapshotRow[]) {
        try { importWorkflowSnapshot(snap); n++; } catch (e) { errors.push(`snapshot ${snap.hash?.slice(0, 12)}: ${String(e)}`); }
      }
      counts.snapshots = n;
    }

    if (parts.has('runs') && Array.isArray(backup.data.runs)) {
      const stmt = db.prepare(`
        INSERT OR IGNORE INTO runs
          (id, workflow_id, status, results, logs, started_at, finished_at, created_at, workflow_version, workflow_snapshot_hash, trigger_type, trigger_id)
        VALUES
          (@id, @workflowId, @status, @results, @logs, @startedAt, @finishedAt, @createdAt, @workflowVersion, @workflowSnapshotHash, @triggerType, @triggerId)
      `);
      let n = 0;
      for (const run of backup.data.runs as Run[]) {
        try {
          stmt.run({
            id:                  run.id,
            workflowId:          run.workflowId,
            status:              run.status,
            results:             run.results ? JSON.stringify(run.results) : null,
            logs:                run.logs    ? JSON.stringify(run.logs)    : null,
            startedAt:           run.startedAt   ?? null,
            finishedAt:          run.finishedAt  ?? null,
            createdAt:           run.createdAt,
            workflowVersion:     run.workflowVersion ?? null,
            workflowSnapshotHash: run.workflowSnapshotHash ?? null,
            triggerType:         run.triggerType ?? 'manual',
            triggerId:           run.triggerId ?? null,
          });
          n++;
        } catch (e) { errors.push(`run ${run.id}: ${String(e)}`); }
      }
      counts.runs = n;
    }

    if (parts.has('secrets') && Array.isArray(backup.data.secrets)) {
      if (!isVaultKeySet()) {
        errors.push('secrets skipped — VAULT_KEY is not set');
      } else {
        let n = 0;
        for (const s of backup.data.secrets as { name: string; value: string }[]) {
          try { setSecret(s.name, encrypt(s.value)); n++; } catch (e) { errors.push(`secret ${s.name}: ${String(e)}`); }
        }
        counts.secrets = n;
      }
    }

    return reply.send({ ok: true, counts, errors });
  });
};
