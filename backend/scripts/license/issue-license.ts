/**
 * Vendor tool — sign a premium license token.
 *
 *   npm run license:issue -- --customer "Acme Corp" --instance inst_xxxx \
 *      --features assistant,housekeeping,artifactHistory,multiTenant --days 365
 *
 * Flags:
 *   --customer <name>     required. Human label recorded in the token.
 *   --instance <id>       bind to a specific install id (from ./data/instance-id on
 *                         the customer's machine, or the GET /api/edition response).
 *                         Omit or pass "any" for an UNBOUND dev/eval license.
 *   --features <csv>      subset of assistant,housekeeping,artifactHistory,multiTenant
 *                         (default: all four).
 *   --days <n>            validity in days (default 365).
 *   --key <path>          private key PEM (default ./data/license-signing.private.pem).
 *
 * Prints the token — hand it to the customer, who sets FLOWLINE_LICENSE_KEY or drops
 * it in ./data/license.key.
 */
import { createPrivateKey, randomUUID, sign as edSign } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { LicenseFeature, LicensePayload } from '../../src/license/verify';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const ALL: LicenseFeature[] = ['assistant', 'housekeeping', 'artifactHistory', 'multiTenant'];

const customer = arg('customer');
if (!customer) {
  console.error('Error: --customer is required.');
  process.exit(1);
}

const instanceArg = arg('instance');
const instanceId = !instanceArg || instanceArg === 'any' ? null : instanceArg;

const featuresArg = arg('features');
const features = featuresArg
  ? (featuresArg.split(',').map((s) => s.trim()).filter((s): s is LicenseFeature => ALL.includes(s as LicenseFeature)))
  : ALL;

const days = Number(arg('days') ?? 365);
const now = Math.floor(Date.now() / 1000);

const keyPath = arg('key')
  ? path.resolve(arg('key')!)
  : path.join(path.resolve(process.env.DATA_DIR ?? './data'), 'license-signing.private.pem');

let privPem: string;
try {
  privPem = fs.readFileSync(keyPath, 'utf8');
} catch {
  console.error(`Error: cannot read private key at ${keyPath}. Run "npm run license:keygen" first.`);
  process.exit(1);
}

const payload: LicensePayload = {
  v: 1,
  licenseId: `lic_${randomUUID()}`,
  customer,
  features,
  instanceId,
  issuedAt: now,
  expiresAt: now + days * 86400,
};

const payloadBytes = Buffer.from(JSON.stringify(payload), 'utf8');
const sig = edSign(null, payloadBytes, createPrivateKey(privPem));
const token = `${payloadBytes.toString('base64url')}.${sig.toString('base64url')}`;

console.error(`Issued ${payload.licenseId} for "${customer}"`);
console.error(`  features:  ${features.join(', ')}`);
console.error(`  instance:  ${instanceId ?? '(unbound — dev/eval)'}`);
console.error(`  expires:   ${new Date(payload.expiresAt * 1000).toISOString()} (${days}d)\n`);
console.log(token);
