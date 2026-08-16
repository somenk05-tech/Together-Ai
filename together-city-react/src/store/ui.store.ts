import { create } from 'zustand';
import type { HubKey } from '@/types';

/* A `railPinned` flag and a localStorage read lived here for half an hour on
   17 Aug, for a collapsing desktop rail the owner then asked to have back as a
   plain fixed sidebar. Both are gone with it: a remembered preference for a
   width nobody can change any more is a value that can only ever be wrong. */

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
