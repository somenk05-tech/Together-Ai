import { create } from 'zustand';
import type { HubKey } from '@/types';

interface UiState {
  activeHub: HubKey | null;
  sidebarOpen: boolean;       // mobile drawer
  setActiveHub: (hub: HubKey | null) => void;
  toggleSidebar: (open?: boolean) => void;
}

/** Ephemeral UI state — replaces ad-hoc DOM flags from the vanilla site. */
export const useUiStore = create<UiState>((set) => ({
  activeHub: null,
  sidebarOpen: false,
  setActiveHub: (activeHub) => set({ activeHub }),
  toggleSidebar: (open) => set((s) => ({ sidebarOpen: open ?? !s.sidebarOpen })),
}));
