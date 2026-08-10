import { db, pruneOrphanedDeprecatedWorkflows, pruneOrphanedSnapshots } from '../../db';
import { getConfig, saveConfig, type HousekeepingConfig } from './config';

export type HousekeepingResult = {
  removedRuns: number;
  removedWorkflows: number;
  removedSnapshots: number;
  vacuumed: boolean;
  ranAt: number;
};

// Statuses that must never be purged — an active run's row is owned by the worker
// pool / SSE stream, so deleting it would break a live execution.
const PROTECTED = ['running', 'queued'];

// Apply the retention policy once. Safe to call manually (run-now) or from the
// scheduler. Returns what was removed.
export function runHousekeeping(cfg: HousekeepingConfig = getConfig()): HousekeepingResult {
  let removedRuns = 0;

  const eligible = cfg.statuses.filter((s) => !PROTECTED.includes(s));

  const tx = db.transaction(() => {
    // 1) Age-based purge.
    if (cfg.maxAgeDays > 0 && eligible.length > 0) {
      const cutoff = Date.now() - cfg.maxAgeDays * 24 * 60 * 60 * 1000;
      const placeholders = eligible.map(() => '?').join(', ');
      const info = db.prepare(
        `DELETE FROM runs WHERE created_at < ? AND status IN (${placeholders})`,
      ).run(cutoff, ...eligible);
      removedRuns += info.changes;
    }

    // 2) Keep-at-most-N-per-workflow (newest kept), never touching active runs.
    if (cfg.keepPerWorkflow > 0) {
      const info = db.prepare(`
        DELETE FROM runs WHERE id IN (
          SELECT id FROM (
            SELECT id, ROW_NUMBER() OVER (PARTITION BY workflow_id ORDER BY created_at DESC) AS rn
            FROM runs
            WHERE status NOT IN ('running', 'queued')
          ) WHERE rn > ?
        )
      `).run(cfg.keepPerWorkflow);
      removedRuns += info.changes;
    }
  });
  tx();

  // 3) Drop workflow snapshots no surviving run references. Must come after the
  //    run-deletion transaction (which orphans them) but BEFORE the deprecated-
  //    workflow prune below — that prune's FK cascade would otherwise delete these
  //    same rows first, making this count read low. Always on: it's pure garbage
  //    collection of graphs nothing can display any more.
  const removedSnapshots = pruneOrphanedSnapshots();

  // 4) Drop deprecated workflows whose runs are now all gone (they preserve
  //    nothing once history is pruned). Uses the existing retention companion.
  const removedWorkflows = cfg.pruneDeprecated ? pruneOrphanedDeprecatedWorkflows() : 0;

  // 5) Reclaim disk if asked. VACUUM cannot run inside a transaction.
  let vacuumed = false;
  if (cfg.vacuum && (removedRuns > 0 || removedWorkflows > 0 || removedSnapshots > 0)) {
    db.exec('VACUUM');
    vacuumed = true;
  }

  const ranAt = Date.now();
  saveConfig({ ...cfg, lastRunAt: ranAt, lastRemovedRuns: removedRuns });

  return { removedRuns, removedWorkflows, removedSnapshots, vacuumed, ranAt };
}

// ─── Scheduler ────────────────────────────────────────────────────────────────
// A light ticker (every 15 min) that runs the purge when it's both enabled and
// due (now - lastRunAt >= intervalHours). This avoids re-scheduling cron jobs on
// every config change — the tick just re-reads the current config each time.

const TICK_MS = 15 * 60 * 1000;
let timer: ReturnType<typeof setInterval> | null = null;

function tick(): void {
  try {
    const cfg = getConfig();
    if (!cfg.enabled) return;
    const dueAfter = (cfg.lastRunAt ?? 0) + cfg.intervalHours * 60 * 60 * 1000;
    if (Date.now() >= dueAfter) runHousekeeping(cfg);
  } catch { /* never let a purge error kill the ticker */ }
}

export function startHousekeepingScheduler(): void {
  if (timer) return;
  // A first tick shortly after boot, then on a fixed cadence.
  setTimeout(tick, 60 * 1000);
  timer = setInterval(tick, TICK_MS);
}
