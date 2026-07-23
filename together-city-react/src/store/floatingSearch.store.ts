import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface FloatingSearchState {
  x: number | null;
  y: number | null;
  setPos: (x: number, y: number) => void;
}

/** Remembers where the user dropped the floating search tab (persisted). */
export const useFloatingSearchStore = create<FloatingSearchState>()(
  persist(
    (set) => ({ x: null, y: null, setPos: (x, y) => set({ x, y }) }),
    { name: 'tc-search-pos-v1' },
  ),
);
