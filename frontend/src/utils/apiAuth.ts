// Session auth for the SPA. The backend issues an httpOnly session cookie on
// login (see backend/src/auth/plugin.ts); the browser sends it automatically on
// every same-origin request, so there is nothing to attach here — no token in
// localStorage, no ?token= on SSE URLs. This module only:
//   - talks to the /api/auth/* endpoints (login / logout / check), and
//   - installs a global 401 interceptor that bounces the app back to the login
//     screen the moment a session expires or is revoked mid-use.

export interface AuthUser {
  id: string;
  username: string;
  role: string;
}

const isSameOrigin = (url: string): boolean =>
  url.startsWith('/') || url.startsWith(window.location.origin);

let onUnauthorized: (() => void) | null = null;

// Register the callback that flips the app to the login screen. Called by AuthGate.
export function setUnauthorizedHandler(fn: () => void): void {
  onUnauthorized = fn;
}

// Wrap fetch and EventSource so that:
//   - the session cookie is always sent to our API (credentials: 'include'),
//     which matters when the UI is served cross-origin (CORS_ORIGIN); same-origin
//     is unaffected, and
//   - any 401 from a same-origin API call surfaces as "session lost".
// The /api/auth/* endpoints are excluded from the 401 handling — their 401s (a
// wrong password, or the initial unauthenticated check) are handled inline by the
// login flow.
export function installApiAuth(): void {
  const origFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (isSameOrigin(url) && init?.credentials == null && !(input instanceof Request)) {
      init = { ...init, credentials: 'include' };
    }
    const res = await origFetch(input, init);
    try {
      if (res.status === 401 && isSameOrigin(url) && !url.includes('/api/auth/')) {
        onUnauthorized?.();
      }
    } catch { /* never let interception break the response */ }
    return res;
  };

  // EventSource ignores fetch's credentials; withCredentials makes it send the
  // cookie. Harmless same-origin (the stream already carries it), and correct if a
  // programmatic client ever points at the API cross-origin with CORS_ORIGIN set.
  const OrigEventSource = window.EventSource;
  window.EventSource = class extends OrigEventSource {
    constructor(url: string | URL, init?: EventSourceInit) {
      const u = typeof url === 'string' ? url : url.href;
      super(u, { ...init, withCredentials: true });
    }
  } as typeof EventSource;
}

export type LoginResult = { ok: true } | { ok: false; error: string };

export async function login(username: string, password: string): Promise<LoginResult> {
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (res.ok) return { ok: true };
    const data = await res.json().catch(() => ({})) as { error?: string };
    return { ok: false, error: data.error ?? 'Login failed' };
  } catch {
    return { ok: false, error: 'Cannot reach the server. Is it running?' };
  }
}

export async function logout(): Promise<void> {
  try { await fetch('/api/auth/logout', { method: 'POST' }); } catch { /* best effort */ }
}

export type AuthCheck =
  | { status: 'ok'; user: AuthUser }
  | { status: 'unauthorized' }
  | { status: 'offline' };

// Probe the session. 'offline' (backend unreachable) is distinct from
// 'unauthorized' so the gate doesn't force a login just because the server is down.
export async function checkAuth(): Promise<AuthCheck> {
  try {
    const res = await fetch('/api/auth/check');
    if (res.status === 401) return { status: 'unauthorized' };
    if (res.ok) {
      const d = await res.json() as { user: AuthUser };
      return { status: 'ok', user: d.user };
    }
    return { status: 'offline' };
  } catch {
    return { status: 'offline' };
  }
}
