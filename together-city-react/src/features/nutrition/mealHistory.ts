import { create } from 'zustand';
import { nutritionApi } from './api';
import type { WeekPlan } from './types';

/**
 * Per-slot "undo the last refresh" history, shared by every meal-planner surface
 * (individual + family, daily + weekly). Each refresh remembers the recipe it
 * replaced; the card's back arrow restores it. Keyed by plan + day + slot so a
 * slot's history is independent across days and plans.
 */
interface HistoryState {
  stacks: Record<string, string[]>;
  push: (key: string, recipeId: string) => void;
  pop: (key: string) => string | undefined;
}

const useHistoryStore = create<HistoryState>((set, get) => ({
  stacks: {},
  push: (key, recipeId) =>
    set((s) => ({ stacks: { ...s.stacks, [key]: [...(s.stacks[key] ?? []), recipeId] } })),
  pop: (key) => {
    const cur = get().stacks[key] ?? [];
    if (!cur.length) return undefined;
    const prev = cur[cur.length - 1];
    set((s) => ({ stacks: { ...s.stacks, [key]: cur.slice(0, -1) } }));
    return prev;
  },
}));

const keyFor = (planKey: string, dayIndex: number, slot: string) => `${planKey}:${dayIndex}:${slot}`;

/**
 * Wire refresh-with-undo for one planner surface. `apply` is the page's existing
 * mutate helper that pushes the returned week into the query cache.
 */
export function useMealSwapHistory(
  planKey: string,
  dayIndex: number,
  apply: (fn: Promise<WeekPlan>) => void,
) {
  const stacks = useHistoryStore((s) => s.stacks);
  const push = useHistoryStore((s) => s.push);
  const pop = useHistoryStore((s) => s.pop);

  return {
    /** Refresh a slot to a new recipe, remembering the one it replaces. */
    onSwap: (slot: string, currentRecipeId: string) => {
      push(keyFor(planKey, dayIndex, slot), currentRecipeId);
      apply(nutritionApi.swapMeal(planKey, dayIndex, slot));
    },
    /** Step back to the recipe shown before the last refresh for this slot. */
    onBack: (slot: string) => {
      const prev = pop(keyFor(planKey, dayIndex, slot));
      if (prev) apply(nutritionApi.swapMeal(planKey, dayIndex, slot, prev));
    },
    /** True when this slot has an earlier recipe to return to. */
    canGoBack: (slot: string) => (stacks[keyFor(planKey, dayIndex, slot)]?.length ?? 0) > 0,
  };
}
