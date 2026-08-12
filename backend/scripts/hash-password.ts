/**
 * Operator tool — turn a plaintext password into an AUTH_PASSWORD_HASH value.
 *
 *   npm run auth:hash-password -- 'my-secret-password'
 *   npm run auth:hash-password                 # prompts on stdin (no echo)
 *
 * Copy the printed `scrypt$…` string into AUTH_PASSWORD_HASH in your .env /
 * docker-compose. Preferring the hash over a plaintext AUTH_PASSWORD keeps the
 * cleartext password out of your deploy config. See the auth section of DOCS.md.
 */
import { createInterface } from 'node:readline';
import { hashPassword } from '../src/auth/password';

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) {
    const rl = createInterface({ input: process.stdin, output: process.stderr });
    return new Promise((resolve) => rl.question('Password: ', (answer) => { rl.close(); resolve(answer); }));
  }
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/, '');
}

async function main(): Promise<void> {
  const arg = process.argv.slice(2).join(' ').trim();
  const password = arg || (await readStdin()).trim();
  if (!password) {
    console.error('No password provided. Pass it as an argument or pipe it on stdin.');
    process.exit(1);
  }
  process.stdout.write(hashPassword(password) + '\n');
}

void main();
