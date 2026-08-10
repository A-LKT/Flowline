import { useState, useEffect, useMemo } from 'react';
import { X, Eye, EyeOff } from 'lucide-react';
import type {
  Trigger,
  ScheduleConfig, WebhookConfig, FileWatchConfig, EmailConfig,
} from '../../types/trigger';
import { useWorkflowStore } from '../../state/workflowStore';
import { useTriggerStore } from '../../state/triggerStore';

type Props = {
  initial?: Trigger;
  onSave: (data: Omit<Trigger, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  onClose: () => void;
};

const CRON_RE = /^(\*|[0-9,\-*/]+)\s+(\*|[0-9,\-*/]+)\s+(\*|[0-9,\-*/]+)\s+(\*|[0-9,\-*/]+)\s+(\*|[0-9,\-*/]+)(\s+(\*|[0-9,\-*/]+))?$/;
const PATH_RE = /^[a-z0-9][a-z0-9\-_]{0,63}$/i;

const KIND_LABELS: Record<string, string> = {
  schedule:   'Schedule (CRON)',
  webhook:    'Webhook (REST)',
  'file-watch': 'File watch',
  email:      'Email inbox (IMAP)',
};

// ─── Per-kind config form sections ──────────────────────────────────────────

function ScheduleFields({ cron, setCron, timezone, setTimezone, catchup, setCatchup }: {
  cron: string; setCron: (v: string) => void;
  timezone: string; setTimezone: (v: string) => void;
  catchup: boolean; setCatchup: (v: boolean) => void;
}) {
  return (
    <>
      <div className="field-row">
        <label className="field-label">CRON expression</label>
        <input
          className="field-input"
          value={cron}
          onChange={(e) => setCron(e.target.value)}
          placeholder="0 * * * *"
          style={{ fontFamily: 'ui-monospace, monospace' }}
        />
        <div className="field-hint">
          minute hour day month weekday — e.g. <code>0 9 * * 1-5</code> = Mon–Fri 9am
        </div>
      </div>
      <div className="field-row">
        <label className="field-label">Timezone (optional)</label>
        <input
          className="field-input"
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          placeholder="Europe/Warsaw"
        />
      </div>
      <div className="field-row">
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem' }}>
          <input
            type="checkbox"
            checked={catchup}
            onChange={(e) => setCatchup(e.target.checked)}
          />
          <span>Catch up missed runs</span>
        </label>
        <div className="field-hint">
          If the server was down at the scheduled time, fire one make-up run on startup.
        </div>
      </div>
    </>
  );
}

function WebhookFields({ path, setPath, secret, setSecret, filter, setFilter, pathWarning, showSecret, setShowSecret }: {
  path: string; setPath: (v: string) => void;
  secret: string; setSecret: (v: string) => void;
  filter: string; setFilter: (v: string) => void;
  pathWarning: { level: 'warn' | 'info'; text: string } | null;
  showSecret: boolean; setShowSecret: (v: boolean) => void;
}) {
  return (
    <>
      <div className="field-row">
        <label className="field-label">Webhook path</label>
        <input
          className="field-input"
          value={path}
          onChange={(e) => setPath(e.target.value)}
          placeholder="my-webhook"
          style={{ fontFamily: 'ui-monospace, monospace' }}
        />
        <div className="field-hint">Reachable at <code>POST /webhooks/{path || '…'}</code></div>
        {pathWarning && (
          <div className="field-hint" style={{ color: pathWarning.level === 'warn' ? 'var(--warning, #d97706)' : 'var(--text3)', marginTop: '0.25rem' }}>
            {pathWarning.level === 'warn' ? '⚠ ' : 'ℹ '}{pathWarning.text}
          </div>
        )}
      </div>
      <div className="field-row">
        <label className="field-label">Secret (optional, HMAC-SHA256)</label>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <input
            className="field-input"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="Leave blank to skip verification"
            type={showSecret ? 'text' : 'password'}
            style={{ paddingRight: '2.2rem', flex: 1 }}
          />
          <button
            type="button"
            onClick={() => setShowSecret(!showSecret)}
            style={{ position: 'absolute', right: '0.5rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', display: 'flex', padding: 2 }}
            tabIndex={-1}
            aria-label={showSecret ? 'Hide secret' : 'Show secret'}
          >
            {showSecret ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
      </div>
      <div className="field-row">
        <label className="field-label">Filter (optional, JS expression)</label>
        <textarea
          className="field-input"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="body.type === 'audio'"
          rows={2}
          style={{ fontFamily: 'ui-monospace, monospace', resize: 'vertical' }}
        />
        <div className="field-hint">
          Evaluated against the request body — leave blank to match all. Multiple triggers can share the same path with different filters.
        </div>
      </div>
    </>
  );
}

type FileWatchState = {
  watchPath: string; setWatchPath: (v: string) => void;
  pattern: string; setPattern: (v: string) => void;
  events: Set<'add' | 'change' | 'unlink'>; setEvents: (v: Set<'add' | 'change' | 'unlink'>) => void;
  debounceMs: string; setDebounceMs: (v: string) => void;
};

function FileWatchFields({ watchPath, setWatchPath, pattern, setPattern, events, setEvents, debounceMs, setDebounceMs }: FileWatchState) {
  const toggleEvent = (ev: 'add' | 'change' | 'unlink') => {
    const next = new Set(events);
    next.has(ev) ? next.delete(ev) : next.add(ev);
    setEvents(next);
  };

  return (
    <>
      <div className="field-row">
        <label className="field-label">Watch path</label>
        <input
          className="field-input"
          value={watchPath}
          onChange={(e) => setWatchPath(e.target.value)}
          placeholder="/data/incoming"
          style={{ fontFamily: 'ui-monospace, monospace' }}
        />
        <div className="field-hint">Absolute path to the directory to watch.</div>
      </div>
      <div className="field-row">
        <label className="field-label">File pattern (optional)</label>
        <input
          className="field-input"
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
          placeholder="*.csv"
          style={{ fontFamily: 'ui-monospace, monospace' }}
        />
        <div className="field-hint">Glob pattern applied to the filename, e.g. <code>*.csv</code>. Leave blank to match all files.</div>
      </div>
      <div className="field-row">
        <label className="field-label">Watch events</label>
        <div style={{ display: 'flex', gap: '1rem', paddingTop: '0.25rem' }}>
          {(['add', 'change', 'unlink'] as const).map((ev) => (
            <label key={ev} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.85rem' }}>
              <input type="checkbox" checked={events.has(ev)} onChange={() => toggleEvent(ev)} />
              <span>{ev === 'add' ? 'Created' : ev === 'change' ? 'Modified' : 'Deleted'}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="field-row">
        <label className="field-label">Debounce (ms, optional)</label>
        <input
          className="field-input"
          value={debounceMs}
          onChange={(e) => setDebounceMs(e.target.value)}
          placeholder="500"
          type="number"
          min={0}
          style={{ width: '8rem' }}
        />
        <div className="field-hint">Wait this long after the last change before firing. Useful for large file copies.</div>
      </div>
    </>
  );
}

type EmailState = {
  host: string; setHost: (v: string) => void;
  port: string; setPort: (v: string) => void;
  tls: boolean; setTls: (v: boolean) => void;
  user: string; setUser: (v: string) => void;
  password: string; setPassword: (v: string) => void;
  showPassword: boolean; setShowPassword: (v: boolean) => void;
  folder: string; setFolder: (v: string) => void;
  markSeen: boolean; setMarkSeen: (v: boolean) => void;
  fromFilter: string; setFromFilter: (v: string) => void;
  subjectFilter: string; setSubjectFilter: (v: string) => void;
};

function EmailFields(s: EmailState) {
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 6rem', gap: '0.5rem' }}>
        <div className="field-row" style={{ marginBottom: 0 }}>
          <label className="field-label">IMAP host</label>
          <input className="field-input" value={s.host} onChange={(e) => s.setHost(e.target.value)} placeholder="imap.example.com" />
        </div>
        <div className="field-row" style={{ marginBottom: 0 }}>
          <label className="field-label">Port</label>
          <input className="field-input" value={s.port} onChange={(e) => s.setPort(e.target.value)} type="number" placeholder="993" />
        </div>
      </div>
      <div className="field-row">
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem' }}>
          <input type="checkbox" checked={s.tls} onChange={(e) => s.setTls(e.target.checked)} />
          <span>Use TLS/SSL</span>
        </label>
      </div>
      <div className="field-row">
        <label className="field-label">Username</label>
        <input className="field-input" value={s.user} onChange={(e) => s.setUser(e.target.value)} placeholder="user@example.com" autoComplete="off" />
      </div>
      <div className="field-row">
        <label className="field-label">Password</label>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <input
            className="field-input"
            value={s.password}
            onChange={(e) => s.setPassword(e.target.value)}
            placeholder="password or $SECRET_NAME"
            type={s.showPassword ? 'text' : 'password'}
            style={{ paddingRight: '2.2rem', flex: 1 }}
            autoComplete="new-password"
          />
          <button
            type="button"
            onClick={() => s.setShowPassword(!s.showPassword)}
            style={{ position: 'absolute', right: '0.5rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', display: 'flex', padding: 2 }}
            tabIndex={-1}
            aria-label={s.showPassword ? 'Hide password' : 'Show password'}
          >
            {s.showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
        <div className="field-hint">Use <code>$SECRET_NAME</code> to reference a stored secret instead of a literal password.</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
        <div className="field-row" style={{ marginBottom: 0 }}>
          <label className="field-label">Folder (optional)</label>
          <input className="field-input" value={s.folder} onChange={(e) => s.setFolder(e.target.value)} placeholder="INBOX" />
        </div>
      </div>
      <div className="field-row">
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem' }}>
          <input type="checkbox" checked={s.markSeen} onChange={(e) => s.setMarkSeen(e.target.checked)} />
          <span>Mark messages as read after processing</span>
        </label>
      </div>
      <div className="field-row">
        <label className="field-label">From filter (optional)</label>
        <input className="field-input" value={s.fromFilter} onChange={(e) => s.setFromFilter(e.target.value)} placeholder="alerts@example.com" />
        <div className="field-hint">Only fire for messages from senders containing this string.</div>
      </div>
      <div className="field-row">
        <label className="field-label">Subject filter (optional)</label>
        <input className="field-input" value={s.subjectFilter} onChange={(e) => s.setSubjectFilter(e.target.value)} placeholder="[ALERT]" />
        <div className="field-hint">Only fire for messages whose subject contains this string.</div>
      </div>
    </>
  );
}

// ─── Main modal ──────────────────────────────────────────────────────────────

export const TriggerFormModal = ({ initial, onSave, onClose }: Props) => {
  const workflows  = useWorkflowStore((s) => s.workflows);
  const allTriggers = useTriggerStore((s) => s.triggers);

  // Common fields
  const [name, setName]         = useState(initial?.name ?? '');
  const [desc, setDesc]         = useState(initial?.description ?? '');
  const [kind, setKind]         = useState<string>(initial?.kind ?? 'schedule');
  const [targetId, setTargetId] = useState(initial?.target.id ?? workflows.find((w) => !w.deprecated)?.id ?? '');
  const [enabled, setEnabled]   = useState(initial?.enabled ?? true);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');

  // Deprecated workflows can't be run, so they aren't valid new trigger targets —
  // but keep the current target visible when editing a trigger that points at one.
  const selectableWorkflows = workflows.filter((w) => !w.deprecated || w.id === targetId);

  // Schedule fields
  const [cron, setCron]         = useState((initial?.config as ScheduleConfig | undefined)?.cron ?? '0 * * * *');
  const [timezone, setTimezone] = useState((initial?.config as ScheduleConfig | undefined)?.timezone ?? '');
  const [catchup, setCatchup]   = useState((initial?.config as ScheduleConfig | undefined)?.catchup !== false);

  // Webhook fields
  const [whPath, setWhPath]     = useState((initial?.config as WebhookConfig | undefined)?.path ?? '');
  const [secret, setSecret]     = useState((initial?.config as WebhookConfig | undefined)?.secret ?? '');
  const [filter, setFilter]     = useState((initial?.config as WebhookConfig | undefined)?.filter ?? '');
  const [showSecret, setShowSecret] = useState(false);

  // File-watch fields
  const fwCfg = initial?.config as FileWatchConfig | undefined;
  const [watchPath, setWatchPath]   = useState(fwCfg?.watchPath ?? '');
  const [fwPattern, setFwPattern]   = useState(fwCfg?.pattern ?? '');
  const [fwEvents, setFwEvents]     = useState<Set<'add' | 'change' | 'unlink'>>(
    new Set(fwCfg?.events ?? ['add', 'change']),
  );
  const [debounceMs, setDebounceMs] = useState(String(fwCfg?.debounceMs ?? ''));

  // Email fields
  const emCfg = initial?.config as EmailConfig | undefined;
  const [emHost, setEmHost]               = useState(emCfg?.host ?? '');
  const [emPort, setEmPort]               = useState(String(emCfg?.port ?? '993'));
  const [emTls, setEmTls]                 = useState(emCfg?.tls ?? true);
  const [emUser, setEmUser]               = useState(emCfg?.user ?? '');
  const [emPassword, setEmPassword]       = useState(emCfg?.password ?? '');
  const [showPassword, setShowPassword]   = useState(false);
  const [emFolder, setEmFolder]           = useState(emCfg?.folder ?? '');
  const [emMarkSeen, setEmMarkSeen]       = useState(emCfg?.markSeen ?? true);
  const [emFromFilter, setEmFromFilter]   = useState(emCfg?.fromFilter ?? '');
  const [emSubjFilter, setEmSubjFilter]   = useState(emCfg?.subjectFilter ?? '');

  // Webhook path collision warning
  const pathWarning = useMemo(() => {
    if (kind !== 'webhook' || !PATH_RE.test(whPath.trim())) return null;
    const trimmed = whPath.trim();
    const siblings = allTriggers.filter(
      (t) => t.kind === 'webhook' && t.id !== initial?.id && (t.config as WebhookConfig).path === trimmed,
    );
    if (siblings.length === 0) return null;
    const anyUnfiltered = !filter.trim() || siblings.some((t) => !(t.config as WebhookConfig).filter);
    return anyUnfiltered
      ? { level: 'warn' as const, text: `${siblings.length} other trigger${siblings.length > 1 ? 's' : ''} share${siblings.length === 1 ? 's' : ''} this path without a filter — all will fire for every matching request.` }
      : { level: 'info' as const, text: `This path is shared with ${siblings.length} other trigger${siblings.length > 1 ? 's' : ''}. Only those whose filter matches the payload will fire.` };
  }, [kind, whPath, filter, allTriggers, initial?.id]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const validate = (): string => {
    if (!name.trim()) return 'Name is required';
    if (!targetId) return 'Select a target workflow';
    if (kind === 'schedule' && !CRON_RE.test(cron.trim())) return 'Invalid cron expression';
    if (kind === 'webhook' && !PATH_RE.test(whPath.trim())) return 'Webhook path must be 1-64 alphanumeric/hyphen/underscore characters';
    if (kind === 'file-watch') {
      if (!watchPath.trim()) return 'Watch path is required';
      if (fwEvents.size === 0) return 'Select at least one watch event';
    }
    if (kind === 'email') {
      if (!emHost.trim()) return 'IMAP host is required';
      if (!emPort.trim() || isNaN(Number(emPort))) return 'Valid port is required';
      if (!emUser.trim()) return 'Username is required';
      if (!emPassword.trim()) return 'Password is required';
    }
    return '';
  };

  const buildConfig = () => {
    switch (kind) {
      case 'schedule':
        return {
          cron: cron.trim(),
          ...(timezone.trim() ? { timezone: timezone.trim() } : {}),
          ...(catchup ? {} : { catchup: false }),
        } satisfies ScheduleConfig;
      case 'webhook':
        return {
          path: whPath.trim(),
          ...(secret.trim() ? { secret: secret.trim() } : {}),
          ...(filter.trim() ? { filter: filter.trim() } : {}),
        } satisfies WebhookConfig;
      case 'file-watch':
        return {
          watchPath: watchPath.trim(),
          ...(fwPattern.trim() ? { pattern: fwPattern.trim() } : {}),
          events: [...fwEvents],
          ...(debounceMs.trim() ? { debounceMs: Number(debounceMs) } : {}),
        } satisfies FileWatchConfig;
      case 'email':
        return {
          host: emHost.trim(),
          port: Number(emPort),
          tls: emTls,
          user: emUser.trim(),
          password: emPassword.trim(),
          ...(emFolder.trim() ? { folder: emFolder.trim() } : {}),
          markSeen: emMarkSeen,
          ...(emFromFilter.trim() ? { fromFilter: emFromFilter.trim() } : {}),
          ...(emSubjFilter.trim() ? { subjectFilter: emSubjFilter.trim() } : {}),
        } satisfies EmailConfig;
      default:
        return {};
    }
  };

  const handleSave = async () => {
    const err = validate();
    if (err) { setError(err); return; }
    setError('');
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        description: desc.trim() || undefined,
        kind,
        target: { type: 'workflow', id: targetId },
        enabled,
        config: buildConfig(),
      });
      onClose();
    } catch (e) {
      setError((e as Error).message ?? 'Failed to save');
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <span className="modal-title">{initial ? 'Edit Trigger' : 'New Trigger'}</span>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="field-row">
          <label className="field-label">Name</label>
          <input className="field-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="My trigger" />
        </div>

        <div className="field-row">
          <label className="field-label">Description</label>
          <input className="field-input" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Optional" />
        </div>

        <div className="field-row">
          <label className="field-label">Kind</label>
          <select className="field-select" value={kind} onChange={(e) => setKind(e.target.value)}>
            {Object.entries(KIND_LABELS).map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
        </div>

        <div className="field-row">
          <label className="field-label">Target workflow</label>
          <select className="field-select" value={targetId} onChange={(e) => setTargetId(e.target.value)}>
            {selectableWorkflows.length === 0 && <option value="">No workflows available</option>}
            {selectableWorkflows.map((wf) => (
              <option key={wf.id} value={wf.id}>{wf.name}{wf.deprecated ? ' (deprecated)' : ''}</option>
            ))}
          </select>
        </div>

        {kind === 'schedule' && (
          <ScheduleFields cron={cron} setCron={setCron} timezone={timezone} setTimezone={setTimezone} catchup={catchup} setCatchup={setCatchup} />
        )}

        {kind === 'webhook' && (
          <WebhookFields
            path={whPath} setPath={setWhPath}
            secret={secret} setSecret={setSecret}
            filter={filter} setFilter={setFilter}
            pathWarning={pathWarning}
            showSecret={showSecret} setShowSecret={setShowSecret}
          />
        )}

        {kind === 'file-watch' && (
          <FileWatchFields
            watchPath={watchPath} setWatchPath={setWatchPath}
            pattern={fwPattern} setPattern={setFwPattern}
            events={fwEvents} setEvents={setFwEvents}
            debounceMs={debounceMs} setDebounceMs={setDebounceMs}
          />
        )}

        {kind === 'email' && (
          <EmailFields
            host={emHost} setHost={setEmHost}
            port={emPort} setPort={setEmPort}
            tls={emTls} setTls={setEmTls}
            user={emUser} setUser={setEmUser}
            password={emPassword} setPassword={setEmPassword}
            showPassword={showPassword} setShowPassword={setShowPassword}
            folder={emFolder} setFolder={setEmFolder}
            markSeen={emMarkSeen} setMarkSeen={setEmMarkSeen}
            fromFilter={emFromFilter} setFromFilter={setEmFromFilter}
            subjectFilter={emSubjFilter} setSubjectFilter={setEmSubjFilter}
          />
        )}

        <div className="field-row--inline">
          <label className="trigger-enabled" title="Enable or disable this trigger">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            Enabled
          </label>
        </div>

        {error && <div className="trigger-form-error">{error}</div>}

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving || !targetId}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
};
