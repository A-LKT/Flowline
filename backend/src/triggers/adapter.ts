import type { Trigger } from '../types';

export interface TriggerAdapter {
  start(trigger: Trigger): void;
  stop(id: string): void;
  // Optional: fire this trigger on demand, right now. Only implement for kinds whose
  // firing input can be synthesized without an external event (e.g. schedule). Adapters
  // that react to externally-supplied payloads (webhook/email/file-watch) omit this.
  // Returns the started run id, or null if nothing was run.
  runNow?(trigger: Trigger): string | null;
}
