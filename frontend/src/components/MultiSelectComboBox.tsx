import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, X } from 'lucide-react';

export type ComboOption = { value: string; label: string };

type Props = {
  options: ComboOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  /** Shown on the button when nothing is selected (e.g. "All workflows"). */
  placeholder: string;
  /** Noun used in the "N nouns" summary when several are selected. */
  noun?: string;
  /** Show a search box in the dropdown (worth it past ~8 options). */
  searchable?: boolean;
  className?: string;
};

// Compact multi-select filter: a single button that opens a checklist dropdown.
// Replaces long chip rows / single-select dropdowns without eating toolbar width.
export function MultiSelectComboBox({ options, selected, onChange, placeholder, noun = 'selected', searchable, className }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  useEffect(() => { if (open && searchable) searchRef.current?.focus(); }, [open, searchable]);

  const toggle = (value: string) => {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  };

  const selectedLabels = options.filter((o) => selected.includes(o.value)).map((o) => o.label);
  const summary =
    selectedLabels.length === 0 ? placeholder :
    selectedLabels.length === 1 ? selectedLabels[0] :
    `${selectedLabels.length} ${noun}`;

  const q = query.trim().toLowerCase();
  const shown = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;

  return (
    <div className={`msc${className ? ` ${className}` : ''}`} ref={ref}>
      <button
        type="button"
        className={`msc-btn${selected.length ? ' msc-btn--active' : ''}`}
        onClick={() => setOpen((v) => !v)}
        title={selectedLabels.length > 1 ? selectedLabels.join(', ') : placeholder}
      >
        <span className="msc-btn-label">{summary}</span>
        {selected.length > 0 && (
          <span
            className="msc-clear"
            role="button"
            aria-label={`Clear ${placeholder}`}
            onClick={(e) => { e.stopPropagation(); onChange([]); }}
          >
            <X size={12} strokeWidth={2.5} />
          </span>
        )}
        <ChevronDown size={13} className="msc-caret" />
      </button>
      {open && (
        <div
          className="msc-panel"
          onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); } }}
        >
          {searchable && (
            <input
              ref={searchRef}
              className="msc-search"
              type="search"
              placeholder="Filter…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          )}
          <div className="msc-list">
            {shown.length === 0 ? (
              <div className="msc-empty">No matches.</div>
            ) : shown.map((o) => {
              const on = selected.includes(o.value);
              return (
                <button
                  key={o.value}
                  type="button"
                  className={`msc-item${on ? ' msc-item--on' : ''}`}
                  onClick={() => toggle(o.value)}
                >
                  <span className="msc-check">{on && <Check size={12} strokeWidth={3} />}</span>
                  <span className="msc-item-label">{o.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
