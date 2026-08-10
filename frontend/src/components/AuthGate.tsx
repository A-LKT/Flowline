import { useCallback, useEffect, useRef, useState } from 'react';
import { PipelineIcon } from './PipelineIcon';
import { checkAuth, getApiToken, setApiToken } from '../utils/apiAuth';
import { useWorkflowStore } from '../state/workflowStore';
import { useScriptStore } from '../state/scriptStore';
import { useTriggerStore } from '../state/triggerStore';
import App from '../App';

type GateState = 'checking' | 'locked' | 'ready';

// Blocks the app until the backend accepts our API token (or reports that no
// token is required), then loads persisted data and renders the app proper.
export function AuthGate() {
  const [state, setState] = useState<GateState>('checking');
  const [tokenInput, setTokenInput] = useState('');
  const [error, setError] = useState('');
  const loadedRef = useRef(false);

  const attempt = useCallback(async (fromSubmit: boolean) => {
    setState('checking');
    const status = await checkAuth();
    if (status === 'unauthorized') {
      setError(fromSubmit ? 'That token was rejected — check it and try again.' : getApiToken() ? 'Stored token was rejected — it may have changed.' : '');
      setState('locked');
      return;
    }
    // 'ok', or 'offline' — proceed either way; the stores handle offline state.
    if (!loadedRef.current) {
      loadedRef.current = true;
      await Promise.all([
        useWorkflowStore.getState().loadWorkflows(),
        useScriptStore.getState().loadScripts(),
        useTriggerStore.getState().loadTriggers(),
      ]);
    }
    setState('ready');
  }, []);

  useEffect(() => { void attempt(false); }, [attempt]);

  if (state === 'ready') return <App />;

  if (state === 'checking') {
    return (
      <div className="app-shell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text2)' }}>
        Connecting…
      </div>
    );
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = tokenInput.trim();
    if (!t) return;
    setApiToken(t);
    void attempt(true);
  };

  return (
    <div className="app-shell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <form
        onSubmit={submit}
        style={{
          display: 'flex', flexDirection: 'column', gap: '0.75rem',
          width: 'min(360px, 90vw)', padding: '1.5rem',
          background: 'var(--bg2, rgba(128,128,128,0.06))',
          border: '1px solid var(--border, rgba(128,128,128,0.25))', borderRadius: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
          <PipelineIcon size={18} /> Flowline
        </div>
        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text2)' }}>
          This server requires an API token (the <code>API_TOKEN</code> value from the server environment).
        </p>
        <input
          className="field-input"
          type="password"
          autoFocus
          placeholder="API token"
          value={tokenInput}
          onChange={(e) => setTokenInput(e.target.value)}
        />
        {error && <div style={{ fontSize: '0.8rem', color: 'var(--error, #e5484d)' }}>{error}</div>}
        <button className="btn-primary" type="submit" disabled={!tokenInput.trim()}>
          Unlock
        </button>
      </form>
    </div>
  );
}
