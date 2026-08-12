import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

// Password hashing with node's built-in scrypt — no external dependency, matching
// the "use crypto builtins" approach of crypto.ts. The stored form is
// self-describing so parameters can evolve without a migration:
//   scrypt$<N>$<r>$<p>$<saltHex>$<keyHex>
// Only the config-seeded user's hash is ever stored; see auth/seed.ts.

const N = 16384; // CPU/memory cost — ~tens of ms per hash, fine for a login endpoint
const R = 8;
const P = 1;
const KEYLEN = 32;
const SALT_BYTES = 16;

export function hashPassword(plain: string): string {
  const salt = randomBytes(SALT_BYTES);
  const key = scryptSync(plain, salt, KEYLEN, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString('hex')}$${key.toString('hex')}`;
}

// Constant-time verify. Returns false for any malformed/unknown hash rather than
// throwing, so a corrupt stored value can never bypass or crash the login path.
export function verifyPassword(plain: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, nStr, rStr, pStr, saltHex, keyHex] = parts;
  const n = Number(nStr), r = Number(rStr), p = Number(pStr);
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return false;
  let expected: Buffer;
  try {
    expected = Buffer.from(keyHex, 'hex');
    if (expected.length === 0) return false;
  } catch {
    return false;
  }
  let actual: Buffer;
  try {
    actual = scryptSync(plain, Buffer.from(saltHex, 'hex'), expected.length, { N: n, r, p });
  } catch {
    return false;
  }
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// True if the string looks like output of hashPassword (an operator-supplied
// AUTH_PASSWORD_HASH). Used by config resolution to tell a hash from a plaintext.
export function looksHashed(value: string): boolean {
  return value.startsWith('scrypt$') && value.split('$').length === 6;
}
