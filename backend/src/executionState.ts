import { getSetting, setSetting } from './db';

// Server-wide execution pause. When paused, automated runs (schedule, webhook,
// file-watch, email, catch-up) are dropped at the single dispatch choke point in
// runner/fire.ts. Manual runs from the Run panel are unaffected by design, so an
// admin can silence background traffic and still test workflows by hand.
//
// The flag is persisted in the settings table so a restart stays paused, and
// cached in a module variable so the run hot-path never hits the DB.

const PAUSE_KEY = 'execution_paused';

let paused = getSetting(PAUSE_KEY) === '1';

export function isExecutionPaused(): boolean {
  return paused;
}

export function setExecutionPaused(next: boolean): void {
  paused = next;
  setSetting(PAUSE_KEY, next ? '1' : '0');
}
