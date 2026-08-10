import { useSyncExternalStore } from 'react';

// ---------------------------------------------------------------------------
// Hash-based routing
//
// Every view has a URL. We use the location hash (not history-mode paths)
// because the dev proxy and backend own the top-level API paths
// (/workflows, /scripts, /runs, /datastore, …) — clean URLs would collide.
// `#/runs/<id>` predates this module and its exact shape is preserved.
// ---------------------------------------------------------------------------

export const DEFAULT_DOCS_PAGE = 'introduction';

export type Route =
  | { space: 'home' }
  | { space: 'workflows'; workflowId?: string }
  | { space: 'scripts';   scriptId?: string }
  | { space: 'triggers' }
  | { space: 'docs';      pageId: string }
  | { space: 'secrets' }
  | { space: 'jobs';      workflowId?: string[]; status?: string[]; trigger?: string[]; range?: string; q?: string; runId?: string }
  | { space: 'datastore'; tableId?: string }
  | { space: 'assistant'; troubleshootRunId?: string }
  | { space: 'admin' };

export type Space = Route['space'];

// ---------------------------------------------------------------------------
// parse / format — must round-trip
// ---------------------------------------------------------------------------

/** Split a raw hash into path segments and a query string. */
function splitHash(hash: string): { segments: string[]; query: URLSearchParams } {
  // Strip leading '#', then leading '/'
  let h = hash.startsWith('#') ? hash.slice(1) : hash;
  if (h.startsWith('/')) h = h.slice(1);

  const qIdx = h.indexOf('?');
  const query = new URLSearchParams(qIdx >= 0 ? h.slice(qIdx + 1) : '');
  const path  = qIdx >= 0 ? h.slice(0, qIdx) : h;

  const segments = path.split('/').filter(Boolean).map((s) => {
    try { return decodeURIComponent(s); } catch { return s; }
  });
  return { segments, query };
}

export function parseHash(hash: string): Route {
  const { segments, query } = splitHash(hash);
  const [head, id] = segments;

  switch (head) {
    case undefined:
    case '':
    case 'home':
      return { space: 'home' };

    case 'workflows':
      return { space: 'workflows', workflowId: id };

    case 'scripts':
      return { space: 'scripts', scriptId: id };

    case 'triggers':
      return { space: 'triggers' };

    case 'docs':
      return { space: 'docs', pageId: id || DEFAULT_DOCS_PAGE };

    case 'secrets':
      return { space: 'secrets' };

    case 'jobs':
      // `#/jobs/<runId>` opens a run in the read-only canvas review;
      // `#/jobs?workflow=&status=` is the filtered list.
      if (id) return { space: 'jobs', runId: id };
      {
        const list = (v: string | null) => (v ? v.split(',').filter(Boolean) : undefined);
        return {
          space: 'jobs',
          workflowId: list(query.get('workflow')),
          status:     list(query.get('status')),
          trigger:    list(query.get('trigger')),
          range:      query.get('range') || undefined,
          q:          query.get('q') || undefined,
        };
      }

    case 'runs':
      // Legacy `#/runs/<id>` (the removed standalone raw view) now redirects to
      // the run review under Jobs.
      if (id) return { space: 'jobs', runId: id };
      return { space: 'jobs' };

    case 'datastore':
      return { space: 'datastore', tableId: id };

    case 'assistant':
      // `#/assistant?run=<runId>` opens a new chat pre-scoped to that run (+ its
      // workflow) for troubleshooting; `#/assistant` is the plain space.
      return { space: 'assistant', troubleshootRunId: query.get('run') || undefined };

    case 'admin':
      return { space: 'admin' };

    default:
      return { space: 'home' };
  }
}

const enc = (s: string) => encodeURIComponent(s);

export function formatRoute(route: Route): string {
  switch (route.space) {
    case 'home':
      return '#/';
    case 'workflows':
      return route.workflowId ? `#/workflows/${enc(route.workflowId)}` : '#/workflows';
    case 'scripts':
      return route.scriptId ? `#/scripts/${enc(route.scriptId)}` : '#/scripts';
    case 'triggers':
      return '#/triggers';
    case 'docs':
      return `#/docs/${enc(route.pageId || DEFAULT_DOCS_PAGE)}`;
    case 'secrets':
      return '#/secrets';
    case 'jobs': {
      if (route.runId) return `#/jobs/${enc(route.runId)}`;
      const q = new URLSearchParams();
      if (route.workflowId?.length) q.set('workflow', route.workflowId.join(','));
      if (route.status?.length)   q.set('status', route.status.join(','));
      if (route.trigger?.length)  q.set('trigger', route.trigger.join(','));
      if (route.range)            q.set('range', route.range);
      if (route.q)                q.set('q', route.q);
      const qs = q.toString();
      return qs ? `#/jobs?${qs}` : '#/jobs';
    }
    case 'datastore':
      return route.tableId ? `#/datastore/${enc(route.tableId)}` : '#/datastore';
    case 'assistant':
      return route.troubleshootRunId ? `#/assistant?run=${enc(route.troubleshootRunId)}` : '#/assistant';
    case 'admin':
      return '#/admin';
  }
}

// ---------------------------------------------------------------------------
// Internal store + navigation blocker
//
// The route module owns THE `hashchange` listener and maintains the committed
// route. This lets a blocker (registered by the workflow editor when there are
// unsaved changes) veto a navigation — including a browser Back — and restore
// the previous hash *before* `useRoute` subscribers re-render. Doing it here,
// rather than in per-view `hashchange` listeners, avoids listener-ordering races.
// ---------------------------------------------------------------------------

/** Return `true` to allow the navigation, `false` to block it. */
export type NavigationBlocker = (to: Route, from: Route) => boolean;

const listeners = new Set<() => void>();
let blocker: NavigationBlocker | null = null;
let bypassOnce = false;

let committedHash: string;
let committedRoute: Route;

function commit(hash: string): void {
  committedHash  = hash;
  committedRoute = parseHash(hash);
}

function restoreHash(): void {
  const url = `${window.location.pathname}${window.location.search}${committedHash || '#/'}`;
  window.history.replaceState(window.history.state, '', url);
}

function handleHashChange(): void {
  const nextHash = window.location.hash;
  if (nextHash === committedHash) return;

  const to = parseHash(nextHash);
  if (bypassOnce) {
    bypassOnce = false;
  } else if (blocker && !blocker(to, committedRoute)) {
    restoreHash();
    return;
  }

  commit(nextHash);
  listeners.forEach((l) => l());
}

// Install once at module load.
commit(typeof window !== 'undefined' ? window.location.hash : '');
if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', handleHashChange);
}

/**
 * Register a blocker; returns an unregister function. Only one blocker is
 * active at a time (the workflow editor is the sole user).
 */
export function registerNavigationBlocker(fn: NavigationBlocker): () => void {
  blocker = fn;
  return () => { if (blocker === fn) blocker = null; };
}

// ---------------------------------------------------------------------------
// navigation
// ---------------------------------------------------------------------------

type NavigateOptions = {
  /** Skip the navigation blocker for this one navigation (e.g. "Discard & leave"). */
  force?: boolean;
  /** Replace the current history entry instead of pushing a new one. */
  replace?: boolean;
};

/** Navigate to a route by updating the location hash. */
export function navigate(route: Route, opts?: NavigateOptions): void {
  const next = formatRoute(route);
  if (next === window.location.hash) return;

  if (opts?.force) bypassOnce = true;

  if (opts?.replace) {
    const url = `${window.location.pathname}${window.location.search}${next}`;
    window.history.replaceState(window.history.state, '', url);
    // replaceState doesn't emit hashchange — drive the store manually.
    handleHashChange();
  } else {
    window.location.hash = next;
  }
}

/** Replace the current history entry instead of pushing a new one. */
export function navigateReplace(route: Route): void {
  navigate(route, { replace: true });
}

// ---------------------------------------------------------------------------
// useRoute — the single source of truth for what's on screen
// ---------------------------------------------------------------------------

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => { listeners.delete(onChange); };
}

function getSnapshot(): Route {
  return committedRoute;
}

export function useRoute(): Route {
  return useSyncExternalStore(subscribe, getSnapshot);
}
