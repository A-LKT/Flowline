import { create } from 'zustand';
import type { Trigger } from '../types/trigger';

const api = {
  list: (): Promise<Trigger[]> =>
    fetch('/triggers').then((r) => r.json() as Promise<Trigger[]>),

  create: (t: Omit<Trigger, 'id' | 'createdAt' | 'updatedAt'>): Promise<Trigger> =>
    fetch('/triggers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(t),
    }).then((r) => {
      if (!r.ok) return r.json().then((e) => Promise.reject(new Error((e as { error: string }).error)));
      return r.json() as Promise<Trigger>;
    }),

  update: (id: string, patch: Partial<Trigger>): Promise<Trigger> =>
    fetch(`/triggers/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }).then((r) => {
      if (!r.ok) return r.json().then((e) => Promise.reject(new Error((e as { error: string }).error)));
      return r.json() as Promise<Trigger>;
    }),

  remove: (id: string): Promise<void> =>
    fetch(`/triggers/${id}`, { method: 'DELETE' }).then(() => void 0),

  run: (id: string): Promise<{ runId: string }> =>
    fetch(`/triggers/${id}/run`, { method: 'POST' }).then((r) => {
      if (!r.ok) return r.json().then((e) => Promise.reject(new Error((e as { error: string }).error)));
      return r.json() as Promise<{ runId: string }>;
    }),
};

type TriggerStore = {
  triggers: Trigger[];
  isLoading: boolean;
  loadTriggers: () => Promise<void>;
  createTrigger: (t: Omit<Trigger, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Trigger>;
  updateTrigger: (id: string, patch: Partial<Trigger>) => Promise<void>;
  deleteTrigger: (id: string) => Promise<void>;
  runTrigger: (id: string) => Promise<string>;
};

export const useTriggerStore = create<TriggerStore>((set, get) => ({
  triggers: [],
  isLoading: false,

  loadTriggers: async () => {
    set({ isLoading: true });
    try {
      const triggers = await api.list();
      set({ triggers, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  createTrigger: async (t) => {
    const trigger = await api.create(t);
    set((s) => ({ triggers: [...s.triggers, trigger] }));
    return trigger;
  },

  updateTrigger: async (id, patch) => {
    const existing = get().triggers.find((t) => t.id === id);
    if (!existing) return;
    const updated = await api.update(id, { ...existing, ...patch });
    set((s) => ({ triggers: s.triggers.map((t) => (t.id === id ? updated : t)) }));
  },

  deleteTrigger: async (id) => {
    await api.remove(id);
    set((s) => ({ triggers: s.triggers.filter((t) => t.id !== id) }));
  },

  runTrigger: async (id) => {
    const { runId } = await api.run(id);
    // The run is recorded immediately, so refresh to update the trigger's "last run".
    await get().loadTriggers();
    return runId;
  },
}));
