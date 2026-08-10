import { useRef, useState, useEffect } from 'react';
import { Settings } from 'lucide-react';
import { useWorkflowStore } from '../../state/workflowStore';
import { useEditionStore } from '../../state/editionStore';
import type { Workflow } from '../../types/workflow';
import { downloadWorkflow } from '../../utils/downloadWorkflow';
import { ArtifactHistoryModal } from '../../components/ArtifactHistoryModal';

type Props = {
  workflow: Workflow;
  canvasWrapRef: React.RefObject<HTMLDivElement | null>;
};

export const WorkflowCogMenu = ({ workflow, canvasWrapRef }: Props) => {
  const updateWorkflowMeta = useWorkflowStore((s) => s.updateWorkflowMeta);
  const restoreWorkflow     = useWorkflowStore((s) => s.restoreWorkflow);
  const isDirty             = useWorkflowStore((s) => s.isDirty);
  const allWorkflows        = useWorkflowStore((s) => s.workflows);
  const historyEnabled      = useEditionStore((s) => s.features.artifactHistory);
  const otherWorkflows      = allWorkflows.filter((w) => w.id !== workflow.id && !w.deprecated);

  const [open, setOpen]         = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [mode, setMode]         = useState<'idle' | 'rename' | 'description' | 'errorHandler'>('idle');
  const [renameVal, setRenameVal]       = useState('');
  const [descVal, setDescVal]           = useState('');
  const [errorHandlerVal, setErrorHandlerVal] = useState('');

  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setMode('idle');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const toggleMenu = () => {
    setOpen((v) => !v);
    setMode('idle');
  };

  const commitRename = () => {
    const name = renameVal.trim();
    if (name) updateWorkflowMeta(workflow.id, { name });
    setOpen(false);
    setMode('idle');
  };

  const commitDescription = () => {
    updateWorkflowMeta(workflow.id, { description: descVal.trim() });
    setOpen(false);
    setMode('idle');
  };

  const commitErrorHandler = () => {
    updateWorkflowMeta(workflow.id, { onErrorWorkflowId: errorHandlerVal || undefined });
    setOpen(false);
    setMode('idle');
  };

  const handleScreenshot = async () => {
    setOpen(false);
    const el = canvasWrapRef.current;
    if (!el) return;
    try {
      const { toPng } = await import('html-to-image');
      const dataUrl = await toPng(el, { cacheBust: true });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `${workflow.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-screenshot.png`;
      a.click();
    } catch {
      // screenshot failed silently
    }
  };

  return (
    <div className="cog-menu-wrap" ref={wrapRef}>
      <button
        className={`btn-icon${open ? ' btn-icon--active' : ''}`}
        onClick={toggleMenu}
        title="Workflow settings"
      >
        <Settings size={15} strokeWidth={2} />
      </button>

      {open && (
        <div className="cog-menu">
          {mode === 'idle' && (
            <>
              <button
                className="cog-menu-item"
                onClick={() => { setRenameVal(workflow.name); setMode('rename'); }}
              >
                Rename
              </button>
              <button
                className="cog-menu-item"
                onClick={() => { setDescVal(workflow.description ?? ''); setMode('description'); }}
              >
                Description
              </button>
              <button
                className="cog-menu-item"
                onClick={() => { setErrorHandlerVal(workflow.onErrorWorkflowId ?? ''); setMode('errorHandler'); }}
              >
                On error…
                {workflow.onErrorWorkflowId && (
                  <span className="cog-menu-item-badge">
                    {allWorkflows.find((w) => w.id === workflow.onErrorWorkflowId)?.name ?? '?'}
                  </span>
                )}
              </button>
              {historyEnabled && !workflow.deprecated && (
                <button className="cog-menu-item" onClick={() => { setOpen(false); setHistoryOpen(true); }}>
                  Version history…
                </button>
              )}
              <div className="cog-menu-divider" />
              <button className="cog-menu-item" onClick={() => { downloadWorkflow(workflow); setOpen(false); }}>
                Export
              </button>
              <button className="cog-menu-item" onClick={handleScreenshot}>
                Download Screenshot
              </button>
            </>
          )}

          {mode === 'rename' && (
            <div className="cog-menu-form">
              <span className="cog-menu-label">Rename</span>
              <input
                className="cog-menu-input"
                value={renameVal}
                onChange={(e) => setRenameVal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename();
                  if (e.key === 'Escape') setMode('idle');
                }}
                autoFocus
              />
              <div className="cog-menu-form-actions">
                <button className="btn-secondary cog-menu-action-btn" onClick={() => setMode('idle')}>Cancel</button>
                <button className="btn-primary cog-menu-action-btn" onClick={commitRename}>Apply</button>
              </div>
            </div>
          )}

          {mode === 'description' && (
            <div className="cog-menu-form">
              <span className="cog-menu-label">Description</span>
              <textarea
                className="cog-menu-textarea"
                value={descVal}
                onChange={(e) => setDescVal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setMode('idle');
                }}
                rows={3}
                autoFocus
              />
              <div className="cog-menu-form-actions">
                <button className="btn-secondary cog-menu-action-btn" onClick={() => setMode('idle')}>Cancel</button>
                <button className="btn-primary cog-menu-action-btn" onClick={commitDescription}>Apply</button>
              </div>
            </div>
          )}

          {mode === 'errorHandler' && (
            <div className="cog-menu-form">
              <span className="cog-menu-label">On error — run workflow</span>
              <select
                className="cog-menu-select"
                value={errorHandlerVal}
                onChange={(e) => setErrorHandlerVal(e.target.value)}
                autoFocus
              >
                <option value="">— none —</option>
                {otherWorkflows.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
              <div className="cog-menu-form-actions">
                <button className="btn-secondary cog-menu-action-btn" onClick={() => setMode('idle')}>Cancel</button>
                <button className="btn-primary cog-menu-action-btn" onClick={commitErrorHandler}>Apply</button>
              </div>
            </div>
          )}
        </div>
      )}

      {historyOpen && (
        <ArtifactHistoryModal
          type="workflow"
          id={workflow.id}
          name={workflow.name}
          current={workflow}
          dirty={isDirty}
          onRestore={(data) => restoreWorkflow(workflow.id, data as Workflow)}
          onClose={() => setHistoryOpen(false)}
        />
      )}
    </div>
  );
};
