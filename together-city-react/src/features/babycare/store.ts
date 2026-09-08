/**
 * ── THE HUB'S STATE, IN ONE STORE ───────────────────────────────────────────
 *
 * Zustand, matching the rest of the application, and holding exactly one thing:
 * the citizen's children, and which of them the shelf is currently reading.
 *
 * NOTHING ELSE IS IN HERE, and the absence is deliberate. The catalogue is a
 * bundled array behind `api.ts`; the age is derived from a birthday every time
 * it is asked for; the checklist is derived from the age. Storing any of the
 * three would mean holding a second answer to "how old is this child", and the
 * shelf and the checklist could then be looking at different children on the
 * same screen.
 *
 * THE SELECTED CHILD IS NOT SAVED TO THE SERVER. It is a view state — which
 * shelf am I looking at right now — and a parent switching between two children
 * on a phone should not be writing to their account to do it. It survives a
 * route change and not a reload; on reload the first child is selected, which
 * is the same answer a fresh visit gives.
 *
 * EVERY WRITE IS OPTIMISTIC AND EVERY WRITE CAN ROLL BACK. The Pet District's
 * rule, and its reason holds here word for word: a save that failed must not
 * look like a save that worked.
 */

import { create } from 'zustand';
import { babycareApi, type ChildPatch, type ChildRow } from '@/api/babycare.api';
import type { AgeBand, Child } from './types';
import { bandForDob } from './age';

const toChild = (r: ChildRow): Child => ({
  id: r.id, name: r.name, dob: r.dob, notes: r.notes, createdAt: r.createdAt,
});

interface BabyCareState {
  children: Child[];
  selectedId: string | null;
  loaded: boolean;
  loading: boolean;
  error: string | null;

  load: () => Promise<void>;
  select: (id: string | null) => void;
  addChild: (patch: ChildPatch) => Promise<void>;
  editChild: (id: string, patch: ChildPatch) => Promise<void>;
  removeChild: (id: string) => Promise<void>;
  clearError: () => void;
}

const message = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong');

export const useBabyCare = create<BabyCareState>((set, get) => ({
  children: [],
  selectedId: null,
  loaded: false,
  loading: false,
  error: null,

  async load() {
    if (get().loading) return;
    set({ loading: true, error: null });
    try {
      const rows = await babycareApi.list();
      const children = rows.map(toChild);
      set((s) => ({
        children,
        loaded: true,
        loading: false,
        selectedId: children.some((c) => c.id === s.selectedId) ? s.selectedId : (children[0]?.id ?? null),
      }));
    } catch (e) {
      /* LOADED STAYS FALSE ON A FAILURE. A hub that reports "no children yet"
         because the network dropped invites the parent to type the record in
         again, and then there are two. The pages read `loaded` and show the
         error rather than the empty state. */
      set({ loading: false, error: message(e) });
    }
  },

  select(id) { set({ selectedId: id }); },

  async addChild(patch) {
    set({ error: null });
    try {
      const row = await babycareApi.create(patch);
      const child = toChild(row);
      set((s) => ({ children: [...s.children, child], selectedId: child.id }));
    } catch (e) {
      set({ error: message(e) });
    }
  },

  async editChild(id, patch) {
    const before = get().children;
    set({
      error: null,
      children: before.map((c) => (c.id === id ? { ...c, ...patch } as Child : c)),
    });
    try {
      const row = await babycareApi.update(id, patch);
      const child = toChild(row);
      set((s) => ({ children: s.children.map((c) => (c.id === id ? child : c)) }));
    } catch (e) {
      set({ children: before, error: message(e) });
    }
  },

  async removeChild(id) {
    const before = get().children;
    const beforeSelected = get().selectedId;
    const left = before.filter((c) => c.id !== id);
    set({ error: null, children: left, selectedId: beforeSelected === id ? (left[0]?.id ?? null) : beforeSelected });
    try {
      await babycareApi.remove(id);
    } catch (e) {
      set({ children: before, selectedId: beforeSelected, error: message(e) });
    }
  },

  clearError() { set({ error: null }); },
}));

/** The child the shelf is reading, or null when there is none yet. */
export function useSelectedChild(): Child | null {
  return useBabyCare((s) => s.children.find((c) => c.id === s.selectedId) ?? null);
}

/**
 * THE BAND THE SHELF IS SET TO.
 *
 * Null when there is no child, or when the child has no birthday on file, or
 * when the birthday is in the future, or when the child is past ten. Each of
 * those is a real state and each one means the same thing to a shelf: show
 * everything, and say why. The pages print the reason rather than silently
 * defaulting to the newborn shelf.
 */
export function useSelectedBand(): AgeBand | null {
  const child = useSelectedChild();
  return child ? bandForDob(child.dob) : null;
}
