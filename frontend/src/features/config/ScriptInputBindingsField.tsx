import type { ScriptInput, InputBinding } from '../../types/script';
import type { WorkflowNode } from '../../types/workflow';

type Props = {
  scriptInputs: ScriptInput[];
  bindings: Record<string, InputBinding>;
  onChange: (bindings: Record<string, InputBinding>) => void;
  otherNodes: WorkflowNode[];
  disabled?: boolean;
};

const KIND_LABELS: Record<InputBinding['kind'], string> = {
  node:      'Node',
  primitive: 'Value',
  variable:  'Variable',
};

const defaultBinding = (kind: InputBinding['kind']): InputBinding => {
  if (kind === 'node')     return { kind: 'node', nodeId: '' };
  if (kind === 'variable') return { kind: 'variable', varName: '' };
  return { kind: 'primitive', value: '' };
};

const TYPE_BADGE: Record<string, string> = {
  string:  'str',
  number:  'num',
  boolean: 'bool',
};

export const ScriptInputBindingsField = ({ scriptInputs, bindings, onChange, otherNodes, disabled = false }: Props) => {
  const setBinding = (name: string, binding: InputBinding) => {
    if (disabled) return;
    onChange({ ...bindings, [name]: binding });
  };

  return (
    <div className="script-bindings-section">
      <div className="script-bindings-title">Inputs</div>
      {scriptInputs.map((input) => {
        const inputType = input.type ?? 'string';
        const binding   = bindings[input.name] ?? defaultBinding('primitive');

        return (
          <div key={input.name} className="script-binding-row">
            <div className="script-binding-label-row">
              <span className="field-label">{input.name}</span>
              <span className="script-binding-type-badge">{TYPE_BADGE[inputType] ?? inputType}</span>
              {input.description && (
                <span className="script-binding-desc">{input.description}</span>
              )}
            </div>

            <div className="script-binding-kinds">
              {(Object.keys(KIND_LABELS) as InputBinding['kind'][]).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  className={`script-binding-kind${binding.kind === kind ? ' script-binding-kind--active' : ''}`}
                  onClick={() => setBinding(input.name, defaultBinding(kind))}
                  disabled={disabled}
                >
                  {KIND_LABELS[kind]}
                </button>
              ))}
            </div>

            {binding.kind === 'node' && (
              <select
                className="field-select"
                value={binding.nodeId}
                disabled={disabled}
                onChange={(e) => setBinding(input.name, { kind: 'node', nodeId: e.target.value })}
              >
                <option value="">Select a node…</option>
                {otherNodes.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name ?? n.type} ({n.id.slice(0, 8)})
                  </option>
                ))}
              </select>
            )}

            {binding.kind === 'primitive' && inputType === 'boolean' && (
              <label className="script-binding-bool-label">
                <input
                  type="checkbox"
                  checked={binding.value === true}
                  disabled={disabled}
                onChange={(e) => setBinding(input.name, { kind: 'primitive', value: e.target.checked })}
                />
                <span>{binding.value === true ? 'true' : 'false'}</span>
              </label>
            )}

            {binding.kind === 'primitive' && inputType === 'number' && (
              <input
                type="number"
                step="any"
                className="field-input"
                value={typeof binding.value === 'number' ? binding.value : ''}
                disabled={disabled}
                onChange={(e) => setBinding(input.name, { kind: 'primitive', value: e.target.valueAsNumber })}
              />
            )}

            {binding.kind === 'primitive' && inputType === 'string' && (
              <input
                className="field-input"
                placeholder="Literal value"
                value={typeof binding.value === 'string' ? binding.value : String(binding.value ?? '')}
                disabled={disabled}
                onChange={(e) => setBinding(input.name, { kind: 'primitive', value: e.target.value })}
              />
            )}

            {binding.kind === 'variable' && (
              <input
                className="field-input"
                placeholder="Variable name"
                value={binding.varName}
                disabled={disabled}
                onChange={(e) => setBinding(input.name, { kind: 'variable', varName: e.target.value })}
              />
            )}
          </div>
        );
      })}
    </div>
  );
};
