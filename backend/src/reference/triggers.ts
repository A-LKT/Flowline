/**
 * Trigger reference. Trigger configs are not declared as zod anywhere in the
 * engine (they are validated ad hoc), so the contracts are authored here from
 * the TriggerKind union + config types in ../types.ts. A test cross-checks this
 * list against TriggerKind so a newly added kind fails the build until it is
 * documented here.
 *
 * NOTE: the AI may PROPOSE a trigger (propose_artifact kind:"trigger"); a human
 * still applies it, and may also create one directly in the Triggers UI. This
 * reference gives the AI the correct config shape per kind and the target-workflow
 * binding rules (see markdown.ts's Triggers section for the propose guidance).
 */
import { z } from 'zod';

export type TriggerKindReference = {
  kind: string;
  description: string;
  configSchema: z.ZodTypeAny;
  /** Notes the AI should pass to the human when instructing trigger setup. */
  notes?: string;
};

export const TRIGGER_KINDS: TriggerKindReference[] = [
  {
    kind: 'schedule',
    description: 'Fires the target workflow on a cron schedule.',
    configSchema: z.object({
      cron: z.string().describe('Cron expression. 5 or 6 fields (optional leading seconds).'),
      timezone: z.string().optional().describe('IANA timezone, e.g. "Europe/Warsaw". Defaults to server tz.'),
      catchup: z.boolean().optional().describe('Run missed occurrences on startup. Default true.'),
    }),
    notes: 'Each cron tick fires one run. Runs are NOT serialized: if a run outlasts the interval, the next tick starts another in parallel (up to the worker pool size). For strict one-at-a-time processing, have the workflow itself take a lock (see controlFlow.concurrency).',
  },
  {
    kind: 'webhook',
    description: 'Fires the target workflow on an HTTP POST to /webhooks/:path.',
    configSchema: z.object({
      path: z.string().describe('URL path segment, e.g. "receipts" → POST /webhooks/receipts'),
      secret: z.string().optional().describe('If set, requests must carry a valid HMAC-SHA256 of the raw body ("sha256=<hex>") in the X-Webhook-Signature header (X-Hub-Signature-256 also accepted).'),
      filter: z.string().optional().describe('Optional JS expression on the payload; falsy = ignore the request.'),
    }),
    notes: 'The POSTed JSON body is exposed to the workflow as variables.trigger (i.e. {{trigger.field}}). Each POST fires one run, in parallel up to the pool size.',
  },
  {
    kind: 'file-watch',
    description: 'Fires the target workflow when files matching a pattern change in a watched directory.',
    configSchema: z.object({
      watchPath: z.string().describe('Directory to watch.'),
      pattern: z.string().optional().describe('Glob relative to watchPath, e.g. "*.csv".'),
      events: z.array(z.enum(['add', 'change', 'unlink'])).describe('Which filesystem events fire the workflow.'),
      debounceMs: z.number().optional().describe('Coalesce rapid events. Default 500ms.'),
    }),
    notes: 'The changed file path is provided on variables.trigger. One run per (debounced) event.',
  },
  {
    kind: 'email',
    description: 'Fires the target workflow when a new email arrives in a watched IMAP mailbox.',
    configSchema: z.object({
      host: z.string(),
      port: z.number(),
      tls: z.boolean(),
      user: z.string(),
      password: z.string().describe('Literal value, or $SECRET_NAME to read from the Secrets store.'),
      folder: z.string().optional().describe('Default "INBOX".'),
      markSeen: z.boolean().optional().describe('Default true.'),
      fromFilter: z.string().optional().describe('Substring match on sender address.'),
      subjectFilter: z.string().optional(),
    }),
    notes: 'The parsed email is provided on variables.trigger. Passwords should reference a Secret via $SECRET_NAME, never be hard-coded.',
  },
];

/**
 * Variables made available on `variables.trigger` for each trigger source.
 * The WhatsApp bridge posts to a webhook trigger, so its fields are documented
 * here as a specialization of the webhook payload.
 */
export const TRIGGER_VARIABLES = {
  webhook: {
    description: 'The POSTed JSON body, verbatim, under variables.trigger. Reference any field as {{trigger.yourField}}.',
  },
  whatsapp: {
    description: 'When the WhatsApp bridge forwards a "/command" message to a webhook trigger, variables.trigger carries:',
    fields: {
      sender: 'string — full WhatsApp JID. Pass to Send WhatsApp `to` to reply.',
      pn: 'string — phone number without the @s.whatsapp.net suffix.',
      content: 'string — full message text including the command.',
      command: 'string — the command name without the leading slash.',
      args: 'string — everything after the command name.',
      media: 'string[] — paths to downloaded media in the shared wa-media volume (e.g. receipt images).',
      isAudio: 'boolean — true when the message is a voice note.',
      timestamp: 'number — unix seconds of the original message.',
    },
  },
} as const;
