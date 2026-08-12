import { useCallback, useEffect, useRef, useState } from 'react';
import { PipelineIcon } from './PipelineIcon';
import { checkAuth, login, setUnauthorizedHandler } from '../utils/apiAuth';
import { useAuthStore } from '../state/authStore';
import { useWorkflowStore } from '../state/workflowStore';
import { useScriptStore } from '../state/scriptStore';
import { useTriggerStore } from '../state/triggerStore';
import App from '../App';

type GateState = 'checking' | 'locked' | 'ready';

// Blocks the app until the backend confirms an authenticated session, then loads
// persisted data and renders the app proper. On login the backend sets an httpOnly
// session cookie; a mid-session 401 (expiry/revocation) bounces back here.
export function AuthGate() {
  const [state, setState] = useState<GateState>('checking');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const loadedRef = useRef(false);
  const setUser = useAuthStore((s) => s.setUser);

  const attempt = useCallback(async () => {
    setState('checking');
    const result = await checkAuth();
    if (result.status === 'unauthorized') {
      setState('locked');
      return;
    }
    if (result.status === 'ok') setUser(result.user);
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
  }, [setUser]);

  // A 401 anywhere in the app (expired/revoked session) sends us back to login.
  // Only show the "expired" note if we had actually loaded in — a first-time
  // visitor who was never authenticated shouldn't see a spurious expiry message.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      const wasAuthed = loadedRef.current;
      loadedRef.current = false;
      if (wasAuthed) setError('Your session expired — please sign in again.');
      setState('locked');
    });
  }, []);

  useEffect(() => { void attempt(); }, [attempt]);

  if (state === 'ready') return <App />;

  if (state === 'checking') {
    return (
      <div className="app-shell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text2)' }}>
        Connecting…
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const u = username.trim();
    if (!u || !password || submitting) return;
    setSubmitting(true);
    setError('');
    const res = await login(u, password);
    setSubmitting(false);
    if (!res.ok) {
      setPassword('');
      setError(res.error);
      return;
    }
    await attempt();
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
          Sign in to continue.
        </p>
        <input
          className="field-input"
          type="text"
          autoFocus
          autoComplete="username"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          className="field-input"
          type="password"
          autoComplete="current-password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <div style={{ fontSize: '0.8rem', color: 'var(--error, #e5484d)' }}>{error}</div>}
        <button className="btn-primary" type="submit" disabled={!username.trim() || !password || submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
