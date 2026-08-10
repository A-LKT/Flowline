import { ImapFlow } from 'imapflow';
import * as db from '../db';
import { fireWorkflowRun } from '../runner/fire';
import { loadSecrets } from '../runner/secrets';
import type { TriggerAdapter } from './adapter';
import type { Trigger, EmailConfig } from '../types';

type ActiveSession = {
  stopped: boolean;
  client: ImapFlow | null;
};

const sessions = new Map<string, ActiveSession>();

function resolveSecret(value: string): string {
  if (value.startsWith('$')) {
    const secrets = loadSecrets();
    return secrets[value.slice(1)] ?? value;
  }
  return value;
}

async function processUnseen(client: ImapFlow, triggerId: string, cfg: EmailConfig): Promise<void> {
  const result = await client.search({ seen: false }, { uid: true });
  const uids = Array.isArray(result) ? result : [];
  if (uids.length === 0) return;

  for (const uid of uids) {
    const session = sessions.get(triggerId);
    if (!session || session.stopped) break;

    const t = db.getTrigger(triggerId);
    if (!t || !t.enabled) break;

    const msg = await client.fetchOne(
      String(uid),
      { envelope: true, source: { start: 0, maxLength: 16384 } },
      { uid: true },
    );
    if (!msg) continue;

    const fromAddr = msg.envelope?.from?.[0]?.address ?? '';
    const subject  = msg.envelope?.subject ?? '';

    if (cfg.fromFilter    && !fromAddr.includes(cfg.fromFilter))  continue;
    if (cfg.subjectFilter && !subject.includes(cfg.subjectFilter)) continue;

    if (cfg.markSeen !== false) {
      await client.messageFlagsAdd({ uid: uid as unknown as string }, ['\\Seen'], { uid: true });
    }

    const payload = {
      from:      msg.envelope?.from?.map((a) => a.address).filter(Boolean),
      to:        msg.envelope?.to?.map((a) => a.address).filter(Boolean),
      subject,
      date:      msg.envelope?.date?.toISOString(),
      messageId: msg.envelope?.messageId,
      bodyRaw:   msg.source?.toString('utf8'),
    };

    if (t.target.type === 'workflow') {
      fireWorkflowRun(t.target.id, payload, 'email', t.id);
    }
  }
}

async function runSession(triggerId: string): Promise<void> {
  const session = sessions.get(triggerId);
  if (!session || session.stopped) return;

  const trigger = db.getTrigger(triggerId);
  if (!trigger || !trigger.enabled) return;

  const cfg = trigger.config as EmailConfig;
  const password = resolveSecret(cfg.password);

  const client = new ImapFlow({
    host:   cfg.host,
    port:   cfg.port,
    secure: cfg.tls,
    auth:   { user: cfg.user, pass: password },
    logger: false,
  });

  session.client = client;

  try {
    await client.connect();
    const lock = await client.getMailboxLock(cfg.folder ?? 'INBOX');
    try {
      await processUnseen(client, triggerId, cfg);
    } finally {
      lock.release();
    }

    // After initial sweep, listen for new messages via IDLE.
    // client.idle() resolves when the server signals a change (EXISTS/EXPUNGE)
    // or when the connection is closed.
    while (session && !session.stopped) {
      await client.idle();

      if (session.stopped) break;

      const lock2 = await client.getMailboxLock(cfg.folder ?? 'INBOX');
      try {
        await processUnseen(client, triggerId, cfg);
      } finally {
        lock2.release();
      }
    }
  } catch (err) {
    console.error(`[email-trigger:${triggerId}] connection error:`, err);
  } finally {
    session.client = null;
    try { await client.logout(); } catch { try { client.close(); } catch { /* ignore */ } }
  }

  // Reconnect unless explicitly stopped
  const current = sessions.get(triggerId);
  if (current && !current.stopped) {
    setTimeout(() => void runSession(triggerId), 15_000);
  }
}

export const emailAdapter: TriggerAdapter = {
  start(trigger: Trigger) {
    this.stop(trigger.id);
    const session: ActiveSession = { stopped: false, client: null };
    sessions.set(trigger.id, session);
    void runSession(trigger.id);
  },

  stop(id: string) {
    const session = sessions.get(id);
    if (!session) return;
    session.stopped = true;
    if (session.client) {
      try { session.client.close(); } catch { /* ignore */ }
    }
    sessions.delete(id);
  },
};
