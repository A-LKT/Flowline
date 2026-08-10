import { useState } from 'react';
import { Trash2, Play, Loader2, Check, X, Clock } from 'lucide-react';
import { useEditionStore } from '../../state/editionStore';
import { useTriggerStore } from '../../state/triggerStore';
import { ArtifactHistoryModal } from '../../components/ArtifactHistoryModal';
import type { Trigger, ScheduleConfig, WebhookConfig, FileWatchConfig, EmailConfig } from '../../types/trigger';

type Props = {
  trigger: Trigger;
  workflowName?: string;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: (enabled: boolean) => void;
  onRunNow: () => Promise<string>;
};

const KIND_LABEL: Record<string, string> = {
  schedule:     'Schedule',
  webhook:      'Webhook',
  'file-watch': 'File watch',
  email:        'Email',
};

function configSummary(trigger: Trigger): string {
  switch (trigger.kind) {
    case 'schedule':
      return (trigger.config as ScheduleConfig).cron;
    case 'webhook':
      return `POST /webhooks/${(trigger.config as WebhookConfig).path}`;
    case 'file-watch': {
      const cfg = trigger.config as FileWatchConfig;
      return cfg.pattern ? `${cfg.watchPath}  [${cfg.pattern}]` : cfg.watchPath;
    }
    case 'email': {
      const cfg = trigger.config as EmailConfig;
      return `${cfg.user}  @  ${cfg.host}:${cfg.port}`;
    }
    default:
      return trigger.kind;
  }
}

export const TriggerCard = ({ trigger, workflowName, onEdit, onDelete, onToggle, onRunNow }: Props) => {
  const label = KIND_LABEL[trigger.kind] ?? trigger.kind;
  const summary = configSummary(trigger);

  const historyEnabled = useEditionStore((s) => s.features.artifactHistory);
  const updateTrigger  = useTriggerStore((s) => s.updateTrigger);
  const [historyOpen, setHistoryOpen] = useState(false);

  const [runState, setRunState] = useState<'idle' | 'running' | 'done' | 'error'>('idle');

  const handleRunNow = async () => {
    setRunState('running');
    try {
      await onRunNow();
      setRunState('done');
    } catch {
      setRunState('error');
    }
    setTimeout(() => setRunState('idle'), 2500);
  };

  const runTitle =
    runState === 'running' ? 'Running…' :
    runState === 'done'    ? 'Started ✓' :
    runState === 'error'   ? 'Run failed' :
    'Run this trigger now';

  const runIcon =
    runState === 'running' ? <Loader2 size={14} strokeWidth={2} className="wf-card-run-spin" /> :
    runState === 'done'    ? <Check size={14} strokeWidth={2.5} /> :
    runState === 'error'   ? <X size={14} strokeWidth={2.5} /> :
    <Play size={14} strokeWidth={2} />;

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div
      className="wf-card wf-card--hoverable trigger-card"
      onClick={onEdit}
      role="button"
      tabIndex={0}
      // Only act on Enter when the card itself is focused — not when the event
      // bubbles up from a descendant (e.g. the history modal).
      onKeyDown={(e) => { if (e.key === 'Enter' && e.target === e.currentTarget) onEdit(); }}
      title="Click to edit this trigger"
    >
      <div className="wf-card-name-row">
        <span className="wf-card-name" style={{ cursor: 'inherit' }}>{trigger.name}</span>
        <span className={`badge trigger-kind-badge trigger-kind-badge--${trigger.kind}`}>
          {label}
        </span>
        <label className="trigger-enabled" onClick={stop} title="Enable or disable this trigger">
          <input
            type="checkbox"
            checked={trigger.enabled}
            onChange={(e) => onToggle(e.target.checked)}
          />
          Enabled
        </label>
      </div>

      {trigger.description && (
        <div className="trigger-card-desc">
          <span className="wf-card-desc" title={trigger.description}>{trigger.description}</span>
        </div>
      )}

      <div className="trigger-config-line">
        <code className="trigger-config-code">{summary}</code>
      </div>

      <div className="wf-card-badges">
        {workflowName && <span className="badge">→ {workflowName}</span>}
        <span
          className="badge badge--muted"
          title={trigger.lastRunAt ? `Last run ${new Date(trigger.lastRunAt).toLocaleString()}` : 'Has not run yet'}
        >
          {trigger.lastRunAt
            ? `Last run ${new Date(trigger.lastRunAt).toLocaleString()}`
            : 'Never run'}
        </span>
      </div>

      <div className="wf-card-footer trigger-card-footer">
        {trigger.canRunNow && (
          <button
            className={`wf-card-run${runState === 'done' ? ' wf-card-run--done' : ''}${runState === 'error' ? ' wf-card-run--error' : ''}`}
            onClick={(e) => { stop(e); void handleRunNow(); }}
            disabled={runState === 'running'}
            title={runTitle}
            aria-label={runTitle}
          >
            {runIcon}
          </button>
        )}
        {historyEnabled && (
          <button
            className="wf-card-run"
            onClick={(e) => { stop(e); setHistoryOpen(true); }}
            title="Version history"
            aria-label="Version history"
          >
            <Clock size={14} strokeWidth={2} />
          </button>
        )}
        <button
          className="wf-card-delete"
          onClick={(e) => { stop(e); onDelete(); }}
          title="Delete trigger"
          aria-label="Delete trigger"
        >
          <Trash2 size={14} strokeWidth={2} />
        </button>
      </div>

      {historyOpen && (
        <ArtifactHistoryModal
          type="trigger"
          id={trigger.id}
          name={trigger.name}
          current={trigger}
          onRestore={(data) => {
            const d = data as Trigger;
            return updateTrigger(trigger.id, {
              name: d.name, description: d.description, kind: d.kind,
              target: d.target, enabled: d.enabled, config: d.config,
            });
          }}
          onClose={() => setHistoryOpen(false)}
        />
      )}
    </div>
  );
};
