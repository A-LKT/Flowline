import { useEffect } from 'react';
import { X, LogOut } from 'lucide-react';
import { useSettingsStore } from '../../state/settingsStore';
import { useAuthStore } from '../../state/authStore';

type Props = { onClose: () => void };

export const SettingsModal = ({ onClose }: Props) => {
  const theme            = useSettingsStore((s) => s.theme);
  const editorFontSize   = useSettingsStore((s) => s.editorFontSize);
  const showNodeTiming   = useSettingsStore((s) => s.showNodeTiming);
  const setTheme         = useSettingsStore((s) => s.setTheme);
  const setEditorFontSize   = useSettingsStore((s) => s.setEditorFontSize);
  const setShowNodeTiming   = useSettingsStore((s) => s.setShowNodeTiming);
  const user             = useAuthStore((s) => s.user);
  const logout           = useAuthStore((s) => s.logout);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 380 }}>
        <div className="modal-header">
          <span className="modal-title">Settings</span>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>

        <p className="s-title" style={{ margin: '0 0 12px' }}>Appearance</p>

        <div className="field-row">
          <label className="field-label">Theme</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className={theme === 'dark' ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}
              onClick={() => setTheme('dark')}
            >
              Dark
            </button>
            <button
              className={theme === 'light' ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}
              onClick={() => setTheme('light')}
            >
              Light
            </button>
          </div>
        </div>

        <div className="field-row">
          <label className="field-label">Editor font size — {editorFontSize}px</label>
          <input
            type="range"
            min={10}
            max={20}
            step={1}
            value={editorFontSize}
            onChange={(e) => setEditorFontSize(Number(e.target.value))}
            style={{ width: '100%', accentColor: 'var(--blue)', cursor: 'pointer' }}
          />
          <div style={{
            marginTop: 8,
            padding: '6px 10px',
            background: 'var(--bg3)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            fontFamily: 'ui-monospace, Consolas, monospace',
            fontSize: editorFontSize,
            color: 'var(--text2)',
            lineHeight: 1.5,
          }}>
            const result = await fetch(url);
          </div>
        </div>

        <div className="config-divider" style={{ margin: '16px 0' }} />
        <p className="s-title" style={{ margin: '0 0 12px' }}>Canvas</p>

        <div className="field-row field-row--inline">
          <input
            type="checkbox"
            id="setting-node-timing"
            checked={showNodeTiming}
            onChange={(e) => setShowNodeTiming(e.target.checked)}
            className="field-checkbox"
          />
          <label htmlFor="setting-node-timing" className="field-label" style={{ cursor: 'pointer' }}>
            Show execution time on nodes
          </label>
        </div>

        {user && (
          <>
            <div className="config-divider" style={{ margin: '16px 0' }} />
            <p className="s-title" style={{ margin: '0 0 12px' }}>Account</p>
            <div className="field-row field-row--inline" style={{ justifyContent: 'space-between' }}>
              <span className="field-label">
                Signed in as <strong>{user.username}</strong>
              </span>
              <button className="btn-secondary btn-sm" onClick={() => void logout()}>
                <LogOut size={14} style={{ marginRight: 6, verticalAlign: '-2px' }} />
                Log out
              </button>
            </div>
          </>
        )}

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};
