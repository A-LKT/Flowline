// In-memory login throttle: a per-source escalating *delay* on repeated failures.
// Sufficient for a single-user instance (no shared state, no new dependency).
//
// Why a delay and not a hard lockout: behind a reverse proxy Fastify sees the
// proxy's IP for every request unless TRUST_PROXY is set, so all logins can share
// one bucket. A hard lockout would let an unauthenticated scanner lock the sole
// owner out indefinitely. A capped delay slows brute force to a crawl while the
// legitimate user — who sends the correct password — always still gets in, just
// after a short wait. State is process-local and cleared on restart.

interface Entry {
  fails: number;
  lastActivity: number;
}

const FREE_ATTEMPTS = 3;         // no delay for the first few failures
const STEP_MS = 500;             // added delay per failure past the free ones
const MAX_DELAY_MS = 5_000;      // cap so the real owner is never locked out
const STALE_MS = 60 * 60_000;    // forget idle sources after this
const MAX_ENTRIES = 10_000;      // bound memory

const entries = new Map<string, Entry>();

function sweep(now: number): void {
  for (const [ip, e] of entries) {
    if (now - e.lastActivity > STALE_MS) entries.delete(ip);
  }
}

// How long to wait before processing the next attempt from this source, based on
// its recent failures. Never rejects outright — the correct password still works.
export function failureDelayMs(ip: string, now: number = Date.now()): number {
  const e = entries.get(ip);
  if (!e || now - e.lastActivity > STALE_MS) return 0;
  const over = e.fails - FREE_ATTEMPTS;
  if (over <= 0) return 0;
  return Math.min(over * STEP_MS, MAX_DELAY_MS);
}

export function recordFailure(ip: string, now: number = Date.now()): void {
  if (entries.size >= MAX_ENTRIES) sweep(now);
  let e = entries.get(ip);
  if (!e || now - e.lastActivity > STALE_MS) {
    e = { fails: 0, lastActivity: now };
    entries.set(ip, e);
  }
  e.fails += 1;
  e.lastActivity = now;
}

export function recordSuccess(ip: string): void {
  entries.delete(ip);
}

// Test hook — clears all throttle state.
export function resetThrottle(): void {
  entries.clear();
}
