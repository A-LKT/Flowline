import { create } from 'zustand';
import { logout as apiLogout, type AuthUser } from '../utils/apiAuth';

interface AuthState {
  user: AuthUser | null;
  setUser: (user: AuthUser | null) => void;
  logout: () => Promise<void>;
}

// Holds the logged-in user for the session. Populated by AuthGate from
// /api/auth/check; read by the UI to show the account name and offer logout.
export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
  logout: async () => {
    await apiLogout();
    set({ user: null });
    // Reload so every store resets to a clean, unauthenticated state and the
    // gate re-runs — simplest way to guarantee no stale data lingers.
    window.location.reload();
  },
}));
