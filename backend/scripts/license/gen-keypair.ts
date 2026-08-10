/**
 * Vendor tool — generate the Ed25519 signing keypair for premium licenses.
 *
 *   npm run license:keygen
 *
 * Writes the PRIVATE key to ./data/license-signing.private.pem (gitignored; keep it
 * secret — whoever holds it can mint licenses) and prints the PUBLIC key. Paste the
 * public key into backend/src/license/publicKey.ts so the build can verify tokens.
 *
 * This is NOT part of the shipped enforcement path; it never runs in production.
 */
import { generateKeyPairSync } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const OUT_DIR = path.resolve(process.env.DATA_DIR ?? './data');
const PRIV_PATH = path.join(OUT_DIR, 'license-signing.private.pem');

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const privPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
const pubPem = publicKey.export({ type: 'spki', format: 'pem' }) as string;

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(PRIV_PATH, privPem, { encoding: 'utf8', mode: 0o600 });

console.log(`Private key written to ${PRIV_PATH} (keep secret, never commit).\n`);
console.log('Public key — paste into backend/src/license/publicKey.ts:\n');
console.log(pubPem);
