import * as db from '../db';
import type { Trigger } from '../types';
import type { TriggerAdapter } from './adapter';

const adapters = new Map<string, TriggerAdapter>();

export function registerAdapter(kind: string, adapter: TriggerAdapter): void {
  adapters.set(kind, adapter);
}

export function getAdapter(kind: string): TriggerAdapter | undefined {
  return adapters.get(kind);
}

export function startTrigger(trigger: Trigger): void {
  if (!trigger.enabled) return;
  try {
    adapters.get(trigger.kind)?.start(trigger);
  } catch (err) {
    console.error(`[trigger:${trigger.id}] failed to start (kind=${trigger.kind}):`, err);
  }
}

export function stopTrigger(id: string): void {
  for (const adapter of adapters.values()) {
    try { adapter.stop(id); } catch { /* ignore */ }
  }
}

export function startAllTriggers(): void {
  for (const trigger of db.getAllTriggers()) {
    if (trigger.enabled) startTrigger(trigger);
  }
}
