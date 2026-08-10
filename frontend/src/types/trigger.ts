// Built-in kinds. Plugin-registered adapters may add further kinds (arbitrary string).
export type TriggerKind = 'schedule' | 'webhook' | 'file-watch' | 'email';

export type TriggerTarget = {
  type: 'workflow';
  id: string;
};

export type ScheduleConfig = {
  cron: string;
  timezone?: string;
  catchup?: boolean; // default true — set false to disable missed-run catch-up
};

export type WebhookConfig = {
  path: string;
  secret?: string;
  filter?: string;
};

export type FileWatchConfig = {
  watchPath: string;
  pattern?: string;
  events: ('add' | 'change' | 'unlink')[];
  debounceMs?: number;
};

// Password may be a literal value or a secret reference: $SECRET_NAME
export type EmailConfig = {
  host: string;
  port: number;
  tls: boolean;
  user: string;
  password: string;
  folder?: string;
  markSeen?: boolean;
  fromFilter?: string;
  subjectFilter?: string;
};

export type Trigger = {
  id: string;
  name: string;
  description?: string;
  kind: string;   // TriggerKind for built-ins; arbitrary string for plugin adapters
  target: TriggerTarget;
  enabled: boolean;
  config: ScheduleConfig | WebhookConfig | FileWatchConfig | EmailConfig | Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
  // Derived (read-only): created_at of the most recent run this trigger fired; null if never fired.
  lastRunAt?: number | null;
  // Derived (read-only): whether this trigger's adapter supports on-demand firing.
  canRunNow?: boolean;
};
