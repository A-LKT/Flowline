import { useEffect, useRef, useState } from 'react';
import type { Script } from '../../types/script';

type Props = {
  value: string;
  onChange: (v: string) => void;
  scripts: Script[];
  error?: string;
  disabled?: boolean;
};

export const ScriptSelectField = ({ value, onChange, scripts, error, disabled = false }: Props) => {
  const [query, setQuery]   = useState(value);
  const [open, setOpen]     = useState(false);
  const wrapRef             = useRef<HTMLDivElement>(null);

  // Keep query in sync when the external value changes (e.g. form reset)
  useEffect(() => { setQuery(value); }, [value]);

  const filtered = query.trim()
    ? scripts.filter((s) => s.name.toLowerCase().includes(query.toLowerCase()))
    : scripts;

  const handleSelect = (name: string) => {
    setQuery(name);
    onChange(name);
    setOpen(false);
  };

  const handleCreateNew = () => {
    window.open(window.location.href, '_blank');
  };

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="field-row">
      <label className="field-label">Script</label>
      <div ref={wrapRef} className="script-select-wrap" data-error={error ? 'true' : undefined}>
        <input
          className="field-input script-select-input"
          value={query}
          onChange={(e) => {
            if (disabled) return;
            setQuery(e.target.value);
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => { if (!disabled) setOpen(true); }}
          placeholder="Select or type a script name…"
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
        />
        {open && (
          <div className="script-select-dropdown">
            {/* "Create new…" is always first */}
            <div
              className="script-select-option script-select-option--create"
              onMouseDown={(e) => { e.preventDefault(); handleCreateNew(); }}
            >
              + Create new script…
            </div>

            {filtered.map((s) => (
              <div
                key={s.id}
                className={`script-select-option${s.name === value ? ' script-select-option--active' : ''}`}
                onMouseDown={(e) => { e.preventDefault(); handleSelect(s.name); }}
              >
                {s.name}
              </div>
            ))}

            {filtered.length === 0 && query.trim() && (
              <div className="script-select-no-match">No scripts match "{query}"</div>
            )}
          </div>
        )}
      </div>
      {error && <div className="field-error">{error}</div>}
    </div>
  );
};
