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
  cuisine?: string; diet?: string;
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
/**
 * One step of the working, as the engine returns it. FE-7.1 asks the UI to be
 * able to show "why the number is what it is", and this is what it reads —
 * the app does not re-derive anything for display.
 */
export interface TraceStep { label: string; value: string }

export interface MissingField { field: string; label: string; why: string; href: string }

/**
 * Whether these numbers should be shown as this person's at all (BE-7.4).
 *
 * `ok: false` with an empty `missing` is its own case, not an oversight: the
 * profile is complete and the equation still cannot use the answer given for
 * sex at birth. Nothing to go and fill in.
 */
export type Readiness =
  | { ok: true }
  | { ok: false; missing: MissingField[]; headline: string; body: string };

export interface Prescription {
  kcal: number; protein: number; carb: number; fat: number; fiber: number;
  sodiumMaxMg?: number;
  assumed?: string[];
  personalised?: boolean;
  readiness?: Readiness;
  energyTrace?: { equation: string; inputs: Record<string, string | number>; steps: TraceStep[]; notes: string[] };
  energyFloored?: boolean;
  deficitCapped?: boolean;
}

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
  /** 3-week plan anchor: day 0 = this date (YYYY-MM-DD); reviewDate = start+planDays. */
  planStartDate?: string;
  reviewDate?: string;
  planDays?: number;
  /** Which mode produced this plan. */
  mode?: 'preferred' | 'optimal';
  /** "Inform, don't force" — how the preferred plan compares to the clinical ideal. */
  compliance?: ComplianceReport;
  /** Dual score for this plan + the counterpart mode, so each tab shows both
   *  scores and the difference between the two plans. */
  scorecard?: Scorecard;
  prescription: Prescription;
  fastingSafety: { level: 'ok' | 'warn' | 'block'; notes: string[] };
  basedOnFamily?: { ownerName: string; factor: number };
  readOnly?: boolean;
}

/** Concerns arrive worst-first: the server ranks them by clinical severity, so
 *  concerns[0] is the one most worth telling the citizen about. */
export interface ComplianceConcern { key: string; label: string; message: string; direction: 'over' | 'under'; deltaPct: number; severity: 'info' | 'warn'; weight: number }
export interface ComplianceReport { score: number; concerns: ComplianceConcern[]; swaps: string[]; summary: string }

export interface ScoreNote { key: string; label: string; detail: string; severity: 'ok' | 'info' | 'warn' }
export interface Scorecard {
  mode: PlanMode;
  health: number;                 // 0–100 clinical/nutritional correctness
  preference: number;             // 0–100 match to the saved profile
  healthNotes: ScoreNote[];
  preferenceNotes: ScoreNote[];
  other: { mode: PlanMode; health: number; preference: number };
  summary: string;                // one-line difference between the two plans
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

export type PlanMode = 'preferred' | 'optimal';

/**
 * Whose safety rules the plan is composed under.
 *  · 'self'      — the citizen's own plan (default, unchanged)
 *  · 'household' — the same dishes, but with every household member's allergies,
 *                  exclusions and conditions applied. This is the plan the family
 *                  grocery list already shops from, so it's what the family
 *                  planner must show if the food and the basket are to agree.
 */
export type PlanScope = 'self' | 'household';

export const composedApi = {
  plan: (mode: PlanMode = 'preferred', scope: PlanScope = 'self') =>
    api.get<ComposedWeek>('/nutrition/plan/composed', { params: { mode, scope } }).then((r) => r.data),
  settings: () => api.get<MealSettings>('/nutrition/meal-settings').then((r) => r.data),
  saveSettings: (patch: Partial<MealSettings>) => api.patch<MealSettings>('/nutrition/meal-settings', patch).then((r) => r.data),
};

export function useComposedPlan(mode: PlanMode = 'preferred', scope: PlanScope = 'self') {
  // Scope is part of the key: a household plan and a personal plan are different
  // food and must never share a cache entry.
  return useQuery({ queryKey: ['nutrition', 'composed', mode, scope], queryFn: () => composedApi.plan(mode, scope) });
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
    onSuccess: (wk) => {
      // These mutations always act on the citizen's OWN plan, so the optimistic
      // write goes to the 'self' scope. The key gained a scope segment when the
      // household plan arrived; writing the old 3-part key would have silently
      // updated a cache entry nothing reads. The prefix invalidate below then
      // refreshes any household view that derives from the same preferences.
      qc.setQueryData(['nutrition', 'composed', wk.mode ?? 'preferred', 'self'], wk);
      void qc.invalidateQueries({ queryKey: ['nutrition', 'composed'] });
    },
  });
}
export function useRefreshMeal() { return useComposedMutation<{ day: number; slot: string }>('/nutrition/plan/composed/refresh'); }
export function useSkipMeal() { return useComposedMutation<{ day: number; slot: string; skipped: boolean }>('/nutrition/plan/composed/skip'); }
export function useRestoreSkips() { return useComposedMutation<Record<string, never>>('/nutrition/plan/composed/restore'); }
/**
 * Choose the dish for a slot yourself.
 *
 * Pin returns the plan AND any warnings, so it cannot use the shared mutation
 * helper above — a warning that gets thrown away is worse than no warning,
 * because the citizen then believes the pin took effect exactly as asked.
 */
export function usePinMeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { day: number; slot: string; recipeId: string }) =>
      api.post<ComposedWeek & { warnings?: string[] }>('/nutrition/plan/composed/pin', v).then((r) => r.data),
    onSuccess: (wk) => {
      qc.setQueryData(['nutrition', 'composed', wk.mode ?? 'preferred', 'self'], wk);
      void qc.invalidateQueries({ queryKey: ['nutrition', 'composed'] });
    },
  });
}
export function useUnpinMeal() { return useComposedMutation<{ day: number; slot: string }>('/nutrition/plan/composed/unpin'); }

/** Start a fresh 3-week plan (re-anchor to today, reseed the meals). */
export function useRenewPlan() { return useComposedMutation<Record<string, never>>('/nutrition/plan/composed/renew'); }
/** Per-line (single-dish) Refresh / Skip — reroll or drop one dish by its plate role. */
export function useRefreshComponent() { return useComposedMutation<{ day: number; slot: string; role: string }>('/nutrition/plan/composed/refresh-item'); }
export function useSkipComponent() { return useComposedMutation<{ day: number; slot: string; role: string; skipped: boolean }>('/nutrition/plan/composed/skip-item'); }
