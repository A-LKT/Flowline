import { useEffect, useState } from 'react';
import { Trash2, Eye, EyeOff } from 'lucide-react';
import { useSecretsStore } from '../../state/secretsStore';

const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export const SecretsPanel = () => {
  const names            = useSecretsStore((s) => s.names);
  const isLoading        = useSecretsStore((s) => s.isLoading);
  const vaultUnavailable = useSecretsStore((s) => s.vaultUnavailable);
  const loadSecrets      = useSecretsStore((s) => s.loadSecrets);
  const addSecret        = useSecretsStore((s) => s.addSecret);
  const removeSecret     = useSecretsStore((s) => s.removeSecret);

  const [name, setName]         = useState('');
  const [value, setValue]       = useState('');
  const [showValue, setShowValue] = useState(false);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');

  useEffect(() => { void loadSecrets(); }, [loadSecrets]);

  const nameError =
    name && !NAME_RE.test(name)
      ? 'Letters, digits, underscores only — must start with a letter or underscore'
      : '';

  const handleAdd = async () => {
    if (!name || !value || nameError) return;
    setSaving(true);
    setError('');
    try {
      await addSecret(name, value);
      setName('');
      setValue('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save secret');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="manager">
      <div className="manager-header">
        <span className="manager-title">Secrets</span>
      </div>
      <div className="manager-content">
      {vaultUnavailable ? (
        <div className="secret-vault-warning">
          <strong>Vault not configured.</strong> Set the <code>VAULT_KEY</code> environment variable on the
          backend server and restart it to enable the secrets store. Secrets are encrypted with this key — keep
          it safe and do not change it after secrets are created.
        </div>
      ) : (
        <>
          <div className="secret-hint">
            Reference secrets in node configs using{' '}
            <code className="secret-hint-code">{'{{secrets.NAME}}'}</code>. Values are stored
            AES-256-GCM encrypted and are never returned by the API after creation.
          </div>

          <div className="secret-add-form">
            <p className="s-title" style={{ marginBottom: 10 }}>Add / update secret</p>

            <div className="field-row">
              <label className="field-label">Name</label>
              <input
                className="field-input"
                placeholder="MY_API_KEY"
                value={name}
                onChange={(e) => setName(e.target.value)}
                spellCheck={false}
              />
              {nameError && <div className="field-error">{nameError}</div>}
            </div>

            <div className="field-row">
              <label className="field-label">Value</label>
              <div style={{ position: 'relative', display: 'flex' }}>
                <input
                  className="field-input"
                  type={showValue ? 'text' : 'password'}
                  placeholder="paste secret value here"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  style={{ flex: 1, paddingRight: 36 }}
                  spellCheck={false}
                />
                <button
                  className="btn-secondary btn-sm"
                  style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', padding: '2px 6px' }}
                  onClick={() => setShowValue((v) => !v)}
                  title={showValue ? 'Hide value' : 'Show value'}
                  type="button"
                >
                  {showValue ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>
            </div>

            {error && <div className="field-error" style={{ marginBottom: 8 }}>{error}</div>}

            <button
              className="btn-primary btn-sm"
              disabled={!name || !value || !!nameError || saving}
              onClick={() => void handleAdd()}
            >
              {saving ? 'Saving…' : names.includes(name) ? 'Update secret' : 'Add secret'}
            </button>
          </div>

          <p className="s-title" style={{ marginTop: 20, marginBottom: 10 }}>
            Stored secrets ({isLoading ? '…' : names.length})
          </p>

          {names.length === 0 && !isLoading ? (
            <p style={{ color: 'var(--text2)', fontSize: 12 }}>No secrets stored yet.</p>
          ) : (
            <ul className="secret-list">
              {names.map((n) => (
                <li key={n} className="secret-list-item">
                  <code className="secret-name">{n}</code>
                  <button
                    className="btn-secondary btn-sm"
                    style={{ marginLeft: 'auto' }}
                    title={`Delete ${n}`}
                    onClick={() => void removeSecret(n)}
                  >
                    <Trash2 size={13} strokeWidth={2} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      </div>
    </div>
  );
};
