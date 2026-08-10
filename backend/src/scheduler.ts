import cron from 'node-cron';
import * as db from './db';
import { fireWorkflowRun } from './runner/fire';
import type { Trigger, ScheduleConfig } from './types';

const jobs = new Map<string, cron.ScheduledTask>();

function fireTrigger(triggerId: string) {
  const trigger = db.getTrigger(triggerId);
  if (!trigger || !trigger.enabled) return;
  if (trigger.target.type === 'workflow') fireWorkflowRun(trigger.target.id, undefined, 'schedule', triggerId);
}

export function scheduleTrigger(trigger: Trigger) {
  unscheduleTrigger(trigger.id);
  if (!trigger.enabled || trigger.kind !== 'schedule') return;

  const config = trigger.config as ScheduleConfig;
  if (!cron.validate(config.cron)) return;

  const task = cron.schedule(config.cron, () => fireTrigger(trigger.id), {
    timezone: config.timezone,
  });
  jobs.set(trigger.id, task);
}

export function unscheduleTrigger(id: string) {
  const task = jobs.get(id);
  if (task) {
    task.stop();
    jobs.delete(id);
  }
}
