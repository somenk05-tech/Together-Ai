import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { http as api } from '@/api/client';

/* Types mirror the backend meal-composer output (Meal-Planning-Engine-Spec). */
export interface MealIngredient { name: string; grams: number; pantry: boolean }
export interface MealComponent {
  recipeId: string; name: string; role: string; category: string;
  portionPct: number; grams: number;
  kcal: number; protein: number; carbs: number; fat: number; fiber: number;
  sodiumMg: number; potassiumMg: number; phosphorusMg: number; sugarG: number; addedSugarG: number; satFatG: number;
  nutrientComplete: boolean;
  steps: string[]; imageUrl?: string | null;
  minutes: number; ingredients: MealIngredient[];
}
export interface ComposedMeal {
  slot: string; key: string; label: string; title: string;
  scheduledTime: string; energyPct: number; targetKcal: number;
  totals: { kcal: number; protein: number; carbs: number; fat: number; fiber: number };
  minutes: number; components: MealComponent[];
}
export interface ComposedDay {
  dayIndex: number; fasting: boolean; protocol: string | null;
  window: { start: string; end: string };
  meals: ComposedMeal[]; totals: { kcal: number; protein: number; carbs: number; fat: number; fiber: number };
  capBreaches?: string[];
}
export interface GroceryItem { name: string; grams: number; unit: string; pantry: boolean; fromRecipes: string[] }
export interface ComposedWeek {
  days: ComposedDay[];
  grocery: GroceryItem[];
  targets: { kcal: number; protein: number; carbs: number; fat: number; fiber: number };
  fasting: boolean; protocol: string | null;
  validation: { ok: boolean; issues: string[] };
  prescription: { kcal: number; protein: number; carb: number; fat: number; fiber: number };
  fastingSafety: { level: 'ok' | 'warn' | 'block'; notes: string[] };
  basedOnFamily?: { ownerName: string; factor: number };
  readOnly?: boolean;
}

export type CuisineBucket = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export interface MealSettings {
  cuisineBySlot: Partial<Record<CuisineBucket, Record<string, number>>>;
  cuisineLocks: Partial<Record<CuisineBucket, boolean>>;
  fasting: { enabled?: boolean; protocol?: string; window?: { start: string; end: string }; mealTimes?: Record<string, string> };
  includePantry: boolean;
  schedule: { fasting: boolean; protocol: string | null; window: { start: string; end: string }; meals: Array<{ code: string; key: string; label: string; scheduledTime: string; energy: number }> };
  fastingSafety: { level: 'ok' | 'warn' | 'block'; notes: string[] };
}

export const composedApi = {
  plan: () => api.get<ComposedWeek>('/nutrition/plan/composed').then((r) => r.data),
  settings: () => api.get<MealSettings>('/nutrition/meal-settings').then((r) => r.data),
  saveSettings: (patch: Partial<MealSettings>) => api.patch<MealSettings>('/nutrition/meal-settings', patch).then((r) => r.data),
};

export function useComposedPlan() {
  return useQuery({ queryKey: ['nutrition', 'composed'], queryFn: () => composedApi.plan() });
}
export function useMealSettings() {
  return useQuery({ queryKey: ['nutrition', 'meal-settings'], queryFn: () => composedApi.settings() });
}
export function useSaveMealSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<MealSettings>) => composedApi.saveSettings(patch),
    onSuccess: (s) => {
      qc.setQueryData(['nutrition', 'meal-settings'], s);
      void qc.invalidateQueries({ queryKey: ['nutrition', 'composed'] });   // schedule/cuisine changed → replan
    },
  });
}
