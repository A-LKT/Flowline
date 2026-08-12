import { useEffect, useRef, useState, useCallback } from 'react';
import { Sparkles, Send, SlidersHorizontal, Wrench, Check, ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { AppHeader } from '../../components/AppHeader';
import { navigate, navigateReplace, formatRoute } from '../../state/route';
import type { Route } from '../../state/route';
import { useWorkflowStore } from '../../state/workflowStore';
import { useScriptStore } from '../../state/scriptStore';
import { useTriggerStore } from '../../state/triggerStore';
import type { Workflow } from '../../types/workflow';
import type { Script } from '../../types/script';
import type { Trigger, TriggerTarget } from '../../types/trigger';

type Props = { onHome: () => void; troubleshootRunId?: string };

type Role = 'user' | 'assistant';
type ToolTrace = { name: string; permitted: boolean };
type ProposalKind = 'workflow' | 'script' | 'trigger';
// `targetId` present ⇒ the proposal updates that existing artifact in place;
// absent ⇒ it creates a new one.
type Proposal = { id: string; kind: ProposalKind; summary: string; json: unknown; targetId?: string };
type Message = { role: Role; content: string; trace?: ToolTrace[]; proposals?: Proposal[] };

type Provider = { id: string; configured: boolean; models: string[]; secretKey: string };
type ChatSummary = { id: string; title: string; provider: string | null; model: string | null; updatedAt: number };

type ArtifactScope = 'none' | 'all' | { ids: string[] };
type ArtifactKey = 'workflows' | 'scripts' | 'triggers' | 'runs';
type Scope = { workflows: ArtifactScope; scripts: ArtifactScope; triggers: ArtifactScope; runs: ArtifactScope; tables: string[] };
const EMPTY_SCOPE: Scope = { workflows: 'none', scripts: 'none', triggers: 'none', runs: 'none', tables: [] };
// Workflows/scripts/triggers offer a checklist ('list'); runs are too numerous to
// list, so specific runs are entered as comma-separated ids ('text').
const ARTIFACT_TYPES: { key: ArtifactKey; label: string; picker: 'list' | 'text' }[] = [
  { key: 'workflows', label: 'Workflows', picker: 'list' },
  { key: 'scripts',   label: 'Scripts',   picker: 'list' },
  { key: 'triggers',  label: 'Triggers',  picker: 'list' },
  { key: 'runs',      label: 'Job runs',  picker: 'text' },
];
const parseIds = (raw: string): string[] => [...new Set(raw.split(',').map((s) => s.trim()).filter(Boolean))];

// A proposed trigger targets the workflow the assistant proposed alongside it,
// which has no real id until *its* proposal is applied — so the model fills
// target.id with the workflow's NAME. Resolve it to a real workflow id at Apply
// time (the store now includes the just-applied workflow): exact id first, then a
// case-insensitive name match. Throws an actionable error if it can't resolve, so
// we never send a dangling target (the backend rejects one too). Non-workflow
// targets pass through untouched.
function resolveTriggerTarget(target: unknown): TriggerTarget {
  const t = (target ?? {}) as { type?: string; id?: string };
  if (t.type !== 'workflow') return t as TriggerTarget;
  const raw = (t.id ?? '').trim();
  if (!raw) throw new Error('The proposed trigger has no target workflow.');
  const workflows = useWorkflowStore.getState().workflows;
  const match = workflows.find((w) => w.id === raw)
    ?? workflows.find((w) => w.name.toLowerCase() === raw.toLowerCase());
  if (!match) throw new Error(`No workflow named "${raw}" found — apply the workflow first, then apply this trigger.`);
  return { type: 'workflow', id: match.id };
}
type ArtifactItem = { id: string; name: string };
const scopeMode = (v: ArtifactScope): 'none' | 'some' | 'all' => (v === 'all' ? 'all' : typeof v === 'object' ? 'some' : 'none');
const isGranted = (v: ArtifactScope): boolean => v === 'all' || (typeof v === 'object' && v.ids.length > 0);

export const AssistantView = ({ onHome, troubleshootRunId }: Props) => {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [tables, setTables]       = useState<{ id: string; name: string }[]>([]);
  const [lists, setLists]         = useState<{ workflows: ArtifactItem[]; scripts: ArtifactItem[]; triggers: ArtifactItem[] }>({ workflows: [], scripts: [], triggers: [] });
  const [chats, setChats]         = useState<ChatSummary[]>([]);
  const [chatId, setChatId]       = useState<string | null>(null);

  const [messages, setMessages]   = useState<Message[]>([]);
  const [provider, setProviderState] = useState('');
  const [model, setModelState]    = useState('');
  const [scope, setScope]         = useState<Scope>(EMPTY_SCOPE);
  const [runsText, setRunsText]   = useState('');   // raw comma-separated run ids
  const [scopeOpen, setScopeOpen] = useState(false);
  const [draft, setDraft]         = useState('');
  const [busy, setBusy]           = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [applied, setApplied]     = useState<Record<string, string>>({});

  const importWorkflow  = useWorkflowStore((s) => s.importWorkflow);
  const restoreWorkflow = useWorkflowStore((s) => s.restoreWorkflow);
  const importScript    = useScriptStore((s) => s.importScript);
  const updateScript    = useScriptStore((s) => s.updateScript);
  const createTrigger   = useTriggerStore((s) => s.createTrigger);
  const updateTrigger   = useTriggerStore((s) => s.updateTrigger);

  const threadRef = useRef<HTMLDivElement>(null);

  const refreshChats = useCallback(async () => {
    const list = await fetch('/assistant/chats').then((r) => (r.ok ? r.json() as Promise<ChatSummary[]> : [])).catch(() => []);
    setChats(list);
    return list;
  }, []);

  const patchChat = useCallback((id: string, patch: Record<string, unknown>) => {
    void fetch(`/assistant/chats/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) })
      .then(() => refreshChats());
  }, [refreshChats]);

  const loadChat = useCallback(async (id: string, provs: Provider[]) => {
    const res = await fetch(`/assistant/chats/${id}`);
    if (!res.ok) return;
    const { chat, messages: msgs } = await res.json() as { chat: { id: string; provider: string | null; model: string | null; scope: Scope }; messages: Message[] };
    const loadedScope = chat.scope ?? EMPTY_SCOPE;
    setChatId(chat.id);
    setMessages(msgs.map((m) => ({ role: m.role, content: m.content, trace: m.trace, proposals: m.proposals })));
    setScope(loadedScope);
    setRunsText(typeof loadedScope.runs === 'object' ? loadedScope.runs.ids.join(', ') : '');
    setError(null);
    // Resolve provider/model, defaulting to the first configured provider.
    const configured = provs.filter((p) => p.configured);
    let prov = chat.provider && configured.some((p) => p.id === chat.provider) ? chat.provider : (configured[0]?.id ?? '');
    const models = provs.find((p) => p.id === prov)?.models ?? [];
    const mdl = chat.model && models.includes(chat.model) ? chat.model : (models[0] ?? '');
    setProviderState(prov);
    setModelState(mdl);
    if (prov && (chat.provider !== prov || chat.model !== mdl)) patchChat(chat.id, { provider: prov, model: mdl });
  }, [patchChat]);

  // Bootstrap: providers + tables + chat list; ensure at least one chat. Guarded
  // to run exactly once per mount: the ref survives StrictMode's dev double-invoke
  // (same fiber), and it no-ops the re-render triggered when we clear ?run= below.
  // NB: no `cancelled` abort here — under StrictMode a cancel flag would abort the
  // first pass while the ref blocks the second, so nothing would run.
  const bootstrappedRef = useRef(false);
  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    void (async () => {
      const [provs, tbls, list] = await Promise.all([
        fetch('/assistant/providers').then((r) => (r.ok ? r.json() as Promise<Provider[]> : [])).catch(() => []),
        fetch('/datastore/tables').then((r) => (r.ok ? r.json() as Promise<{ id: string; name: string }[]> : [])).catch(() => []),
        fetch('/assistant/chats').then((r) => (r.ok ? r.json() as Promise<ChatSummary[]> : [])).catch(() => []),
      ]);
      setProviders(provs);
      setTables(tbls);
      const defProv = provs.find((p) => p.configured);

      // Troubleshoot entry point (#/assistant?run=<id>): open a fresh chat
      // pre-scoped to that run AND its parent workflow — an explicit, visible
      // grant (the scope panel shows Runs · 1 and Workflows · 1), so the copilot
      // can inspect the failing node's config and identify its type immediately.
      if (troubleshootRunId) {
        const run = await fetch(`/runs/${troubleshootRunId}`).then((r) => (r.ok ? r.json() as Promise<{ workflowId?: string }> : null)).catch(() => null);
        const short = troubleshootRunId.slice(0, 8);
        const created = await fetch('/assistant/chats', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: defProv?.id, model: defProv?.models[0], title: `Troubleshoot run ${short}` }) })
          .then((r) => r.json() as Promise<ChatSummary>);
        const preScope: Scope = {
          ...EMPTY_SCOPE,
          runs: { ids: [troubleshootRunId] },
          ...(run?.workflowId ? { workflows: { ids: [run.workflowId] } } : {}),
        };
        await fetch(`/assistant/chats/${created.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope: preScope, title: `Troubleshoot run ${short}` }) }).catch(() => {});
        await refreshChats();
        await loadChat(created.id, provs);   // reads the patched scope back from the server
        setDraft(`Troubleshoot the failed run ${short}. Which node failed, why, and what is the smallest fix?`);
        navigateReplace({ space: 'assistant' });   // drop ?run= so a refresh doesn't spawn a duplicate chat
        return;
      }

      if (list.length === 0) {
        const created = await fetch('/assistant/chats', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: defProv?.id, model: defProv?.models[0] }) })
          .then((r) => r.json() as Promise<ChatSummary>);
        setChats([created]);
        void loadChat(created.id, provs);
      } else {
        setChats(list);
        void loadChat(list[0].id, provs);
      }
    })();
  }, [loadChat, troubleshootRunId, refreshChats]);

  // Artifact lists for the individual-scope pickers.
  useEffect(() => {
    const grab = (url: string) => fetch(url).then((r) => (r.ok ? r.json() as Promise<{ id: string; name: string }[]> : [])).catch(() => []);
    void Promise.all([grab('/workflows'), grab('/scripts'), grab('/triggers')]).then(([w, s, t]) => {
      setLists({
        workflows: w.map((x) => ({ id: x.id, name: x.name })),
        scripts:   s.map((x) => ({ id: x.id, name: x.name })),
        triggers:  t.map((x) => ({ id: x.id, name: x.name })),
      });
    });
  }, []);

  useEffect(() => {
    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [messages, busy]);

  const activeProvider = providers.find((p) => p.id === provider);
  const canSend = !!chatId && !!provider && !!activeProvider?.configured && !!model && draft.trim().length > 0 && !busy;

  const grantCount = ARTIFACT_TYPES.filter((t) => isGranted(scope[t.key])).length + scope.tables.length;

  const selectProvider = (id: string) => {
    setProviderState(id);
    const models = providers.find((p) => p.id === id)?.models ?? [];
    const mdl = models[0] ?? '';
    setModelState(mdl);
    if (chatId) patchChat(chatId, { provider: id, model: mdl });
  };
  const selectModel = (m: string) => { setModelState(m); if (chatId) patchChat(chatId, { model: m }); };
  const updateScope = (next: Scope) => { setScope(next); if (chatId) patchChat(chatId, { scope: next }); };

  // After the user applies a proposal, grant this chat read access to the thing
  // it just created so the copilot can immediately reason about it. Leaves an
  // 'all' grant untouched; a 'none' grant is promoted to a specific-id grant.
  const grantArtifactId = (key: 'workflows' | 'scripts' | 'triggers', id: string) => {
    setScope((cur) => {
      const v = cur[key];
      if (v === 'all') return cur;
      const ids = typeof v === 'object' ? v.ids : [];
      if (ids.includes(id)) return cur;
      const next: Scope = { ...cur, [key]: { ids: [...ids, id] } };
      if (chatId) patchChat(chatId, { scope: next });
      return next;
    });
  };

  const newChat = async () => {
    const defProv = providers.find((p) => p.configured);
    const created = await fetch('/assistant/chats', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: provider || defProv?.id, model: model || defProv?.models[0] }) })
      .then((r) => r.json() as Promise<ChatSummary>);
    await refreshChats();
    void loadChat(created.id, providers);
  };

  const removeChat = async (id: string) => {
    await fetch(`/assistant/chats/${id}`, { method: 'DELETE' });
    const list = await refreshChats();
    if (id === chatId) {
      if (list[0]) void loadChat(list[0].id, providers);
      else void newChat();
    }
  };

  const send = async () => {
    if (!canSend || !chatId) return;
    const content = draft.trim();
    setMessages((m) => [...m, { role: 'user', content }]);
    setDraft('');
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/assistant/chats/${chatId}/messages`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json() as { assistant: { content: string; trace?: ToolTrace[]; proposals?: Proposal[] } };
      setMessages((m) => [...m, { role: 'assistant', content: data.assistant.content, trace: data.assistant.trace, proposals: data.assistant.proposals }]);
      void refreshChats();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); }
  };

  const applyProposal = async (p: Proposal) => {
    const now = Date.now();
    const j = (p.json ?? {}) as Record<string, unknown>;
    // targetId (resolved server-side to a real, in-scope id) drives update vs create.
    // It's authoritative — any id the model tucked into json is ignored.
    const targetId = p.targetId;

    // Apply-in-a-new-tab: reserve the tab synchronously inside the click gesture
    // (so it isn't popup-blocked), run `persist`, then point the tab at `route` —
    // a cold tab load reads the artifact from the backend and would bounce if it
    // isn't saved yet, so `persist` must have landed the save (and must throw if it
    // didn't). On failure the reserved tab is closed and the error rethrown (the
    // outer catch surfaces it on the card). Popup blocked → same-tab navigate.
    const applyInNewTab = async (persist: () => Promise<void>, route: Route) => {
      const win = window.open('', '_blank');
      try {
        await persist();
      } catch (err) {
        win?.close();  // don't leave an orphaned blank tab on a failed apply
        throw err;
      }
      setApplied((a) => ({ ...a, [p.id]: '' }));
      const href = `${window.location.pathname}${window.location.search}${formatRoute(route)}`;
      if (win) win.location.href = href;
      else navigate(route);  // popup blocked → fall back to this tab
    };

    try {
      if (p.kind === 'workflow') {
        const nodes = (Array.isArray(j.nodes) ? j.nodes : []) as Workflow['nodes'];
        const edges = (Array.isArray(j.edges) ? j.edges : []) as Workflow['edges'];
        if (targetId) {
          // Update in place: overwrite the existing workflow (keeps id/createdAt,
          // bumps version) via restoreWorkflow, then open it.
          const existing = useWorkflowStore.getState().workflows.find((w) => w.id === targetId);
          if (!existing) throw new Error('The workflow to update no longer exists');
          if (existing.deprecated) throw new Error('That workflow is deprecated and cannot be edited');
          const data: Workflow = {
            ...existing,
            name: (j.name as string) || existing.name,
            description: (j.description as string) ?? existing.description,
            nodes, edges,
            variables: (j.variables as Record<string, unknown>) ?? existing.variables ?? {},
            layoutDirection: j.layoutDirection === 'LR' ? 'LR' : j.layoutDirection === 'TB' ? 'TB' : existing.layoutDirection,
          };
          await applyInNewTab(async () => {
            await restoreWorkflow(targetId, data);
            // restoreWorkflow swallows a failed save into backendOffline (and the POST
            // 409s on a deprecated workflow) — don't claim success if it didn't land.
            if (useWorkflowStore.getState().backendOffline) throw new Error('Could not save the updated workflow');
            grantArtifactId('workflows', targetId);
          }, { space: 'workflows', workflowId: targetId });
          return;
        }
        const wf: Workflow = {
          id: crypto.randomUUID(),
          name: (j.name as string) || 'Generated Workflow',
          description: (j.description as string) ?? '',
          version: 1,
          nodes, edges,
          variables: (j.variables as Record<string, unknown>) ?? {},
          layoutDirection: j.layoutDirection === 'LR' ? 'LR' : 'TB',
          createdAt: now, updatedAt: now,
        };
        await applyInNewTab(async () => {
          await importWorkflow(wf);
          // importWorkflow swallows a save failure into backendOffline — if the POST
          // didn't land, the cold tab would bounce off the missing workflow, so bail.
          if (useWorkflowStore.getState().backendOffline) throw new Error('Could not save the generated workflow');
          grantArtifactId('workflows', wf.id);
        }, { space: 'workflows', workflowId: wf.id });
      } else if (p.kind === 'script') {
        if (targetId) {
          const existing = useScriptStore.getState().scripts.find((s) => s.id === targetId);
          if (!existing) throw new Error('The script to update no longer exists');
          // Fall back to the existing value for every optional field the model
          // omitted — updateScript spreads the patch, so an `undefined` here would
          // ERASE a real setting (e.g. a code-only edit unsandboxing the script and
          // dropping its deps). `??` still lets the model clear one explicitly.
          updateScript(targetId, {
            name: (j.name as string) || existing.name,
            description: (j.description as string | undefined) ?? existing.description,
            code: (j.code as string) ?? existing.code,
            timeout: typeof j.timeout === 'number' ? j.timeout : existing.timeout,
            inputs: Array.isArray(j.inputs) ? j.inputs as Script['inputs'] : existing.inputs,
            sandbox: (j.sandbox as boolean | undefined) ?? existing.sandbox,
            dockerImage: (j.dockerImage as string | undefined) ?? existing.dockerImage,
            npmInstall: (j.npmInstall as string | undefined) ?? existing.npmInstall,
          });
          grantArtifactId('scripts', targetId);
          setApplied((a) => ({ ...a, [p.id]: '' }));
          navigate({ space: 'scripts', scriptId: targetId });
          return;
        }
        const sc: Script = {
          id: crypto.randomUUID(),
          name: (j.name as string) || 'Generated Script',
          description: j.description as string | undefined,
          code: (j.code as string) ?? '',
          timeout: typeof j.timeout === 'number' ? j.timeout : 300,
          inputs: Array.isArray(j.inputs) ? j.inputs as Script['inputs'] : undefined,
          sandbox: j.sandbox as boolean | undefined,
          dockerImage: j.dockerImage as string | undefined,
          npmInstall: j.npmInstall as string | undefined,
          createdAt: now, updatedAt: now,
        };
        importScript(sc);
        grantArtifactId('scripts', sc.id);
        setApplied((a) => ({ ...a, [p.id]: '' }));
        navigate({ space: 'scripts', scriptId: sc.id });
      } else {
        if (targetId) {
          const existing = useTriggerStore.getState().triggers.find((t) => t.id === targetId);
          if (!existing) throw new Error('The trigger to update no longer exists');
          // targetId is authoritative — drop any identity/timestamp fields the model
          // put in json so they can't override the real record.
          const patch = { ...j };
          delete patch.id; delete patch.createdAt; delete patch.updatedAt;
          await applyInNewTab(async () => {
            await updateTrigger(targetId, patch as Partial<Trigger>);
            grantArtifactId('triggers', targetId);
          }, { space: 'triggers' });
          return;
        }
        // Resolve target.id (a workflow NAME from the model) to a real id before
        // reserving the tab — a resolution failure should surface as an error, not a
        // blank tab. See resolveTriggerTarget (throws if the workflow isn't applied yet).
        const target = resolveTriggerTarget(j.target);
        await applyInNewTab(async () => {
          const created = await createTrigger({ ...j, target } as Omit<Trigger, 'id' | 'createdAt' | 'updatedAt'>);
          grantArtifactId('triggers', created.id);
        }, { space: 'triggers' });
      }
    } catch (err) {
      setApplied((a) => ({ ...a, [p.id]: err instanceof Error ? err.message : 'Apply failed' }));
    }
  };

  return (
    <div className="app-shell">
      <AppHeader
        onHome={onHome}
        icon={<Sparkles size={14} style={{ color: 'var(--purple)' }} />}
        title="Assistant"
        badge={<span className="header-badge" style={{ background: 'var(--purple)', color: '#fff' }}>Premium</span>}
      >
        {providers.length > 0 && (
          <>
            <select className="jobs-filter-select" value={provider} onChange={(e) => selectProvider(e.target.value)} title="LLM provider">
              {providers.map((p) => (
                <option key={p.id} value={p.id} disabled={!p.configured}>{p.id}{p.configured ? '' : ' (no key)'}</option>
              ))}
            </select>
            <select className="jobs-filter-select" value={model} onChange={(e) => selectModel(e.target.value)} title="Model">
              {(activeProvider?.models ?? []).map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </>
        )}
        <button
          className={`btn-secondary btn-sm${scopeOpen ? ' col-picker-btn--active' : ''}`}
          onClick={() => setScopeOpen((v) => !v)}
          title="Grant this chat read access to your artifacts"
        >
          <SlidersHorizontal size={13} /> Scope{grantCount > 0 ? ` (${grantCount})` : ''}
        </button>
      </AppHeader>

      <div className="assistant-shell">
        {/* Chat list */}
        <div className="assistant-sidebar">
          <div className="assistant-sidebar-header">
            <span className="assistant-sidebar-title">Chats</span>
            <button className="btn-primary btn-sm" onClick={() => void newChat()}><Plus size={12} strokeWidth={2.5} /> New</button>
          </div>
          <div className="assistant-chat-list">
            {chats.map((c) => (
              <div
                key={c.id}
                className={`assistant-chat-item${c.id === chatId ? ' assistant-chat-item--active' : ''}`}
                onClick={() => void loadChat(c.id, providers)}
              >
                <span className="assistant-chat-title">{c.title}</span>
                <button
                  className="assistant-chat-delete"
                  onClick={(e) => { e.stopPropagation(); void removeChat(c.id); }}
                  title="Delete chat"
                >
                  <Trash2 size={12} strokeWidth={2} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Main */}
        <div className="assistant-view">
          {scopeOpen && (
            <div className="assistant-scope">
              <div className="assistant-scope-intro">
                What this chat may <strong>read</strong>. Default is nothing — grant only what the copilot needs.
              </div>
              <div className="assistant-scope-grid">
                {ARTIFACT_TYPES.map((t) => {
                  const val  = scope[t.key];
                  const mode = scopeMode(val);
                  const selectedIds = typeof val === 'object' ? val.ids : [];
                  const items: ArtifactItem[] = t.key === 'runs' ? [] : lists[t.key];
                  return (
                    <div key={t.key} className="assistant-scope-block">
                      <div className="assistant-scope-row">
                        <span className="assistant-scope-label">
                          {t.label}
                          {mode === 'some' && <span className="assistant-scope-count"> · {selectedIds.length}</span>}
                        </span>
                        <div className="assistant-scope-seg">
                          <button className={`assistant-seg-btn${mode === 'none' ? ' assistant-seg-btn--on' : ''}`} onClick={() => { updateScope({ ...scope, [t.key]: 'none' }); if (t.key === 'runs') setRunsText(''); }}>None</button>
                          <button className={`assistant-seg-btn${mode === 'some' ? ' assistant-seg-btn--on' : ''}`} onClick={() => updateScope({ ...scope, [t.key]: { ids: selectedIds } })}>Some</button>
                          <button className={`assistant-seg-btn${mode === 'all' ? ' assistant-seg-btn--on' : ''}`} onClick={() => updateScope({ ...scope, [t.key]: 'all' })}>All</button>
                        </div>
                      </div>
                      {mode === 'some' && t.picker === 'list' && (
                        <div className="assistant-scope-picklist">
                          {items.length === 0 ? (
                            <span className="assistant-scope-note">None available.</span>
                          ) : items.map((it) => (
                            <label key={it.id} className="assistant-scope-pick">
                              <input
                                type="checkbox"
                                checked={selectedIds.includes(it.id)}
                                onChange={() => updateScope({ ...scope, [t.key]: { ids: selectedIds.includes(it.id) ? selectedIds.filter((x) => x !== it.id) : [...selectedIds, it.id] } })}
                              />
                              {it.name}
                            </label>
                          ))}
                        </div>
                      )}
                      {mode === 'some' && t.picker === 'text' && (
                        <input
                          className="assistant-scope-text"
                          type="text"
                          placeholder="Run ids, comma-separated (e.g. 48a2ae87, 9f13bc02)"
                          value={runsText}
                          onChange={(e) => { setRunsText(e.target.value); updateScope({ ...scope, runs: { ids: parseIds(e.target.value) } }); }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
              {tables.length > 0 && (
                <div className="assistant-scope-tables">
                  <span className="assistant-scope-label">Data table schemas</span>
                  <div className="assistant-scope-chips">
                    {tables.map((t) => (
                      <button
                        key={t.id}
                        className={`jobs-chip${scope.tables.includes(t.id) ? ' jobs-chip--on' : ''}`}
                        onClick={() => updateScope({ ...scope, tables: scope.tables.includes(t.id) ? scope.tables.filter((x) => x !== t.id) : [...scope.tables, t.id] })}
                      >
                        {t.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="assistant-scope-note">Metadata only for tables (columns/types) — never row data.</div>
            </div>
          )}

          <div className="assistant-thread" ref={threadRef}>
            {messages.length === 0 ? (
              <div className="assistant-empty">
                <Sparkles size={28} strokeWidth={1.5} />
                <p className="assistant-empty-title">Workflow Copilot</p>
                <p className="assistant-empty-hint">
                  Ask it to generate a workflow or script, or grant it a run to troubleshoot.
                  It only uses node types this engine can actually run.
                </p>
              </div>
            ) : (
              messages.map((m, i) => (
                <div key={i} className={`assistant-msg assistant-msg--${m.role}`}>
                  <div className="assistant-msg-role">{m.role === 'user' ? 'You' : 'Copilot'}</div>
                  {m.trace && m.trace.length > 0 && (
                    <div className="assistant-trace">
                      <Wrench size={11} strokeWidth={2} />
                      {m.trace.map((t, j) => (
                        <span key={j} className={`assistant-trace-tool${t.permitted ? '' : ' assistant-trace-tool--denied'}`}>
                          {t.name}{t.permitted ? '' : ' (denied)'}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="assistant-msg-body">{m.content}</div>
                  {m.proposals?.map((p) => (
                    <ProposalCard
                      key={p.id}
                      proposal={p}
                      targetName={p.targetId ? lists[`${p.kind}s` as 'workflows' | 'scripts' | 'triggers'].find((x) => x.id === p.targetId)?.name : undefined}
                      applied={applied[p.id]}
                      onApply={() => void applyProposal(p)}
                    />
                  ))}
                </div>
              ))
            )}
            {busy && <div className="assistant-msg assistant-msg--assistant"><div className="assistant-msg-role">Copilot</div><div className="assistant-msg-body assistant-thinking">Thinking…</div></div>}
          </div>

          {error && <div className="assistant-error">{error}</div>}
          {activeProvider && !activeProvider.configured && (
            <div className="assistant-error">
              No API key for {activeProvider.id}. Add <code>{activeProvider.secretKey}</code> in the Secrets panel.
            </div>
          )}

          <div className="assistant-input-row">
            <textarea
              className="assistant-input"
              placeholder={provider ? 'Ask the copilot…  (Enter to send, Shift+Enter for newline)' : 'Configure an LLM provider key in Secrets to begin'}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              rows={2}
              disabled={busy || !provider}
            />
            <button className="btn-primary assistant-send" onClick={() => void send()} disabled={!canSend} title="Send (Enter)">
              <Send size={14} strokeWidth={2} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// A proposed artifact rendered as a review/apply card. When `proposal.targetId`
// is set the proposal replaces an existing artifact, so the card reads "Update".
function ProposalCard({ proposal, targetName, applied, onApply }: { proposal: Proposal; targetName?: string; applied: string | undefined; onApply: () => void }) {
  const [open, setOpen] = useState(false);
  const isApplied = applied === '';
  const error = applied && applied.length > 0 ? applied : null;
  const isUpdate = !!proposal.targetId;
  const kindLabel = proposal.kind[0].toUpperCase() + proposal.kind.slice(1);
  return (
    <div className="assistant-proposal">
      <div className="assistant-proposal-head">
        <span className={`badge assistant-proposal-kind assistant-proposal-kind--${proposal.kind}`}>{kindLabel}</span>
        <span className="assistant-proposal-summary">
          {proposal.summary}
          {isUpdate && <span className="assistant-proposal-target"> · updates {targetName ?? 'existing'}</span>}
        </span>
        <button className="assistant-proposal-preview" onClick={() => setOpen((v) => !v)}>
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />} Preview
        </button>
        {isApplied ? (
          <span className="assistant-proposal-applied"><Check size={13} strokeWidth={2.5} /> {isUpdate ? 'Updated' : 'Applied'}</span>
        ) : (
          <button className="btn-primary btn-sm" onClick={onApply}>{isUpdate ? 'Update' : 'Apply'}</button>
        )}
      </div>
      {error && <div className="assistant-error" style={{ padding: '4px 0' }}>{error}</div>}
      {open && <pre className="assistant-proposal-json">{JSON.stringify(proposal.json, null, 2)}</pre>}
    </div>
  );
}

// Fallback shown if a non-premium build deep-links to #/assistant.
export const AssistantLocked = ({ onHome }: Props) => (
  <div className="app-shell">
    <AppHeader onHome={onHome} />
    <div className="assistant-view">
      <div className="assistant-empty">
        <Sparkles size={28} strokeWidth={1.5} />
        <p className="assistant-empty-title">Assistant is a premium feature</p>
        <p className="assistant-empty-hint">Enable the premium edition to use the Workflow Copilot.</p>
        <button className="btn-primary" onClick={() => navigate({ space: 'home' })}>← Back home</button>
      </div>
    </div>
  </div>
);
