import { CronExpressionParser } from 'cron-parser';
import * as db from './db';
import { fireWorkflowRun } from './runner/fire';
import type { ScheduleConfig } from './types';

const CATCHUP_INTERVAL_MS = Number(process.env.SCHEDULE_CATCHUP_INTERVAL_MS ?? 15 * 60 * 1000);
// Only catch up if we are clearly past the scheduled time (avoids racing the real cron tick)
const DEBOUNCE_MS = 10_000;

function checkAllTriggers() {
  const triggers = db.getAllTriggers();
  const now = Date.now();

  for (const trigger of triggers) {
    if (!trigger.enabled || trigger.kind !== 'schedule') continue;
    if (trigger.target.type !== 'workflow') continue;

    const config = trigger.config as ScheduleConfig;
    if (config.catchup === false) continue;

    let lastExpectedFire: number;
    try {
      const interval = CronExpressionParser.parse(config.cron, {
        currentDate: new Date(now),
        tz: config.timezone,
      });
      lastExpectedFire = interval.prev().getTime();
    } catch {
      continue;
    }

    // Debounce: only act when we are clearly past the scheduled time
    if (now - lastExpectedFire < DEBOUNCE_MS) continue;

    // Prefer trigger-specific history; fall back to any schedule run for this workflow
    // (covers runs created before trigger_id tracking was added).
    // If neither exists the workflow has never run on schedule — skip until the first natural fire.
    const lastRun = db.getLastRunForTrigger(trigger.id)
      ?? db.getLastScheduleRunForWorkflow(trigger.target.id);
    if (lastRun === null) continue;

    if (lastRun < lastExpectedFire) {
      const runId = fireWorkflowRun(trigger.target.id, undefined, 'schedule-catchup', trigger.id);
      console.log(`[catchup] fired missed run for trigger "${trigger.name}" (${trigger.id}) → runId=${runId}, lastExpected=${new Date(lastExpectedFire).toISOString()}, lastRun=${new Date(lastRun).toISOString()}`);
    }
  }
}

export function startCatchupWatcher() {
  checkAllTriggers();
  setInterval(checkAllTriggers, CATCHUP_INTERVAL_MS);
}
