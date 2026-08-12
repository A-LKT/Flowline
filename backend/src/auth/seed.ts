import type { AuthConfig } from './config';
import { getUserById, upsertUser, deleteSessionsForUser } from './store';

// Reconcile the single config-seeded user into the DB at boot. Config is
// authoritative: the row is created if missing and rewritten whenever the
// credential (username or password) has changed since the last boot. On a real
// change we also revoke every existing session for that user, so a password
// rotation in the deploy config actually takes effect immediately. A plain
// restart with the same credential preserves sessions (via config.credentialMatches).
export function reconcileConfigUser(config: AuthConfig): void {
  const existing = getUserById(config.userId);

  const changed = !existing
    || existing.username !== config.username
    || !config.credentialMatches(existing.password_hash);

  if (!changed) return;

  upsertUser({
    id: config.userId,
    username: config.username,
    passwordHash: config.passwordHash,
    role: existing?.role ?? 'owner',
  });

  if (existing) deleteSessionsForUser(config.userId);
}
