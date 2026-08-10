import http from 'http';
import { createHmac } from 'crypto';
import { basename } from 'path';
import { WhatsAppClient, type InboundMessage } from './whatsapp.js';

const WORKFLOW_ENGINE_URL = process.env.WORKFLOW_ENGINE_URL ?? 'http://app:3001';
const WEBHOOK_SECRET      = process.env.WEBHOOK_SECRET ?? '';
const ALLOW_FROM          = process.env.ALLOW_FROM ? process.env.ALLOW_FROM.split(',').map((s) => s.trim()) : [];

function sign(body: string): string {
  return 'sha256=' + createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex');
}

// 'fired'      — a run was triggered
// 'no-trigger' — no active webhook rule for this path (engine 404)
// 'no-match'   — a rule exists but its filter rejected the payload (engine 422)
// 'error'      — transient failure (engine unreachable / 5xx); don't tell the user "no rule"
type ForwardResult = 'fired' | 'no-trigger' | 'no-match' | 'error';

async function postToEngine(path: string, payload: Record<string, unknown>, label: string): Promise<ForwardResult> {
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (WEBHOOK_SECRET) headers['X-Webhook-Signature'] = sign(body);

  try {
    const resp = await fetch(`${WORKFLOW_ENGINE_URL}/webhooks/${path}`, { method: 'POST', headers, body });
    if (resp.ok) {
      const data = await resp.json() as { runIds?: string[] };
      console.log(`▶ Fired run(s) ${(data.runIds ?? []).join(', ')} for ${label}`);
      return 'fired';
    } else if (resp.status === 404) {
      console.log(`No webhook trigger for ${label} — skipping`);
      return 'no-trigger';
    } else if (resp.status === 422) {
      console.log(`No filter matched payload for ${label} — skipping`);
      return 'no-match';
    } else {
      console.error(`Engine returned ${resp.status} for ${label}`);
      return 'error';
    }
  } catch (err) {
    console.error(`Failed to forward ${label} to engine:`, err);
    return 'error';
  }
}

async function forwardToEngine(msg: InboundMessage, wa: WhatsAppClient): Promise<void> {
  // Filter by allowed phone numbers if configured
  if (ALLOW_FROM.length > 0 && !ALLOW_FROM.includes(msg.pn)) {
    console.log(`Ignored message from ${msg.pn} (not in ALLOW_FROM)`);
    return;
  }

  const content = msg.content ?? '';

  if (content.startsWith('/')) {
    // Command-based routing: /voicelog → /webhooks/voicelog
    const parts   = content.trim().split(/\s+/);
    const command = parts[0].slice(1).toLowerCase();
    const args    = parts.slice(1).join(' ');
    const result  = await postToEngine(command, {
      sender: msg.sender, pn: msg.pn, content, command, args,
      media: msg.media ?? [], isAudio: msg.isAudio ?? false, timestamp: msg.timestamp,
    }, `command /${command} from ${msg.pn}`);

    // A command is explicit intent, so let the sender know when it matched no active rule.
    // (Stay silent on transient 'error' — that's a server problem, not a missing rule.)
    if (result === 'no-trigger' || result === 'no-match') {
      const reply = result === 'no-trigger'
        ? `⚠️ I don't have a rule set up for "/${command}", so your message wasn't processed.`
        : `⚠️ "/${command}" didn't match any active rule for this kind of message.`;
      try {
        await wa.sendMessage(msg.sender, reply);
      } catch (err) {
        console.error(`Failed to send no-match notice to ${msg.pn}:`, err);
      }
    }
    return;
  }

  // Non-command messages with media (e.g. voice notes) → fallback path for filter-based routing
  if ((msg.media ?? []).length > 0 || msg.isAudio) {
    const mediaPaths = msg.media ?? [];
    const mediaUrls  = mediaPaths.map((p) => `${WORKFLOW_ENGINE_URL}/media/${basename(p)}`);
    await postToEngine('whatsapp-fallback', {
      sender: msg.sender, pn: msg.pn, content,
      media: mediaPaths, mediaUrls, isAudio: msg.isAudio ?? false, timestamp: msg.timestamp,
    }, `fallback from ${msg.pn}`);
  }
}

function startSendServer(port: number, wa: WhatsAppClient): http.Server {
  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: true }));
      return;
    }

    if (req.method !== 'POST' || req.url !== '/send') {
      res.writeHead(404).end('Not found');
      return;
    }

    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const { to, text, imageUrl, caption } = JSON.parse(body) as { to: string; text?: string; imageUrl?: string; caption?: string };
        if (!to || (!text && !imageUrl)) { res.writeHead(400).end('to and either text or imageUrl are required'); return; }
        if (imageUrl) {
          await wa.sendImageMessage(to, imageUrl, caption ?? '');
        } else {
          await wa.sendMessage(to, text!);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: true }));
      } catch (err) {
        console.error('[bridge/send] error:', err);
        res.writeHead(500).end(String(err));
      }
    });
  });

  server.listen(port, '0.0.0.0', () => {
    console.log(`📤 Send API listening on http://0.0.0.0:${port}/send`);
  });

  return server;
}

export class BridgeServer {
  private wa: WhatsAppClient | null = null;
  private httpServer: http.Server | null = null;

  constructor(
    private authDir: string,
    private sendPort: number,
  ) {}

  async start(): Promise<void> {
    this.wa = new WhatsAppClient({
      authDir: this.authDir,
      onMessage: (msg) => { if (this.wa) void forwardToEngine(msg, this.wa); },
      onQR:     (qr)  => { void qr; /* already printed to terminal by WhatsAppClient */ },
      onStatus: (s)   => { console.log(`WhatsApp status: ${s}`); },
    });

    this.httpServer = startSendServer(this.sendPort, this.wa);
    await this.wa.connect();
  }

  async stop(): Promise<void> {
    this.httpServer?.close();
    if (this.wa) {
      await this.wa.disconnect();
      this.wa = null;
    }
  }
}
