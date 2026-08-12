import { createHash, randomBytes } from 'crypto';
import {
  insertSession, getSession, touchSession, deleteSession, deleteExpiredSessions,
  getUserById,
} from './store';

// Opaque, server-side, revocable sessions. The client only ever holds a random
// token (in an httpOnly cookie); the DB stores only its SHA-256, so a DB read can
// never recover a live session token. Sessions slide: activity within the TTL
// extends expiry, bounded to one write per RENEW_INTERVAL_MS to avoid a write per
// request.

const TOKEN_BYTES = 32;
const RENEW_INTERVAL_MS = 15 * 60 * 1000;

export interface SessionUser {
  id: string;
  username: string;
  role: string;
}

export interface ResolvedSession {
  user: SessionUser;
  // Set to the new absolute expiry (ms epoch) when this resolve slid the session
  // forward, so the caller can refresh the cookie's Max-Age to match. null when no
  // renewal happened this call (renewal is throttled to one write per interval).
  refreshedExpiresAt: number | null;
}

const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

// Create a session for userId. Returns the raw token to set as a cookie (never
// stored) and the absolute expiry (ms epoch) for the cookie Max-Age.
export function createSession(userId: string, ttlMs: number): { token: string; expiresAt: number } {
  const token = randomBytes(TOKEN_BYTES).toString('base64url');
  const expiresAt = Date.now() + ttlMs;
  insertSession(hashToken(token), userId, expiresAt);
  return { token, expiresAt };
}

// Resolve a raw token to its user, or null if unknown/expired. Applies sliding
// renewal (throttled to one write per RENEW_INTERVAL_MS) as a side effect, and
// reports the new expiry when it renews so the caller can refresh the cookie.
// Expired rows are deleted lazily on hit.
export function resolveSession(token: string, ttlMs: number): ResolvedSession | null {
  if (!token) return null;
  const tokenHash = hashToken(token);
  const row = getSession(tokenHash);
  if (!row) return null;

  const now = Date.now();
  if (row.expires_at <= now) {
    deleteSession(tokenHash);
    return null;
  }

  const user = getUserById(row.user_id);
  if (!user) {
    // Orphaned session (user removed) — clean up and reject.
    deleteSession(tokenHash);
    return null;
  }

  let refreshedExpiresAt: number | null = null;
  if (now - row.last_seen > RENEW_INTERVAL_MS) {
    refreshedExpiresAt = now + ttlMs;
    touchSession(tokenHash, refreshedExpiresAt);
  }

  return { user: { id: user.id, username: user.username, role: user.role }, refreshedExpiresAt };
}

export function destroySession(token: string): void {
  if (token) deleteSession(hashToken(token));
}

// Delete rows past their expiry. Hung off the existing periodic cleanup in
// server.ts; returns the number removed for logging.
export function pruneExpiredSessions(): number {
  return deleteExpiredSessions();
}
