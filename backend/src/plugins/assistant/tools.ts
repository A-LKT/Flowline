// Scope-gated read tools for the assistant agent loop. Unlike the capability
// reference (which reads no user data), these tools DO read the user's artifacts
// — every call is checked against the per-chat scope before touching the db.
import * as db from '../../db';
import { listTables, getColumns } from '../../datastore/queries';

export type ArtifactScope = 'none' | 'all' | { ids: string[] };

export type ChatScope = {
  workflows: ArtifactScope;
  scripts:   ArtifactScope;
  triggers:  ArtifactScope;
  runs:      ArtifactScope;
  tables:    string[];        // table ids whose metadata is readable
};

export const EMPTY_SCOPE: ChatScope = {
  workflows: 'none', scripts: 'none', triggers: 'none', runs: 'none', tables: [],
};

const allowsList = (s: ArtifactScope): boolean => s === 'all' || (typeof s === 'object' && s.ids.length > 0);
const allowsId = (s: ArtifactScope, id: string): boolean =>
  s === 'all' || (typeof s === 'object' && s.ids.includes(id));
const idFilter = (s: ArtifactScope) => (id: string): boolean => allowsId(s, id);

// Runs are granted by short id/prefix (as shown in the Jobs list), so a granted
// value is in scope for a run when it equals or prefixes the run's full id.
const runInScope = (s: ArtifactScope, fullId: string): boolean =>
  s === 'all' || (typeof s === 'object' && s.ids.some((gid) => fullId === gid || fullId.startsWith(gid)));

const notPermitted = (what: string) => ({ error: `Not permitted — this chat has no access to ${what}. Ask the user to grant it in the scope panel.` });

// Resolve a `get_*` argument (which the model often fills with a NAME rather than
// an id) to a concrete id that is actually in scope. It only ever returns an id
// the scope already permits — no scope bypass. Matching order: exact id in scope
// first (also covers ids not yet in the list, e.g. just-created artifacts), then
// a case-insensitive name match among the in-scope items.
function resolveScopedId(items: { id: string; name?: string }[], scope: ArtifactScope, rawArg: string): string | null {
  const arg = rawArg.trim();
  if (!arg) return null;
  if (allowsId(scope, arg)) return arg;
  const lower = arg.toLowerCase();
  const inScope = items.filter((it) => allowsId(scope, it.id));
  return inScope.find((it) => (it.name ?? '').toLowerCase() === lower)?.id ?? null;
}

// Cap on any single serialized field we hand back per node, so one giant output
// (a 5MB HTTP body, a base64 blob) can't blow up the tool result / context.
const FIELD_CAP = 4000;
function capped(v: unknown): unknown {
  if (v === undefined) return undefined;
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  if (s === undefined) return undefined;
  return s.length > FIELD_CAP ? `${s.slice(0, FIELD_CAP)}… [truncated ${s.length - FIELD_CAP} chars]` : v;
}

// Compact run view for troubleshooting. Successful nodes stay terse (id/status);
// failed nodes also carry the config that produced the failure and their output,
// because that is what pins down *why* a node failed (which URL/service, which
// resolved value). The node *type* is not stored on the run — the model reads it
// from the workflow (get_workflow). `resolvedConfig` is already secret-redacted at
// capture time (executor.ts redactSecrets), so it is safe to surface here.
function runSummary(run: NonNullable<ReturnType<typeof db.getRun>>) {
  const nodes = Object.values(run.results ?? {}).map((r) => {
    const base = { nodeId: r.nodeId, status: r.status, error: r.error };
    if (r.status !== 'error') return base;
    return { ...base, resolvedConfig: capped(r.resolvedConfig), output: capped(r.output) };
  });
  return {
    id: run.id, workflowId: run.workflowId, status: run.status,
    triggerType: run.triggerType, startedAt: run.startedAt, finishedAt: run.finishedAt,
    nodes, logs: run.logs ?? [],
  };
}

// ── Proposals ────────────────────────────────────────────────────────────────
// The model proposes an artifact; a human applies it. propose_artifact validates
// structure only (real validation happens on Apply via the normal POST endpoint)
// and records the proposal for the UI — it never mutates anything.

export type ProposalKind = 'workflow' | 'script' | 'trigger';
// `targetId` set ⇒ this proposal UPDATES an existing artifact (applied in place);
// absent ⇒ it CREATES a new one. The backend only ever stores a resolved, in-scope
// id here — never a raw name the model typed.
export type Proposal = { id: string; kind: ProposalKind; summary: string; json: unknown; targetId?: string };

export const PROPOSE_SCHEMA = {
  type: 'function',
  function: {
    name: 'propose_artifact',
    description: 'Offer a workflow, script, or trigger for the user to review. To CREATE a new artifact, omit targetId. To UPDATE an existing one this chat can read, set targetId to its id (discover ids with the matching list_*/get_* tool). Use this instead of pasting JSON in your reply. The user applies it — you never apply it yourself.',
    parameters: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['workflow', 'script', 'trigger'] },
        targetId: { type: 'string', description: 'Id of the existing artifact to update in place. Omit to create a new one. Must be in this chat\'s read scope.' },
        json: { type: 'object', description: 'The full artifact in the documented JSON format (for an update, the complete new definition — not a partial patch).' },
      },
      required: ['kind', 'json'],
    },
  },
} as const;

// Resolve a propose_artifact `targetId` (which the model often fills with a NAME,
// or may hallucinate) to a concrete, in-scope, *existing* artifact id — or null if
// it can't. This is the gate that stops an update proposal from silently no-opping
// on the client: only a real id it's allowed to read gets through. Never widens
// scope. Matches an exact in-scope id first, then a case-insensitive name.
export function resolveProposalTarget(kind: ProposalKind, rawArg: string, scope: ChatScope): string | null {
  const arg = rawArg.trim();
  if (!arg) return null;
  const lower = arg.toLowerCase();
  const pick = (items: { id: string; name?: string }[], s: ArtifactScope, exists: (id: string) => boolean): string | null => {
    if (allowsId(s, arg) && exists(arg)) return arg;
    const m = items.find((it) => allowsId(s, it.id) && (it.name ?? '').toLowerCase() === lower);
    return m ? m.id : null;
  };
  if (kind === 'workflow') return pick(db.getAllWorkflows(), scope.workflows, (id) => !!db.getWorkflow(id));
  if (kind === 'script')   return pick(db.getAllScripts(),   scope.scripts,   (id) => !!db.getScript(id));
  if (kind === 'trigger')  return pick(db.getAllTriggers(),  scope.triggers,  (id) => !!db.getTrigger(id));
  return null;
}

export function validateProposal(kind: string, json: unknown): { ok: boolean; errors?: string[]; summary?: string } {
  const obj = (json ?? {}) as Record<string, unknown>;
  const errors: string[] = [];
  if (kind === 'workflow') {
    if (typeof obj.name !== 'string' || !obj.name) errors.push('workflow.name is required');
    if (!Array.isArray(obj.nodes)) errors.push('workflow.nodes must be an array');
    if (!Array.isArray(obj.edges)) errors.push('workflow.edges must be an array');
    if (errors.length) return { ok: false, errors };
    return { ok: true, summary: `${obj.name as string} — ${(obj.nodes as unknown[]).length} nodes, ${(obj.edges as unknown[]).length} edges` };
  }
  if (kind === 'script') {
    if (typeof obj.name !== 'string' || !obj.name) errors.push('script.name is required');
    if (typeof obj.code !== 'string' || !obj.code) errors.push('script.code is required');
    if (errors.length) return { ok: false, errors };
    return { ok: true, summary: obj.name as string };
  }
  if (kind === 'trigger') {
    if (typeof obj.kind !== 'string' || !obj.kind) errors.push('trigger.kind is required');
    if (typeof obj.config !== 'object' || obj.config === null) errors.push('trigger.config object is required');
    if (errors.length) return { ok: false, errors };
    return { ok: true, summary: `${obj.name ? String(obj.name) + ' — ' : ''}${obj.kind as string}` };
  }
  return { ok: false, errors: [`Unknown artifact kind: ${kind}`] };
}

// OpenAI-style function schemas advertised to the model.
export const TOOL_SCHEMAS = [
  { type: 'function', function: { name: 'list_workflows', description: 'List workflows the chat may read (id, name, description).', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'get_workflow', description: 'Get one workflow (full nodes/edges JSON) by id.', parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } } },
  { type: 'function', function: { name: 'list_scripts', description: 'List scripts the chat may read.', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'get_script', description: 'Get one script by id.', parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } } },
  { type: 'function', function: { name: 'list_triggers', description: 'List triggers the chat may read.', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'get_trigger', description: 'Get one trigger by id.', parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } } },
  { type: 'function', function: { name: 'list_runs', description: 'List the job runs granted to this chat (id, status, workflow, time). Use before get_run when the user has not given a run id.', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'get_run', description: 'Get a job run summary (status, per-node status/errors, logs) by run id (full or the short id shown in the Jobs list) — for review/troubleshooting.', parameters: { type: 'object', properties: { runId: { type: 'string' } }, required: ['runId'] } } },
  { type: 'function', function: { name: 'list_tables', description: 'List data-store tables whose metadata the chat may read.', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'get_table_schema', description: 'Get a data-store table schema (columns, types, keys) by id. Metadata only — no rows.', parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } } },
] as const;

// Execute a tool call. Always returns a JSON-serializable object; never throws
// data across the scope boundary.
export function runTool(name: string, args: Record<string, unknown>, scope: ChatScope): unknown {
  switch (name) {
    case 'list_workflows':
      if (!allowsList(scope.workflows)) return notPermitted('workflows');
      return db.getAllWorkflows().filter((w) => allowsId(scope.workflows, w.id))
        .map((w) => ({ id: w.id, name: w.name, description: w.description, deprecated: !!w.deprecated }));
    case 'get_workflow': {
      const arg = String(args.id ?? '');
      const id = resolveScopedId(db.getAllWorkflows(), scope.workflows, arg);
      if (!id) return notPermitted(`workflow "${arg}"`);
      return db.getWorkflow(id) ?? { error: 'Workflow not found' };
    }
    case 'list_scripts':
      if (!allowsList(scope.scripts)) return notPermitted('scripts');
      return db.getAllScripts().filter((s) => idFilter(scope.scripts)(s.id))
        .map((s) => ({ id: s.id, name: s.name, description: s.description }));
    case 'get_script': {
      const arg = String(args.id ?? '');
      const id = resolveScopedId(db.getAllScripts(), scope.scripts, arg);
      if (!id) return notPermitted(`script "${arg}"`);
      return db.getScript(id) ?? { error: 'Script not found' };
    }
    case 'list_triggers':
      if (!allowsList(scope.triggers)) return notPermitted('triggers');
      return db.getAllTriggers().filter((t) => idFilter(scope.triggers)(t.id))
        .map((t) => ({ id: t.id, name: t.name, kind: t.kind, enabled: t.enabled }));
    case 'get_trigger': {
      const arg = String(args.id ?? '');
      const id = resolveScopedId(db.getAllTriggers(), scope.triggers, arg);
      if (!id) return notPermitted(`trigger "${arg}"`);
      return db.getTrigger(id) ?? { error: 'Trigger not found' };
    }
    case 'list_runs': {
      if (scope.runs === 'none') return notPermitted('runs');
      const runs = scope.runs === 'all'
        ? db.getAllRuns({ limit: 50 })
        : scope.runs.ids.map((gid) => db.getRun(gid) ?? db.getRunByPrefix(gid)).filter((r): r is NonNullable<typeof r> => !!r);
      return runs.map((r) => ({ id: r.id, status: r.status, workflowId: r.workflowId, triggerType: r.triggerType, createdAt: r.createdAt }));
    }
    case 'get_run': {
      const q = String(args.runId ?? '').trim();
      if (!q) return { error: 'runId is required' };
      // Accept a full id or the short prefix shown in the Jobs list.
      const run = db.getRun(q) ?? db.getRunByPrefix(q);
      if (!run) return { error: 'Run not found' };
      if (!runInScope(scope.runs, run.id)) return notPermitted(`run ${q}`);
      return runSummary(run);
    }
    case 'list_tables':
      if (scope.tables.length === 0) return notPermitted('data-store tables');
      return listTables().filter((t) => scope.tables.includes(t.id)).map((t) => ({ id: t.id, name: t.name, rowCount: t.rowCount }));
    case 'get_table_schema': {
      const id = String(args.id ?? '');
      if (!scope.tables.includes(id)) return notPermitted(`table ${id}`);
      return { id, columns: getColumns(id).map((c) => ({ name: c.name, type: c.colType, isKey: c.isKey })) };
    }
    default:
      return { error: `Unknown tool: ${name}` };
  }
}
