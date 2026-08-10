// Polyfill crypto for Baileys in ESM
import { webcrypto } from 'crypto';
if (!globalThis.crypto) {
  (globalThis as unknown as Record<string, unknown>).crypto = webcrypto;
}

import { BridgeServer } from './server.js';
import { homedir } from 'os';
import { join } from 'path';

const AUTH_DIR   = process.env.AUTH_DIR   ?? join(homedir(), '.whatsapp-bridge', 'auth');
const SEND_PORT  = parseInt(process.env.SEND_PORT ?? '3002', 10);

console.log('🌉 Workflow WhatsApp Bridge');
console.log('==========================\n');
console.log(`Auth dir:  ${AUTH_DIR}`);
console.log(`Send port: ${SEND_PORT}`);
console.log('');

const server = new BridgeServer(AUTH_DIR, SEND_PORT);

process.on('SIGINT',  async () => { await server.stop(); process.exit(0); });
process.on('SIGTERM', async () => { await server.stop(); process.exit(0); });

server.start().catch((err) => {
  console.error('Failed to start bridge:', err);
  process.exit(1);
});
