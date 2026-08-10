import * as db from '../db';
import { decrypt, isVaultKeySet } from '../crypto';

export function loadSecrets(): Record<string, string> {
  if (!isVaultKeySet()) return {};
  const secrets: Record<string, string> = {};
  for (const row of db.getAllSecretsEncrypted()) {
    try { secrets[row.name] = decrypt(row.encrypted_value); } catch { /* skip unreadable */ }
  }
  return secrets;
}
