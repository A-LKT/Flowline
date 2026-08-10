import { useCallback, useEffect, useRef, useState } from 'react';
import { AppHeader } from '../../components/AppHeader';
import MonacoEditor, { type Monaco } from '@monaco-editor/react';
import { Trash2, Plus, X, Save, ChevronDown, ChevronRight, Upload, Clock } from 'lucide-react';
import { useScriptStore } from '../../state/scriptStore';
import { useSettingsStore } from '../../state/settingsStore';
import { useEditionStore } from '../../state/editionStore';
import { buildExtraLib } from '../../engine/monacoCompletions';
import { useSecretsStore } from '../../state/secretsStore';
import { navigate, navigateReplace } from '../../state/route';
import { ArtifactHistoryModal } from '../../components/ArtifactHistoryModal';
import type { Script, ScriptInput, ScriptInputType } from '../../types/script';

type Props = { scriptId?: string; onHome: () => void };

type Draft = Pick<Script, 'name' | 'description' | 'code' | 'timeout' | 'sandbox' | 'dockerImage' | 'npmInstall' | 'inputs'>;

const fmtTime = (ts: number) => {
  const d = Date.now() - ts;
  if (d < 60_000)    return 'just now';
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h ago`;
  return new Date(ts).toLocaleDateString();
};

const toDraft = (s: Script): Draft => ({
  name:        s.name,
  description: s.description ?? '',
  code:        s.code,
  timeout:     s.timeout,
  sandbox:     s.sandbox ?? false,
  dockerImage: s.dockerImage ?? '',
  npmInstall:  s.npmInstall ?? '',
  inputs:      s.inputs ?? [],
});

export const ScriptEditorView = ({ scriptId, onHome }: Props) => {
  const editorFontSize = useSettingsStore((s) => s.editorFontSize);
  const theme          = useSettingsStore((s) => s.theme);
  const secretNames    = useSecretsStore((s) => s.names);

  const scripts      = useScriptStore((s) => s.scripts);
  const addScript    = useScriptStore((s) => s.addScript);
  const importScript = useScriptStore((s) => s.importScript);
  const updateScript = useScriptStore((s) => s.updateScript);
  const removeScript = useScriptStore((s) => s.removeScript);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // The selected script lives in the URL (#/scripts/<id>).
  const selectedId = scriptId ?? null;
  const selected = scripts.find((s) => s.id === selectedId) ?? null;

  const historyEnabled = useEditionStore((s) => s.features.artifactHistory);

  const [draft, setDraft] = useState<Draft | null>(selected ? toDraft(selected) : null);
  const [isDirty, setIsDirty] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [sandboxExpanded, setSandboxExpanded] = useState(false);
  const [inputsExpanded, setInputsExpanded] = useState(false);

  // Reset draft when the selected script changes
  useEffect(() => {
    setDraft(selected ? toDraft(selected) : null);
    setIsDirty(false);
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Deep-linked to a script that no longer exists → correct the URL so it
  // never desyncs from what's shown.
  useEffect(() => {
    if (selectedId && !scripts.find((s) => s.id === selectedId)) {
      navigateReplace({ space: 'scripts', scriptId: scripts[0]?.id });
    }
  }, [scripts, selectedId]);

  // Window title
  useEffect(() => {
    document.title = selected ? `${isDirty ? '● ' : ''}script: ${draft?.name ?? selected.name}` : 'Flowline';
    return () => { document.title = 'Flowline'; };
  }, [selected?.id, draft?.name, isDirty]);

  const patch = (p: Partial<Draft>) => {
    setDraft((d) => d ? { ...d, ...p } : d);
    setIsDirty(true);
  };

  const save = useCallback(() => {
    if (!selectedId || !draft) return;
    updateScript(selectedId, {
      name:        draft.name.trim() || 'Untitled',
      description: draft.description || undefined,
      code:        draft.code,
      timeout:     draft.timeout,
      sandbox:     draft.sandbox,
      dockerImage: draft.dockerImage || undefined,
      npmInstall:  draft.npmInstall || undefined,
      inputs:      draft.inputs,
    });
    setIsDirty(false);
  }, [selectedId, draft, updateScript]);

  // Ctrl+S / Cmd+S
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (isDirty) save();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isDirty, save]);

  // Monaco lib registration
  const monacoRef    = useRef<Monaco | null>(null);
  const libHandleRef = useRef<{ dispose(): void } | null>(null);

  const registerLib = useCallback((monaco: Monaco) => {
    libHandleRef.current?.dispose();
    libHandleRef.current = monaco.languages.typescript.javascriptDefaults.addExtraLib(
      buildExtraLib([], secretNames),
      'ts:workflow-context.d.ts',
    );
  }, [secretNames]);

  const handleMount = useCallback(
    (_editor: unknown, monaco: Monaco) => {
      monacoRef.current = monaco;
      registerLib(monaco);
    },
    [registerLib],
  );

  useEffect(() => () => { libHandleRef.current?.dispose(); }, []);

  const handleNew = () => {
    const id = addScript();
    navigate({ space: 'scripts', scriptId: id });
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string) as Partial<Script>;
        if (typeof parsed.code !== 'string' || !parsed.name) {
          throw new Error('Not a valid script file');
        }
        const now = Date.now();
        // Preserve name exactly — workflow Script nodes reference scripts by name.
        const imported: Script = {
          id:          crypto.randomUUID(),
          name:        parsed.name,
          description: parsed.description,
          code:        parsed.code,
          timeout:     typeof parsed.timeout === 'number' ? parsed.timeout : 300,
          inputs:      Array.isArray(parsed.inputs) ? parsed.inputs : undefined,
          sandbox:     parsed.sandbox ?? undefined,
          dockerImage: parsed.dockerImage || undefined,
          npmInstall:  parsed.npmInstall || undefined,
          createdAt:   now,
          updatedAt:   now,
        };
        importScript(imported);
        navigate({ space: 'scripts', scriptId: imported.id });
      } catch {
        window.alert('Could not import: the file is not a valid script JSON (needs at least "name" and "code").');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleAddInput = () => {
    patch({ inputs: [...(draft?.inputs ?? []), { name: '', type: 'string' }] });
  };

  const handleUpdateInput = (i: number, inp: ScriptInput) => {
    patch({ inputs: (draft?.inputs ?? []).map((x, idx) => (idx === i ? inp : x)) });
  };

  const handleRemoveInput = (i: number) => {
    patch({ inputs: (draft?.inputs ?? []).filter((_, idx) => idx !== i) });
  };

  const handleDelete = (id: string) => {
    const script = scripts.find((s) => s.id === id);
    if (!window.confirm(`Delete script "${script?.name ?? 'this script'}"?`)) return;
    removeScript(id);
    if (selectedId === id) {
      const remaining = scripts.filter((s) => s.id !== id);
      navigate({ space: 'scripts', scriptId: remaining[0]?.id });
    }
  };

  const handleSelectScript = (id: string) => {
    if (id === selectedId) return;
    // Save current draft before switching if dirty
    if (isDirty && draft && selectedId) save();
    navigate({ space: 'scripts', scriptId: id });
  };

  return (
    <div className="app-shell">
      {/* Toolbar */}
      <AppHeader onHome={onHome} title="Scripts">
        {historyEnabled && selected && (
          <button className="btn-secondary btn-sm" onClick={() => setHistoryOpen(true)} title="Version history">
            <Clock size={13} strokeWidth={2} /> History
          </button>
        )}
      </AppHeader>

      {/* Body */}
      <div className="scripts-shell">
        {/* Sidebar */}
        <div className="scripts-sidebar">
          <div className="scripts-sidebar-header">
            <span className="scripts-sidebar-title">Scripts</span>
            <div className="scripts-sidebar-actions">
              <button
                className="btn-secondary btn-sm"
                onClick={() => fileInputRef.current?.click()}
                title="Import a script from a JSON file"
              >
                <Upload size={11} strokeWidth={2.5} /> Import
              </button>
              <button className="btn-primary btn-sm" onClick={handleNew}>+ New</button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              style={{ display: 'none' }}
              onChange={handleImportFile}
            />
          </div>
          <div className="scripts-list">
            {scripts.length === 0 && (
              <div className="scripts-empty-list">No scripts yet.</div>
            )}
            {scripts.map((s) => (
              <div
                key={s.id}
                className={`script-item${s.id === selectedId ? ' script-item--active' : ''}`}
                onClick={() => handleSelectScript(s.id)}
              >
                <span className="script-item-name">
                  {s.id === selectedId && isDirty && <span className="script-item-dirty">●</span>}
                  {s.name}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Main editor */}
        {selected && draft ? (
          <div className="scripts-main">
            <div className="scripts-main-header">
              <div className="scripts-header-top">
                <input
                  className="scripts-name-input"
                  value={draft.name}
                  onChange={(e) => patch({ name: e.target.value })}
                  placeholder="Script name"
                />
                <button
                  className={`btn-primary scripts-save-btn${isDirty ? '' : ' scripts-save-btn--clean'}`}
                  onClick={save}
                  disabled={!isDirty}
                  title="Save (Ctrl+S)"
                >
                  <Save size={13} strokeWidth={2} />
                  {isDirty ? 'Save' : 'Saved'}
                </button>
                <button
                  className="btn-secondary scripts-delete-btn"
                  onClick={() => handleDelete(selected.id)}
                  title="Delete this script"
                >
                  <Trash2 size={13} strokeWidth={2} />
                  Delete
                </button>
              </div>
              <input
                className="scripts-desc-input"
                value={draft.description}
                onChange={(e) => patch({ description: e.target.value })}
                placeholder="Description (optional)"
              />

              <div className="scripts-meta-row">
                <span className="scripts-meta-item">
                  Timeout:&nbsp;
                  <input
                    type="number"
                    className="scripts-timeout-input"
                    value={draft.timeout}
                    min={1}
                    max={3000}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (v >= 1 && v <= 3000) patch({ timeout: v });
                    }}
                  />
                  &nbsp;s
                </span>
                <span className="scripts-meta-item">
                  <label className="scripts-sandbox-label">
                    <input
                      type="checkbox"
                      checked={draft.sandbox ?? false}
                      onChange={(e) => patch({ sandbox: e.target.checked })}
                    />
                    Run in Docker sandbox
                  </label>
                </span>
                <span className="scripts-meta-item scripts-meta-dates">
                  Created {fmtTime(selected.createdAt)}
                  {selected.updatedAt !== selected.createdAt && ` · Updated ${fmtTime(selected.updatedAt)}`}
                </span>
              </div>

              {draft.sandbox && (
                <div className="scripts-sandbox-panel">
                  <button
                    type="button"
                    className="scripts-sandbox-panel-header scripts-sandbox-panel-header--toggle"
                    onClick={() => setSandboxExpanded((v) => !v)}
                  >
                    {sandboxExpanded ? <ChevronDown size={13} strokeWidth={2} /> : <ChevronRight size={13} strokeWidth={2} />}
                    <span className="scripts-sandbox-panel-title">Docker sandbox settings</span>
                  </button>

                  {sandboxExpanded && (
                    <>
                      <div className="scripts-sandbox-field">
                        <label className="scripts-sandbox-field-label">Docker image</label>
                        <input
                          className="scripts-npm-input"
                          placeholder="node:22-slim"
                          value={draft.dockerImage ?? ''}
                          onChange={(e) => patch({ dockerImage: e.target.value })}
                        />
                        <span className="scripts-sandbox-note">
                          Default: <code>node:22-slim</code>. Use <code>nikolaik/python-nodejs:python3.12-nodejs22</code> when your script needs Python (e.g. yt-dlp).
                        </span>
                      </div>

                      <div className="scripts-sandbox-field">
                        <label className="scripts-sandbox-field-label">
                          Dependencies
                          <span className="scripts-sandbox-field-hint-inline">space-separated npm packages</span>
                        </label>
                        <input
                          className="scripts-npm-input"
                          placeholder="@distube/ytdl-core fluent-ffmpeg ffmpeg-static"
                          value={draft.npmInstall ?? ''}
                          onChange={(e) => patch({ npmInstall: e.target.value })}
                        />
                        <span className="scripts-sandbox-note">
                          List all packages separated by spaces. They are installed inside the container before the script runs — e.g.{' '}
                          <code>axios lodash</code> or <code>@distube/ytdl-core fluent-ffmpeg ffmpeg-static</code>.
                        </span>
                      </div>

                      <div className="scripts-sandbox-api-box">
                        <div className="scripts-sandbox-api-title">Sandbox script API</div>
                        <div className="scripts-sandbox-api-rows">
                          <div className="scripts-sandbox-api-row">
                            <code>input</code>
                            <span>resolved input bindings from the node config</span>
                          </div>
                          <div className="scripts-sandbox-api-row">
                            <code>outputDir</code>
                            <span>path to write output files — they are captured automatically and exposed as <code>files[]</code> in the node output</span>
                          </div>
                          <div className="scripts-sandbox-api-row">
                            <code>require</code>
                            <span>CommonJS require — use it to load installed dependencies</span>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Input declarations */}
              <div className="scripts-sandbox-panel">
                <div className="scripts-inputs-panel-header">
                  <button
                    type="button"
                    className="scripts-sandbox-panel-header--toggle scripts-inputs-panel-toggle"
                    onClick={() => setInputsExpanded((v) => !v)}
                  >
                    {inputsExpanded ? <ChevronDown size={13} strokeWidth={2} /> : <ChevronRight size={13} strokeWidth={2} />}
                    <span className="scripts-sandbox-panel-title">Inputs</span>
                  </button>
                  {inputsExpanded && (
                    <button className="btn-secondary btn-sm" type="button" onClick={handleAddInput}>
                      <Plus size={10} strokeWidth={2.5} /> Add
                    </button>
                  )}
                </div>
                {inputsExpanded && (
                  <>
                    {(draft.inputs ?? []).length === 0 ? (
                      <span className="scripts-inputs-empty">
                        No inputs declared — use <code>input</code> in your script to access workflow variables.
                      </span>
                    ) : (
                      <div className="scripts-inputs-list">
                        {(draft.inputs ?? []).map((inp, i) => (
                          <div key={i} className="scripts-input-item">
                            <input
                              className="scripts-input-name-field"
                              placeholder="name"
                              value={inp.name}
                              onChange={(e) => handleUpdateInput(i, { ...inp, name: e.target.value })}
                            />
                            <select
                              className="scripts-input-type-select"
                              value={inp.type ?? 'string'}
                              onChange={(e) => handleUpdateInput(i, { ...inp, type: e.target.value as ScriptInputType })}
                            >
                              <option value="string">string</option>
                              <option value="number">number</option>
                              <option value="boolean">boolean</option>
                            </select>
                            <input
                              className="scripts-input-desc-field"
                              placeholder="description (optional)"
                              value={inp.description ?? ''}
                              onChange={(e) => handleUpdateInput(i, { ...inp, description: e.target.value || undefined })}
                            />
                            <button
                              type="button"
                              className="scripts-input-remove"
                              onClick={() => handleRemoveInput(i)}
                              title="Remove input"
                            >
                              <X size={10} strokeWidth={2.5} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="scripts-editor-area">
              <MonacoEditor
                key={selected.id}
                height="100%"
                defaultLanguage="javascript"
                value={draft.code}
                onChange={(v) => patch({ code: v ?? '' })}
                theme={theme === 'light' ? 'light' : 'vs-dark'}
                options={{
                  minimap: { enabled: false },
                  fontSize: editorFontSize,
                  lineNumbers: 'on',
                  scrollBeyondLastLine: false,
                  wordWrap: 'off',
                  tabSize: 2,
                  automaticLayout: true,
                }}
                onMount={handleMount}
              />
            </div>
          </div>
        ) : (
          <div className="scripts-main scripts-main--empty">
            <div className="scripts-placeholder">
              {scripts.length === 0 ? (
                <>
                  <p>No scripts yet.</p>
                  <button className="btn-primary" onClick={handleNew}>Create your first script</button>
                </>
              ) : (
                <p>
                  Select a script from the list to edit it, or create a new one with{' '}
                  <strong>+ New</strong>.
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {historyOpen && selected && (
        <ArtifactHistoryModal
          type="script"
          id={selected.id}
          name={selected.name}
          current={selected}
          onRestore={(data) => {
            const d = data as Script;
            updateScript(selected.id, {
              name: d.name, description: d.description, code: d.code, timeout: d.timeout,
              inputs: d.inputs, sandbox: d.sandbox, dockerImage: d.dockerImage, npmInstall: d.npmInstall,
            });
            setDraft(toDraft({ ...selected, ...d, id: selected.id }));
            setIsDirty(false);
          }}
          onClose={() => setHistoryOpen(false)}
        />
      )}
    </div>
  );
};
