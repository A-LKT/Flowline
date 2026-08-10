import { create } from 'zustand';

export type Edition = 'free' | 'premium';
export type Features = { assistant: boolean; multiTenant: boolean; housekeeping: boolean; artifactHistory: boolean };

interface EditionState {
  edition: Edition;
  features: Features;
  loaded: boolean;
  loadEdition: () => Promise<void>;
}

// Mirrors backend/src/edition.ts. Fetched once after auth; gates premium surfaces.
export const useEditionStore = create<EditionState>((set) => ({
  edition:  'free',
  features: { assistant: false, multiTenant: false, housekeeping: false, artifactHistory: false },
  loaded:   false,
  loadEdition: async () => {
    try {
      const res = await fetch('/api/edition');
      if (res.ok) {
        const d = await res.json() as { edition: Edition; features: Features };
        set({ edition: d.edition, features: d.features, loaded: true });
        return;
      }
    } catch { /* backend offline — stay free */ }
    set({ loaded: true });
  },
}));
