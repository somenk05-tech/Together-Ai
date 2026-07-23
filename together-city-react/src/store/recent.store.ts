import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { HubKey } from '@/types';

export interface RecentEntry {
  path: string;
  label: string;
  hub?: HubKey | 'account';
  at: number;
}

interface RecentState {
  items: RecentEntry[];
  /** Record a visit — de-dupes by path, moves to front, caps the list. */
  record: (e: Omit<RecentEntry, 'at'>) => void;
  clear: () => void;
}

const CAP = 16;

/**
 * Recently-viewed pages — the memory behind "where did I just come from?".
 * Powers the Recently Viewed panel (Home + command palette) and the
 * "Continue where you left off" card. Persisted so it survives reloads and
 * sign-in, giving the super-app one continuous sense of place (audit 3.3).
 */
export const useRecentStore = create<RecentState>()(
  persist(
    (set) => ({
      items: [],
      record: (e) =>
        set((s) => {
          if (!e.path || e.path === '/') return s; // home isn't a "recent"
          const items = [{ ...e, at: Date.now() }, ...s.items.filter((x) => x.path !== e.path)].slice(0, CAP);
          return { items };
        }),
      clear: () => set({ items: [] }),
    }),
    { name: 'tc-recent-v1' },
  ),
);
