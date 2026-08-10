import { useEffect } from 'react';
import { GitBranch, Code2, Zap, BookOpen, KeyRound, Activity, Database, ShieldCheck, Sparkles } from 'lucide-react';
import { AppHeader } from '../../components/AppHeader';
import { HomeStats } from './HomeStats';
import { ServiceStatus } from './ServiceStatus';
import { ExecutionPauseToggle } from '../admin/ExecutionPauseToggle';
import { useWorkflowStore } from '../../state/workflowStore';
import { useScriptStore } from '../../state/scriptStore';
import { useTriggerStore } from '../../state/triggerStore';
import { useSecretsStore } from '../../state/secretsStore';
import { useEditionStore } from '../../state/editionStore';
import { DEFAULT_DOCS_PAGE, type Route } from '../../state/route';

type Props = { onNavigate: (route: Route) => void };

export const HomePage = ({ onNavigate }: Props) => {
  const workflowCount  = useWorkflowStore((s) => s.workflows.filter((w) => !w.deprecated).length);
  const backendOffline = useWorkflowStore((s) => s.backendOffline);
  const scriptCount    = useScriptStore((s) => s.scripts.length);
  const triggerCount   = useTriggerStore((s) => s.triggers.length);
  const secretCount    = useSecretsStore((s) => s.names.length);
  const vaultUnavail   = useSecretsStore((s) => s.vaultUnavailable);
  const loadSecrets    = useSecretsStore((s) => s.loadSecrets);
  const assistantEnabled = useEditionStore((s) => s.features.assistant);

  useEffect(() => { void loadSecrets(); }, [loadSecrets]);

  return (
    <div className="app-shell">
      <AppHeader />

      <div className="home">
        {backendOffline && (
          <div className="home-offline-banner">
            Backend unreachable — counts and stats may be unavailable
          </div>
        )}

        {!backendOffline && (
          <section className="home-widget">
            <div className="home-widget-header">
              <span className="home-widget-title">System</span>
              <button
                className="home-widget-link"
                onClick={() => onNavigate({ space: 'admin' })}
              >
                Admin →
              </button>
            </div>
            <ExecutionPauseToggle />
            <HomeStats />
            <ServiceStatus />
          </section>
        )}

        <nav className="home-nav">
          <button className="home-card" onClick={() => onNavigate({ space: 'workflows' })}>
            <div className="home-card-icon"><GitBranch size={22} strokeWidth={1.5} /></div>
            <div className="home-card-body">
              <div className="home-card-title">Workflows</div>
              <div className="home-card-meta">{workflowCount} workflow{workflowCount !== 1 ? 's' : ''}</div>
            </div>
            <div className="home-card-arrow">→</div>
          </button>

          <button className="home-card" onClick={() => onNavigate({ space: 'scripts' })}>
            <div className="home-card-icon home-card-icon--scripts"><Code2 size={22} strokeWidth={1.5} /></div>
            <div className="home-card-body">
              <div className="home-card-title">Scripts</div>
              <div className="home-card-meta">{scriptCount} script{scriptCount !== 1 ? 's' : ''}</div>
            </div>
            <div className="home-card-arrow">→</div>
          </button>

          <button className="home-card" onClick={() => onNavigate({ space: 'triggers' })}>
            <div className="home-card-icon home-card-icon--triggers"><Zap size={22} strokeWidth={1.5} /></div>
            <div className="home-card-body">
              <div className="home-card-title">Triggers</div>
              <div className="home-card-meta">{triggerCount} trigger{triggerCount !== 1 ? 's' : ''}</div>
            </div>
            <div className="home-card-arrow">→</div>
          </button>

          <button className="home-card" onClick={() => onNavigate({ space: 'docs', pageId: DEFAULT_DOCS_PAGE })}>
            <div className="home-card-icon home-card-icon--docs"><BookOpen size={22} strokeWidth={1.5} /></div>
            <div className="home-card-body">
              <div className="home-card-title">Documentation</div>
              <div className="home-card-meta">Guides &amp; node reference</div>
            </div>
            <div className="home-card-arrow">→</div>
          </button>

          <button className="home-card" onClick={() => onNavigate({ space: 'secrets' })}>
            <div className="home-card-icon home-card-icon--secrets"><KeyRound size={22} strokeWidth={1.5} /></div>
            <div className="home-card-body">
              <div className="home-card-title">Secrets</div>
              <div className="home-card-meta">
                {vaultUnavail ? 'Vault not configured' : `${secretCount} secret${secretCount !== 1 ? 's' : ''}`}
              </div>
            </div>
            <div className="home-card-arrow">→</div>
          </button>

          <button className="home-card" onClick={() => onNavigate({ space: 'jobs' })}>
            <div className="home-card-icon home-card-icon--jobs"><Activity size={22} strokeWidth={1.5} /></div>
            <div className="home-card-body">
              <div className="home-card-title">Jobs</div>
              <div className="home-card-meta">Run history &amp; live status</div>
            </div>
            <div className="home-card-arrow">→</div>
          </button>

          <button className="home-card" onClick={() => onNavigate({ space: 'datastore' })}>
            <div className="home-card-icon home-card-icon--datastore"><Database size={22} strokeWidth={1.5} /></div>
            <div className="home-card-body">
              <div className="home-card-title">Data Store</div>
              <div className="home-card-meta">Manage user-defined tables</div>
            </div>
            <div className="home-card-arrow">→</div>
          </button>

          {assistantEnabled && (
            <button className="home-card" onClick={() => onNavigate({ space: 'assistant' })}>
              <div className="home-card-icon home-card-icon--assistant"><Sparkles size={22} strokeWidth={1.5} /></div>
              <div className="home-card-body">
                <div className="home-card-title">Assistant <span className="home-card-premium">Premium</span></div>
                <div className="home-card-meta">Generate &amp; debug with an LLM</div>
              </div>
              <div className="home-card-arrow">→</div>
            </button>
          )}

          <button className="home-card" onClick={() => onNavigate({ space: 'admin' })}>
            <div className="home-card-icon home-card-icon--admin"><ShieldCheck size={22} strokeWidth={1.5} /></div>
            <div className="home-card-body">
              <div className="home-card-title">Admin</div>
              <div className="home-card-meta">Backup, restore &amp; maintenance</div>
            </div>
            <div className="home-card-arrow">→</div>
          </button>
        </nav>

      </div>
    </div>
  );
};
