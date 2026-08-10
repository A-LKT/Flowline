/**
 * WhatsApp client wrapper using Baileys.
 * Based on OpenClaw's working implementation.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  downloadMediaMessage,
  extractMessageContent as baileysExtractMessageContent,
} from '@whiskeysockets/baileys';

import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';
import pino from 'pino';
import { writeFile, mkdir, readdir, unlink } from 'fs/promises';
import { join } from 'path';
import { randomBytes } from 'crypto';

const VERSION = '0.1.0';

export interface InboundMessage {
  id: string;
  sender: string;
  pn: string;
  content: string;
  timestamp: number;
  isGroup: boolean;
  media?: string[];
  isAudio?: boolean;
}

export interface WhatsAppClientOptions {
  authDir: string;
  onMessage: (msg: InboundMessage) => void;
  onQR: (qr: string) => void;
  onStatus: (status: string) => void;
}

export class WhatsAppClient {
  private sock: any = null;
  private options: WhatsAppClientOptions;
  private reconnecting = false;

  constructor(options: WhatsAppClientOptions) {
    this.options = options;
  }

  async connect(): Promise<void> {
    const logger = pino({ level: 'silent' });
    const { state, saveCreds } = await useMultiFileAuthState(this.options.authDir);
    const { version } = await fetchLatestBaileysVersion();

    console.log(`Using Baileys version: ${version.join('.')}`);

    // Create socket following OpenClaw's pattern
    this.sock = makeWASocket({
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      version,
      logger,
      printQRInTerminal: false,
      browser: ['workflow-bridge', 'cli', VERSION],
      syncFullHistory: false,
      markOnlineOnConnect: false,
    });

    // Handle WebSocket errors
    if (this.sock.ws && typeof this.sock.ws.on === 'function') {
      this.sock.ws.on('error', (err: Error) => {
        console.error('WebSocket error:', err.message);
      });
    }

    // Handle connection updates
    this.sock.ev.on('connection.update', async (update: any) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        // Display QR code in terminal
        console.log('\n📱 Scan this QR code with WhatsApp (Linked Devices):\n');
        qrcode.generate(qr, { small: true });
        this.options.onQR(qr);
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;

        console.log(`Connection closed. Status: ${statusCode}, Will reconnect: ${!loggedOut || 'after clearing auth'}`);
        this.options.onStatus('disconnected');

        if (!this.reconnecting) {
          this.reconnecting = true;
          if (loggedOut) {
            console.log('Session logged out — clearing auth and requesting new QR...');
            await this.clearAuthDir();
          } else {
            console.log('Reconnecting in 5 seconds...');
          }
          setTimeout(() => {
            this.reconnecting = false;
            this.connect();
          }, 5000);
        }
      } else if (connection === 'open') {
        console.log('✅ Connected to WhatsApp');
        this.options.onStatus('connected');
      }
    });

    // Save credentials on update
    this.sock.ev.on('creds.update', saveCreds);

    // Handle incoming messages
    // 'notify' = real-time; 'append' = offline/pending messages delivered on reconnect
    const startupTime = Math.floor(Date.now() / 1000);
    this.sock.ev.on('messages.upsert', async ({ messages, type }: { messages: any[]; type: string }) => {
      if (type !== 'notify' && type !== 'append') return;

      for (const msg of messages) {
        // For 'append' (catch-up), skip messages older than 24 hours to avoid replaying full history
        if (type === 'append') {
          const ts = (typeof msg.messageTimestamp === 'object'
            ? msg.messageTimestamp?.low
            : msg.messageTimestamp) ?? 0;
          if (ts < startupTime - 86400) continue;
        }
        if (msg.key.fromMe) continue;
        if (msg.key.remoteJid === 'status@broadcast') continue;

        const unwrapped = baileysExtractMessageContent(msg.message);
        if (!unwrapped) continue;

        const content = this.getTextContent(unwrapped);
        let fallbackContent: string | null = null;
        const mediaPaths: string[] = [];
        let isAudio = false;

        if (unwrapped.imageMessage) {
          fallbackContent = '[Image]';
          const path = await this.downloadMedia(msg, unwrapped.imageMessage.mimetype ?? undefined);
          if (path) mediaPaths.push(path);
        } else if (unwrapped.documentMessage) {
          const docMime = unwrapped.documentMessage.mimetype ?? '';
          if (docMime.startsWith('audio/')) {
            fallbackContent = '[Voice Message]';
            isAudio = true;
          } else {
            fallbackContent = '[Document]';
          }
          const path = await this.downloadMedia(msg, unwrapped.documentMessage.mimetype ?? undefined,
            unwrapped.documentMessage.fileName ?? undefined);
          if (path) mediaPaths.push(path);
        } else if (unwrapped.videoMessage) {
          fallbackContent = '[Video]';
          const path = await this.downloadMedia(msg, unwrapped.videoMessage.mimetype ?? undefined);
          if (path) mediaPaths.push(path);
        } else if (unwrapped.audioMessage) {
          fallbackContent = '[Voice Message]';
          isAudio = true;
          const path = await this.downloadMedia(msg, unwrapped.audioMessage.mimetype ?? 'audio/ogg');
          if (path) mediaPaths.push(path);
        }

        const finalContent = content || (mediaPaths.length === 0 ? fallbackContent : '') || '';
        if (!finalContent && mediaPaths.length === 0) continue;

        const isGroup = msg.key.remoteJid?.endsWith('@g.us') || false;

        this.options.onMessage({
          id: msg.key.id || '',
          sender: msg.key.remoteJid || '',
          pn: (msg.key.remoteJid || '').replace(/@.*$/, ''),
          content: finalContent,
          timestamp: msg.messageTimestamp as number,
          isGroup,
          ...(mediaPaths.length > 0 ? { media: mediaPaths } : {}),
          ...(isAudio ? { isAudio: true } : {}),
        });

        await this.sock.readMessages([msg.key]);
      }
    });
  }

  private async downloadMedia(msg: any, mimetype?: string, fileName?: string): Promise<string | null> {
    try {
      const mediaDir = join(this.options.authDir, '..', 'media');
      await mkdir(mediaDir, { recursive: true });

      const buffer = await downloadMediaMessage(msg, 'buffer', {}) as Buffer;

      let outFilename: string;
      if (fileName) {
        const prefix = `wa_${Date.now()}_${randomBytes(4).toString('hex')}_`;
        outFilename = prefix + fileName;
      } else {
        const mime = mimetype || 'application/octet-stream';
        const ext = '.' + (mime.split('/').pop()?.split(';')[0] || 'bin');
        outFilename = `wa_${Date.now()}_${randomBytes(4).toString('hex')}${ext}`;
      }

      const filepath = join(mediaDir, outFilename);
      await writeFile(filepath, buffer);

      return filepath;
    } catch (err) {
      console.error('Failed to download media:', err);
      return null;
    }
  }

  private getTextContent(message: any): string | null {
    if (message.conversation) return message.conversation;
    if (message.extendedTextMessage?.text) return message.extendedTextMessage.text;
    if (message.imageMessage) return message.imageMessage.caption || '';
    if (message.videoMessage) return message.videoMessage.caption || '';
    if (message.documentMessage) return message.documentMessage.caption || '';
    if (message.audioMessage) return '[Voice Message]';
    return null;
  }

  async sendMessage(to: string, text: string): Promise<void> {
    if (!this.sock) throw new Error('Not connected');
    await this.sock.sendMessage(to, { text });
  }

  async sendImageMessage(to: string, imageUrl: string, caption: string): Promise<void> {
    if (!this.sock) throw new Error('Not connected');

    const resp = await fetch(imageUrl);
    if (!resp.ok) throw new Error(`Failed to fetch image: HTTP ${resp.status} ${imageUrl}`);

    const buffer = Buffer.from(await resp.arrayBuffer());
    if (buffer.length === 0) throw new Error(`Image at ${imageUrl} is 0 bytes`);

    await this.sock.sendMessage(to, { image: buffer, caption });
  }

  private async clearAuthDir(): Promise<void> {
    try {
      const files = await readdir(this.options.authDir);
      await Promise.all(files.map(f => unlink(join(this.options.authDir, f))));
      console.log(`Cleared ${files.length} auth file(s)`);
    } catch (err) {
      console.error('Failed to clear auth dir:', err);
    }
  }

  async disconnect(): Promise<void> {
    if (this.sock) {
      this.sock.end(undefined);
      this.sock = null;
    }
  }
}
