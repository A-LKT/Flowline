import { createPublicKey, verify as edVerify, type KeyObject } from 'node:crypto';

// A license token is `base64url(payloadJSON) + "." + base64url(ed25519Signature)`.
// The signature covers the exact payload bytes. Verification is fully offline: it
// needs only the bundled public key (license/publicKey.ts). See PREMIUM-LICENSING.md.

export type LicenseFeature = 'assistant' | 'housekeeping' | 'artifactHistory' | 'multiTenant';

export interface LicensePayload {
  v: number;
  licenseId: string;
  customer: string;
  features: LicenseFeature[];
  /** Bound install id; null = unbound (dev/eval — still subject to expiry). */
  instanceId: string | null;
  issuedAt: number;   // unix seconds
  expiresAt: number;  // unix seconds
}

export type VerifyResult =
  | { valid: true; payload: LicensePayload; features: LicenseFeature[]; customer: string; expiresAt: number }
  | { valid: false; reason: string };

interface VerifyOptions {
  /** This install's id, to enforce a bound license. */
  instanceId: string;
  /** Override for tests; defaults to now. Unix seconds. */
  now?: number;
}

const ALL_FEATURES: LicenseFeature[] = ['assistant', 'housekeeping', 'artifactHistory', 'multiTenant'];

function toKeyObject(publicKey: string | KeyObject): KeyObject {
  return typeof publicKey === 'string' ? createPublicKey(publicKey) : publicKey;
}

/**
 * Verify a license token offline. Any failure — malformed, bad signature, expired,
 * or bound to a different install — returns `{ valid: false, reason }`. Never throws;
 * callers treat every non-valid result as "free edition".
 */
export function verifyLicense(
  token: string | undefined | null,
  publicKey: string | KeyObject,
  opts: VerifyOptions,
): VerifyResult {
  if (!token || typeof token !== 'string') return { valid: false, reason: 'no license present' };

  const dot = token.indexOf('.');
  if (dot <= 0 || dot === token.length - 1) return { valid: false, reason: 'malformed token' };

  const payloadB64 = token.slice(0, dot);
  const sigB64 = token.slice(dot + 1);

  let payloadBytes: Buffer;
  let sig: Buffer;
  try {
    payloadBytes = Buffer.from(payloadB64, 'base64url');
    sig = Buffer.from(sigB64, 'base64url');
  } catch {
    return { valid: false, reason: 'malformed token encoding' };
  }
  if (payloadBytes.length === 0 || sig.length === 0) return { valid: false, reason: 'malformed token' };

  // Signature first — reject anything not signed by our private key before trusting
  // a single field of the payload.
  let signatureOk = false;
  try {
    signatureOk = edVerify(null, payloadBytes, toKeyObject(publicKey), sig);
  } catch {
    return { valid: false, reason: 'signature check failed' };
  }
  if (!signatureOk) return { valid: false, reason: 'invalid signature' };

  let payload: LicensePayload;
  try {
    payload = JSON.parse(payloadBytes.toString('utf8')) as LicensePayload;
  } catch {
    return { valid: false, reason: 'unparseable payload' };
  }

  if (payload.v !== 1) return { valid: false, reason: `unsupported license version ${payload.v}` };

  const now = opts.now ?? Math.floor(Date.now() / 1000);
  if (typeof payload.expiresAt !== 'number' || payload.expiresAt <= now) {
    return { valid: false, reason: 'license expired' };
  }

  // Bound licenses must match this install. Unbound (null) licenses pass — they are
  // deliberately issued for dev/eval and are held in check by expiry alone.
  if (payload.instanceId !== null && payload.instanceId !== opts.instanceId) {
    return { valid: false, reason: 'license bound to a different install' };
  }

  const features = Array.isArray(payload.features)
    ? payload.features.filter((f): f is LicenseFeature => ALL_FEATURES.includes(f))
    : [];

  return { valid: true, payload, features, customer: payload.customer, expiresAt: payload.expiresAt };
}
