import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'crypto';

export const isVaultKeySet = (): boolean => !!process.env.VAULT_KEY;

function getKey(): Buffer {
  const k = process.env.VAULT_KEY;
  if (!k) throw new Error('VAULT_KEY is not set — secrets are unavailable');
  return createHash('sha256').update(k).digest();
}

export function encrypt(plaintext: string): string {
  const key    = getKey();
  const iv     = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc    = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag    = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

export function decrypt(stored: string): string {
  const key    = getKey();
  const parts  = stored.split(':');
  if (parts.length !== 3) throw new Error('Invalid encrypted secret format');
  const [ivHex, tagHex, encHex] = parts;
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  try {
    return Buffer.concat([
      decipher.update(Buffer.from(encHex, 'hex')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new Error('Failed to decrypt secret — VAULT_KEY may have changed');
  }
}
