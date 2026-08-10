import { useState, useRef, useEffect } from 'react';
import { Trash2, Copy, Download } from 'lucide-react';
import type { Workflow } from '../../types/workflow';

type Props = {
  workflow: Workflow;
  /** Most recent run timestamp for this workflow, if any. */
  lastRunAt?: number;
  onOpen: () => void;
  onViewRuns: () => void;
  onClone: () => void;
  onDelete: (purge: boolean) => void;
  onExport: () => void;
  onRename: (name: string) => void;
  onDescribe: (description: string) => void;
};

type EditField = 'name' | 'description' | null;

const fmt = (ts: number) => {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(ts).toLocaleDateString();
};

export const WorkflowCard = ({ workflow, lastRunAt, onOpen, onViewRuns, onClone, onDelete, onExport, onRename, onDescribe }: Props) => {
  const [editing, setEditing] = useState<EditField>(null);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const deprecated = !!workflow.deprecated;
  // Deprecated workflows are read-only history: clicking opens their runs, not the editor.
  const primaryOpen = deprecated ? onViewRuns : onOpen;

  useEffect(() => {
    if (editing === 'name') inputRef.current?.select();
    if (editing === 'description') textareaRef.current?.focus();
  }, [editing]);

  const startEdit = (field: EditField) => {
    if (deprecated) return; // frozen — no inline rename/describe
    setDraft(field === 'name' ? workflow.name : (workflow.description ?? ''));
    setEditing(field);
  };

  const commit = () => {
    if (editing === 'name' && draft.trim()) onRename(draft.trim());
    if (editing === 'description') onDescribe(draft);
    setEditing(null);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && editing === 'name') { e.preventDefault(); commit(); }
    if (e.key === 'Escape') setEditing(null);
  };

  return (
    <div className={`wf-card wf-card--hoverable${deprecated ? ' wf-card--deprecated' : ''}`}>
      {/* Name */}
      <div className="wf-card-name-row" onClick={primaryOpen}>
        {editing === 'name' ? (
          <input
            ref={inputRef}
            className="wf-card-name-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={onKeyDown}
          />
        ) : (
          <span className="wf-card-name" onDoubleClick={() => startEdit('name')} title="Double-click to rename">
            {workflow.name}
          </span>
        )}
      </div>

      {/* Description */}
      <div className="wf-card-desc-row">
        {editing === 'description' ? (
          <textarea
            ref={textareaRef}
            className="wf-card-desc-input"
            value={draft}
            rows={2}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => e.key === 'Escape' && setEditing(null)}
          />
        ) : (
          <span
            className={`wf-card-desc${!workflow.description ? ' wf-card-desc--empty' : ''}`}
            onDoubleClick={() => startEdit('description')}
            title="Double-click to edit description"
          >
            {workflow.description && workflow.description}
          </span>
        )}
      </div>

      {/* Badges */}
      <div className="wf-card-badges">
        {deprecated && <span className="badge badge--deprecated">Deprecated</span>}
        <span className="badge badge--muted">Updated {fmt(workflow.updatedAt)}</span>
        <span className="badge badge--muted" title={lastRunAt ? new Date(lastRunAt).toLocaleString() : 'Has not run yet'}>
          {lastRunAt ? `Last ran ${fmt(lastRunAt)}` : 'Never run'}
        </span>
      </div>

      {/* Actions */}
      <div className="wf-card-footer">
        {deprecated ? (
          <>
            <button className="btn-secondary" onClick={onViewRuns}>View runs</button>
            <div className="wf-card-icon-actions">
              <button className="wf-card-icon-btn" onClick={onClone} title="Clone — create an editable copy">
                <Copy size={14} strokeWidth={2} />
              </button>
              <button className="wf-card-icon-btn" onClick={onExport} title="Export">
                <Download size={14} strokeWidth={2} />
              </button>
              <button
                className="wf-card-delete"
                onClick={(e) => {
                  e.stopPropagation();
                  if (window.confirm(`Permanently delete "${workflow.name}" and all of its run history? This cannot be undone.`)) onDelete(true);
                }}
                title="Delete permanently (removes run history)"
              >
                <Trash2 size={14} strokeWidth={2} />
              </button>
            </div>
          </>
        ) : (
          <>
            <button className="btn-secondary" onClick={onOpen}>Edit</button>
            <div className="wf-card-icon-actions">
              <button className="wf-card-icon-btn" onClick={onClone} title="Clone">
                <Copy size={14} strokeWidth={2} />
              </button>
              <button className="wf-card-icon-btn" onClick={onExport} title="Export">
                <Download size={14} strokeWidth={2} />
              </button>
              <button
                className="wf-card-delete"
                onClick={(e) => { e.stopPropagation(); if (window.confirm(`Delete workflow "${workflow.name}"?`)) onDelete(false); }}
                title="Delete workflow"
              >
                <Trash2 size={14} strokeWidth={2} />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
