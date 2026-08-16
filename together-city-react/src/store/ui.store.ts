import { create } from 'zustand';
import type { HubKey } from '@/types';

/**
 * THE PIN IS THE ONE THING IN HERE THAT IS NOT EPHEMERAL.
 *
 * `sidebarOpen` is a phone drawer: it should start closed on every page, every
 * time, and remembering it would be a bug. The rail's pin is the opposite —
 * somebody who wants the full 280px sidebar wants it on the next screen and
 * tomorrow, and asking them to re-open it on every navigation is how a
 * preference becomes a chore. So this one reads and writes localStorage, and
 * does it defensively: a private window with storage disabled throws on access,
 * and a rail that cannot remember its width is not a reason to fail to render.
 */
const RAIL_KEY = 'tc.rail.pinned';
const readPinned = (): boolean => {
  try { return localStorage.getItem(RAIL_KEY) === '1'; } catch { return false; }
};
const writePinned = (v: boolean) => {
  try { localStorage.setItem(RAIL_KEY, v ? '1' : '0'); } catch { /* nothing to do, and nothing worth breaking for */ }
};

interface UiState {
  activeHub: HubKey | null;
  sidebarOpen: boolean;       // mobile drawer — deliberately NOT remembered
  railPinned: boolean;        // desktop hub rail held open — remembered
  setActiveHub: (hub: HubKey | null) => void;
  toggleSidebar: (open?: boolean) => void;
  toggleRail: (pinned?: boolean) => void;
}

/** Ephemeral UI state — replaces ad-hoc DOM flags from the vanilla site. */
export const useUiStore = create<UiState>((set) => ({
  activeHub: null,
  sidebarOpen: false,
  railPinned: readPinned(),
  setActiveHub: (activeHub) => set({ activeHub }),
  toggleSidebar: (open) => set((s) => ({ sidebarOpen: open ?? !s.sidebarOpen })),
  toggleRail: (pinned) => set((s) => {
    const railPinned = pinned ?? !s.railPinned;
    writePinned(railPinned);
    return { railPinned };
  }),
}));
