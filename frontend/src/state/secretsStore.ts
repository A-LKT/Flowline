import { create } from 'zustand';

const api = {
  list: (): Promise<{ names: string[] }> =>
    fetch('/secrets').then((r) => r.json() as Promise<{ names: string[] }>),

  create: (name: string, value: string): Promise<void> =>
    fetch('/secrets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, value }),
    }).then((r) => {
      if (!r.ok) return r.json().then((e) => Promise.reject(new Error((e as { error: string }).error)));
    }),

  remove: (name: string): Promise<void> =>
    fetch(`/secrets/${name}`, { method: 'DELETE' }).then(() => void 0),
};

type SecretsStore = {
  names: string[];
  isLoading: boolean;
  vaultUnavailable: boolean;
  loadSecrets: () => Promise<void>;
  addSecret: (name: string, value: string) => Promise<void>;
  removeSecret: (name: string) => Promise<void>;
};

export const useSecretsStore = create<SecretsStore>((set) => ({
  names: [],
  isLoading: false,
  vaultUnavailable: false,

  loadSecrets: async () => {
    set({ isLoading: true });
    try {
      const res = await fetch('/secrets');
      if (res.status === 503) {
        set({ isLoading: false, vaultUnavailable: true });
        return;
      }
      const { names } = (await res.json()) as { names: string[] };
      set({ names, isLoading: false, vaultUnavailable: false });
    } catch {
      set({ isLoading: false });
    }
  },

  addSecret: async (name, value) => {
    await api.create(name, value);
    set((s) => ({
      names: s.names.includes(name) ? s.names : [...s.names, name].sort(),
    }));
  },

  removeSecret: async (name) => {
    await api.remove(name);
    set((s) => ({ names: s.names.filter((n) => n !== name) }));
  },
}));
