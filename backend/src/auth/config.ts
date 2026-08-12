import { hashPassword, looksHashed, verifyPassword } from './password';

// Static, deploy-time credential for the single free-tier user. Resolved once at
// boot from the environment (config file / docker-compose env / .env). There is
// deliberately no "open" mode: with no credential configured the server refuses
// to start (fail-closed) — see resolveAuthConfig throwing below.
//
// Multi-tenant premium never calls this; it manages users in the DB directly.
// The fixed id keeps sessions.user_id valid even if AUTH_USERNAME is renamed.

export const LOCAL_USER_ID = 'local';

export interface AuthConfig {
  userId: string;
  username: string;
  /** Fully hashed password (scrypt$…), ready to store. */
  passwordHash: string;
  /** Session lifetime in milliseconds. */
  sessionTtlMs: number;
  /** Whether the session cookie carries the Secure attribute. */
  cookieSecure: boolean;
  /** Cookie SameSite policy — 'none' for cross-origin (CORS_ORIGIN set), else 'lax'. */
  cookieSameSite: 'lax' | 'none';
  /**
   * True when `storedHash` (a previously persisted hash) still represents the
   * current config credential. Lets boot reconciliation tell a genuine password
   * rotation from a plain restart, so restarting doesn't needlessly revoke
   * sessions. For a plaintext AUTH_PASSWORD this verifies against the stored
   * salted hash (which is re-salted every boot, so string comparison can't work);
   * for a precomputed AUTH_PASSWORD_HASH it compares the hash string.
   */
  credentialMatches(storedHash: string): boolean;
}

export class AuthConfigError extends Error {}

const DEFAULT_TTL_HOURS = 24 * 7; // 7 days

function parseBool(v: string | undefined, fallback: boolean): boolean {
  if (v == null || v === '') return fallback;
  return /^(1|true|yes|on)$/i.test(v.trim());
}

// Resolve the auth configuration from the environment. Throws AuthConfigError with
// an operator-actionable message when no password source is configured — the caller
// (index.ts) reports it and exits, so an instance can never come up unauthenticated.
export function resolveAuthConfig(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  const username = (env.AUTH_USERNAME?.trim() || 'admin');

  const rawHash = env.AUTH_PASSWORD_HASH?.trim();
  const rawPlain = env.AUTH_PASSWORD;

  let passwordHash: string;
  let credentialMatches: (storedHash: string) => boolean;
  if (rawHash) {
    if (!looksHashed(rawHash)) {
      throw new AuthConfigError(
        'AUTH_PASSWORD_HASH is set but is not a valid scrypt hash. Generate one with `npm run auth:hash-password` (in backend/), or set AUTH_PASSWORD to a plaintext password instead.',
      );
    }
    passwordHash = rawHash;
    credentialMatches = (storedHash) => storedHash === rawHash;
  } else if (rawPlain != null && rawPlain !== '') {
    passwordHash = hashPassword(rawPlain);
    credentialMatches = (storedHash) => verifyPassword(rawPlain, storedHash);
  } else {
    throw new AuthConfigError(
      'No login credential configured. Set AUTH_PASSWORD (a plaintext password) or AUTH_PASSWORD_HASH (from `npm run auth:hash-password`) in the environment. AUTH_USERNAME is optional (defaults to "admin"). The server will not start without one — Flowline is never accessible unauthenticated.',
    );
  }

  const ttlHours = Number(env.AUTH_SESSION_TTL_HOURS ?? '');
  const sessionTtlMs = (Number.isFinite(ttlHours) && ttlHours > 0 ? ttlHours : DEFAULT_TTL_HOURS) * 60 * 60 * 1000;

  const corsOrigin = env.CORS_ORIGIN?.trim();
  const cookieSameSite: 'lax' | 'none' = corsOrigin ? 'none' : 'lax';
  // SameSite=None requires Secure per the spec, so cross-origin implies Secure.
  // Otherwise default to Secure in production; override with AUTH_COOKIE_SECURE.
  const cookieSecure = cookieSameSite === 'none'
    ? true
    : parseBool(env.AUTH_COOKIE_SECURE, env.NODE_ENV === 'production');

  return {
    userId: LOCAL_USER_ID,
    username,
    passwordHash,
    sessionTtlMs,
    cookieSecure,
    cookieSameSite,
    credentialMatches,
  };
}

// True when the operator handed us a plaintext password (hashed at boot). Used only
// to decide whether to emit the startup warning; a precomputed hash is quieter.
export function usesPlaintextPassword(env: NodeJS.ProcessEnv = process.env): boolean {
  return !env.AUTH_PASSWORD_HASH?.trim() && env.AUTH_PASSWORD != null && env.AUTH_PASSWORD !== '';
}
