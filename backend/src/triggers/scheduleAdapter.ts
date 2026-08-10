import { scheduleTrigger, unscheduleTrigger } from '../scheduler';
import { fireWorkflowRun } from '../runner/fire';
import type { TriggerAdapter } from './adapter';
import type { Trigger } from '../types';

export const scheduleAdapter: TriggerAdapter = {
  start(trigger: Trigger) { scheduleTrigger(trigger); },
  stop(id: string)        { unscheduleTrigger(id); },

  // On-demand fire: identical to a scheduled tick, but recorded as a 'manual' run.
  // triggerId is preserved so the trigger's "last run" still updates.
  runNow(trigger: Trigger) {
    if (trigger.target.type !== 'workflow') return null;
    return fireWorkflowRun(trigger.target.id, undefined, 'manual', trigger.id);
  },
};
