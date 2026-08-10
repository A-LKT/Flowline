import type { NodeProps } from 'reactflow';

type LabelConfig = {
  text:     string;
  fontSize: 'sm' | 'md' | 'lg' | 'xl';
  color:    'default' | 'blue' | 'green' | 'amber' | 'purple' | 'red';
};

type LabelNodeData = { config: Record<string, unknown> };

const FONT_SIZES: Record<string, number> = { sm: 11, md: 13, lg: 16, xl: 20 };

const COLOR_VARS: Record<string, string> = {
  default: 'var(--text)',
  blue:    'var(--blue)',
  green:   'var(--green)',
  amber:   'var(--amber)',
  purple:  'var(--purple)',
  red:     'var(--red)',
};

export const LabelNodeComponent = ({ data, selected }: NodeProps<LabelNodeData>) => {
  const cfg     = data.config as LabelConfig;
  const fontSize = FONT_SIZES[cfg.fontSize] ?? 13;
  const color    = COLOR_VARS[cfg.color]    ?? 'var(--text)';

  return (
    <div className="label-node" data-selected={selected || undefined}>
      {cfg.text ? (
        <p className="label-node-text" style={{ fontSize, color }}>
          {cfg.text}
        </p>
      ) : (
        <p className="label-node-text label-node-placeholder">Label text…</p>
      )}
    </div>
  );
};
