import { useState } from 'react';
import { Settings, Sun, Moon } from 'lucide-react';
import { SettingsModal } from '../features/settings/SettingsModal';
import { useSettingsStore } from '../state/settingsStore';

export const SettingsButton = () => {
  const [open, setOpen] = useState(false);
  const { theme, setTheme } = useSettingsStore();

  return (
    <>
      <button
        className="btn-icon"
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
      </button>
      <button
        className="btn-icon"
        onClick={() => setOpen(true)}
        title="Settings"
      >
        <Settings size={14} />
      </button>
      {open && <SettingsModal onClose={() => setOpen(false)} />}
    </>
  );
};
