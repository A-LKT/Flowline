import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { isMainThread } from 'worker_threads';

// Per-boot secret for the server's own worker→main loopback calls. The run engine
// runs node logic in worker threads; the async run-workflow node and error-handler
// firing start a child run by POSTing to this server's own /workflows/:id/run over
// localhost (that route lives on the main thread, which owns the worker pool, so a
// direct call from a worker can't reach it). That request must pass the auth gate.
//
// This is NOT a user credential and is never documented as an access path: it is a
// random value generated once in the main thread and inherited by worker threads
// via process.env, so only this process's own threads can present it. External
// callers still have exactly one way in — the username/password login.
//
// IMPORTANT: this module must be imported (its side effect run) before the worker
// pool spawns, so the token is already in process.env when workers inherit it.
// index.ts imports it first for that reason.

const ENV_KEY = 'INTERNAL_RUN_TOKEN';

if (isMainThread && !process.env[ENV_KEY]) {
  process.env[ENV_KEY] = randomBytes(32).toString('base64url');
}

export const INTERNAL_TOKEN_HEADER = 'x-internal-token';

export const getInternalToken = (): string => process.env[ENV_KEY] ?? '';

const sha256 = (s: string) => createHash('sha256').update(s).digest();

// Constant-time comparison against the boot token. False when either side is empty
// (e.g. a worker that somehow lost the inherited env) so a blank never matches.
export function matchesInternalToken(candidate: string | undefined): boolean {
  const expected = getInternalToken();
  if (!candidate || !expected) return false;
  return timingSafeEqual(sha256(candidate), sha256(expected));
}
