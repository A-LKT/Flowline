// Edition gating. Premium features (LLM assistant, housekeeping, artifact history,
// multi-tenant) unlock only when a valid, signed license is present — see
// license/verify.ts and PREMIUM-LICENSING.md. There is deliberately no env-flag
// bypass: the old `EDITION=premium` shortcut is gone. Absent or invalid license =
// free single-tenant build. Premium code ships in-tree but stays inert unless licensed.
import fs from 'node:fs';
import path from 'node:path';
import { isMainThread } from 'node:worker_threads';
import { getInstanceId } from './license/instanceId';
import { LICENSE_PUBLIC_KEY_PEM } from './license/publicKey';
import { verifyLicense, type LicenseFeature } from './license/verify';

export type Edition = 'free' | 'premium';

export type Features = Record<LicenseFeature, boolean>;

function readToken(): string | undefined {
  const fromEnv = process.env.FLOWLINE_LICENSE_KEY?.trim();
  if (fromEnv) return fromEnv;
  const filePath = path.resolve(process.env.DATA_DIR ?? './data', 'license.key');
  try {
    const fromFile = fs.readFileSync(filePath, 'utf8').trim();
    if (fromFile) return fromFile;
  } catch {
    /* no license file — free edition */
  }
  return undefined;
}

const FREE_FEATURES: Features = { assistant: false, housekeeping: false, artifactHistory: false, multiTenant: false };

function resolve(): { edition: Edition; features: Features; licenseInfo: LicenseInfo } {
  const token = readToken();
  if (!token) return { edition: 'free', features: { ...FREE_FEATURES }, licenseInfo: null };

  const result = verifyLicense(token, LICENSE_PUBLIC_KEY_PEM, { instanceId: getInstanceId() });
  if (!result.valid) {
    // Only the main process logs — worker threads re-run this at import and would
    // otherwise repeat the line once per worker in the pool.
    if (isMainThread) console.warn(`[license] premium disabled: ${result.reason}`);
    return { edition: 'free', features: { ...FREE_FEATURES }, licenseInfo: null };
  }

  const features: Features = { ...FREE_FEATURES };
  for (const f of result.features) features[f] = true;
  if (isMainThread) console.info(`[license] premium enabled for "${result.customer}" — features: ${result.features.join(', ') || '(none)'}, expires ${new Date(result.expiresAt * 1000).toISOString()}`);
  return {
    edition: 'premium',
    features,
    licenseInfo: { customer: result.customer, expiresAt: result.expiresAt, features: result.features },
  };
}

export interface LicenseInfoData { customer: string; expiresAt: number; features: LicenseFeature[] }
export type LicenseInfo = LicenseInfoData | null;

const resolved = resolve();

export const EDITION: Edition = resolved.edition;
export const isPremium = EDITION === 'premium';
export const features: Features = resolved.features;
export const licenseInfo: LicenseInfo = resolved.licenseInfo;
