// API token support. The backend (when started with API_TOKEN) requires a
// shared token on every API route. The token is entered once via the AuthGate
// screen, stored in localStorage, and attached transparently to every request:
//   - fetch: Authorization: Bearer <token>   (all API calls use relative URLs)
//   - EventSource: ?token=<token>            (SSE cannot set headers)
// Wrapping fetch/EventSource here keeps the dozens of call sites untouched.

const STORAGE_KEY = 'api:token';

export const getApiToken = (): string => localStorage.getItem(STORAGE_KEY) ?? '';
export const setApiToken = (token: string): void => {
  if (token) localStorage.setItem(STORAGE_KEY, token);
  else localStorage.removeItem(STORAGE_KEY);
};

const isSameOrigin = (url: string): boolean =>
  url.startsWith('/') || url.startsWith(window.location.origin);

export function installApiAuth(): void {
  const origFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const token = getApiToken();
    if (token && isSameOrigin(url)) {
      const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
      if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
      init = { ...init, headers };
    }
    return origFetch(input, init);
  };

  const OrigEventSource = window.EventSource;
  window.EventSource = class extends OrigEventSource {
    constructor(url: string | URL, eventSourceInitDict?: EventSourceInit) {
      let u = typeof url === 'string' ? url : url.href;
      const token = getApiToken();
      if (token && isSameOrigin(u)) {
        u += (u.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(token);
      }
      super(u, eventSourceInitDict);
    }
  } as typeof EventSource;
}

export type AuthStatus = 'ok' | 'unauthorized' | 'offline';

// Probe the protected check endpoint. 'offline' (backend unreachable) is not
// treated as an auth failure — the stores surface offline state themselves.
export async function checkAuth(): Promise<AuthStatus> {
  try {
    const res = await fetch('/api/auth/check');
    if (res.status === 401) return 'unauthorized';
    return res.ok ? 'ok' : 'offline';
  } catch {
    return 'offline';
  }
}
