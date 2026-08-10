import { create } from 'zustand';

type Theme = 'dark' | 'light';

interface SettingsState {
  theme: Theme;
  editorFontSize: number;
  showNodeTiming: boolean;
  setTheme: (theme: Theme) => void;
  setEditorFontSize: (size: number) => void;
  setShowNodeTiming: (v: boolean) => void;
}

const LS_KEY = 'wf:settings';

function loadSaved(): { theme?: Theme; editorFontSize?: number; showNodeTiming?: boolean } {
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? '{}'); }
  catch { return {}; }
}

function persist(patch: Partial<{ theme: Theme; editorFontSize: number; showNodeTiming: boolean }>) {
  localStorage.setItem(LS_KEY, JSON.stringify({ ...loadSaved(), ...patch }));
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('light', theme === 'light');
}

const saved = loadSaved();
const initialTheme: Theme = saved.theme ?? 'dark';
applyTheme(initialTheme);

export const useSettingsStore = create<SettingsState>((set) => ({
  theme: initialTheme,
  editorFontSize:  saved.editorFontSize  ?? 13,
  showNodeTiming:  saved.showNodeTiming  ?? false,

  setTheme(theme) {
    applyTheme(theme);
    persist({ theme });
    set({ theme });
  },

  setEditorFontSize(editorFontSize) {
    persist({ editorFontSize });
    set({ editorFontSize });
  },

  setShowNodeTiming(showNodeTiming) {
    persist({ showNodeTiming });
    set({ showNodeTiming });
  },
}));
