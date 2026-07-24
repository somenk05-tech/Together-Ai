import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { http as api } from '@/api/client';

/* Types mirror the backend meal-composer output (Meal-Planning-Engine-Spec). */
export interface MealIngredient { name: string; grams: number; pantry: boolean; toTaste?: boolean }
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
  meals: ComposedMeal[]; totals: { kcal: number; protein: number; carbs: number; fat: number; fiber: number; sodiumMg?: number; potassiumMg?: number };
  capBreaches?: string[];
}
export interface GroceryItem { name: string; grams: number; unit: string; pantry: boolean; fromRecipes: string[] }
export interface ComposedWeek {
  days: ComposedDay[];
  grocery: GroceryItem[];
  targets: { kcal: number; protein: number; carbs: number; fat: number; fiber: number };
  fasting: boolean; protocol: string | null;
  validation: { ok: boolean; issues: string[] };
  /** Clinical safety gate: when true, a clinical plan could not be made to meet its
   *  medical caps — the UI must warn instead of presenting it as certified-safe. */
  blocked?: boolean;
  blockReason?: string[];
  /** Resilience fallback: a general plan shown because the full profile couldn't be read. */
  degraded?: boolean;
  degradedReason?: string;
  /** Master-source-of-truth gate: true when no Food Preference Profile is saved. */
  needsProfile?: boolean;
  /** Skipped meal keys ("d{index}:{slot}") for this week. */
  skips?: string[];
  /** "Inform, don't force" — how the preferred plan compares to the clinical ideal. */
  compliance?: ComplianceReport;
  prescription: { kcal: number; protein: number; carb: number; fat: number; fiber: number; sodiumMaxMg?: number };
  fastingSafety: { level: 'ok' | 'warn' | 'block'; notes: string[] };
  basedOnFamily?: { ownerName: string; factor: number };
  readOnly?: boolean;
}

export interface ComplianceConcern { key: string; label: string; message: string; direction: 'over' | 'under'; deltaPct: number; severity: 'info' | 'warn' }
export interface ComplianceReport { score: number; concerns: ComplianceConcern[]; swaps: string[]; summary: string }

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

/** Per-meal Refresh / Skip / Restore — each returns the updated week and refreshes the cache. */
function useComposedMutation<V>(path: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: V) => api.post<ComposedWeek>(path, body).then((r) => r.data),
    onSuccess: (wk) => { qc.setQueryData(['nutrition', 'composed'], wk); },
  });
}
export function useRefreshMeal() { return useComposedMutation<{ day: number; slot: string }>('/nutrition/plan/composed/refresh'); }
export function useSkipMeal() { return useComposedMutation<{ day: number; slot: string; skipped: boolean }>('/nutrition/plan/composed/skip'); }
export function useRestoreSkips() { return useComposedMutation<Record<string, never>>('/nutrition/plan/composed/restore'); }
