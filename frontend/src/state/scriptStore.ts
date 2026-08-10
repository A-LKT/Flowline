import { create } from 'zustand';
import type { Script } from '../types/script';

const api = {
  list: (): Promise<Script[]> =>
    fetch('/scripts').then((r) => r.json() as Promise<Script[]>),

  save: (sc: Script): Promise<void> =>
    fetch('/scripts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sc) }).then(() => void 0),

  remove: (id: string): Promise<void> =>
    fetch(`/scripts/${id}`, { method: 'DELETE' }).then(() => void 0),
};

type ScriptStore = {
  scripts: Script[];
  isLoading: boolean;
  loadScripts: () => Promise<void>;
  addScript: () => string;
  importScript: (sc: Script) => void;
  updateScript: (id: string, patch: Partial<Pick<Script, 'name' | 'code' | 'description' | 'timeout' | 'inputs' | 'sandbox' | 'dockerImage' | 'npmInstall'>>) => void;
  removeScript: (id: string) => void;
};

export const useScriptStore = create<ScriptStore>((set) => ({
  scripts: [],
  isLoading: false,

  loadScripts: async () => {
    set({ isLoading: true });
    try {
      const scripts = await api.list();
      set({ scripts, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  addScript: () => {
    const script: Script = {
      id: crypto.randomUUID(),
      name: 'New Script',
      code: '// input: workflow variables\n// context.outputs["nodeId"]: output of a previous node\nreturn { result: input };',
      timeout: 300,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    set((s) => ({ scripts: [...s.scripts, script] }));
    void api.save(script);
    return script.id;
  },

  importScript: (sc) => {
    set((s) => ({ scripts: [...s.scripts, sc] }));
    void api.save(sc);
  },

  updateScript: (id, patch) => {
    set((s) => {
      const scripts = s.scripts.map((sc) =>
        sc.id === id ? { ...sc, ...patch, updatedAt: Date.now() } : sc,
      );
      const updated = scripts.find((sc) => sc.id === id);
      if (updated) void api.save(updated);
      return { scripts };
    });
  },

  removeScript: (id) => {
    set((s) => ({ scripts: s.scripts.filter((sc) => sc.id !== id) }));
    void api.remove(id);
  },
}));
