import assert from 'node:assert/strict';
import { generateKeyPairSync, sign as edSign, type KeyObject } from 'node:crypto';
import { test } from 'node:test';
import { verifyLicense, type LicensePayload } from '../verify';

// Ephemeral keypair for the whole suite — never touches the bundled key.
const { publicKey, privateKey } = generateKeyPairSync('ed25519');

const INSTANCE = 'inst_test-1111';
const NOW = 1_700_000_000; // fixed clock

function makeToken(overrides: Partial<LicensePayload> = {}, signWith: KeyObject = privateKey): string {
  const payload: LicensePayload = {
    v: 1,
    licenseId: 'lic_test',
    customer: 'Test Customer',
    features: ['assistant', 'housekeeping', 'artifactHistory', 'multiTenant'],
    instanceId: INSTANCE,
    issuedAt: NOW - 1000,
    expiresAt: NOW + 86_400,
    ...overrides,
  };
  const bytes = Buffer.from(JSON.stringify(payload), 'utf8');
  const sig = edSign(null, bytes, signWith);
  return `${bytes.toString('base64url')}.${sig.toString('base64url')}`;
}

const opts = { instanceId: INSTANCE, now: NOW };

test('a valid, bound, unexpired license unlocks premium features', () => {
  const r = verifyLicense(makeToken(), publicKey, opts);
  assert.equal(r.valid, true);
  if (r.valid) {
    assert.deepEqual(r.features.sort(), ['artifactHistory', 'assistant', 'housekeeping', 'multiTenant']);
    assert.equal(r.customer, 'Test Customer');
  }
});

test('a token signed by a DIFFERENT key is rejected', () => {
  const other = generateKeyPairSync('ed25519').privateKey;
  const r = verifyLicense(makeToken({}, other), publicKey, opts);
  assert.equal(r.valid, false);
  if (!r.valid) assert.equal(r.reason, 'invalid signature');
});

test('a tampered payload (flipped feature) fails the signature check', () => {
  const token = makeToken();
  const [payloadB64, sig] = token.split('.');
  const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as LicensePayload;
  payload.customer = 'Attacker'; // change a byte without re-signing
  const tampered = `${Buffer.from(JSON.stringify(payload)).toString('base64url')}.${sig}`;
  const r = verifyLicense(tampered, publicKey, opts);
  assert.equal(r.valid, false);
});

test('an expired license is rejected', () => {
  const r = verifyLicense(makeToken({ expiresAt: NOW - 1 }), publicKey, opts);
  assert.equal(r.valid, false);
  if (!r.valid) assert.equal(r.reason, 'license expired');
});

test('a license bound to another install is rejected on this install', () => {
  const r = verifyLicense(makeToken({ instanceId: 'inst_someone-else' }), publicKey, opts);
  assert.equal(r.valid, false);
  if (!r.valid) assert.equal(r.reason, 'license bound to a different install');
});

test('an UNBOUND (instanceId=null) license is accepted on any install', () => {
  const r = verifyLicense(makeToken({ instanceId: null }), publicKey, opts);
  assert.equal(r.valid, true);
});

test('a missing/empty token is treated as free, not an error', () => {
  assert.equal(verifyLicense(undefined, publicKey, opts).valid, false);
  assert.equal(verifyLicense('', publicKey, opts).valid, false);
  assert.equal(verifyLicense('garbage-no-dot', publicKey, opts).valid, false);
});

test('unknown feature names are dropped, not trusted', () => {
  const r = verifyLicense(makeToken({ features: ['assistant', 'root' as never] }), publicKey, opts);
  assert.equal(r.valid, true);
  if (r.valid) assert.deepEqual(r.features, ['assistant']);
});
