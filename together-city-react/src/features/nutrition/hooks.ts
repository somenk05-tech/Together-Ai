import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { nutritionApi } from './api';
import type { WeekPlan } from './types';

const KEY = (mode: string) => ['nutrition', 'weekly', mode] as const;
const DAILY_KEY = (mode: string) => ['nutrition', 'daily', mode] as const;

/** The Weekly planner — the master. Bootstraps a first plan when none exists;
 *  never auto-regenerates a saved plan. */
export function useWeeklyPlan(mode: 'individual' | 'family' = 'individual') {
  return useQuery({ queryKey: KEY(mode), queryFn: () => nutritionApi.weeklyPlan(mode) });
}

/** The Daily planner — a strictly read-only view of the SAME saved plan. Never
 *  generates (backend readOnly); returns needsPlan when no week is saved yet. */
export function useDailyPlan(mode: 'individual' | 'family' = 'individual') {
  return useQuery({ queryKey: DAILY_KEY(mode), queryFn: () => nutritionApi.weeklyPlan(mode, true) });
}

/** Every saved week — the calendar/timeline. */
export function useWeeks(mode: 'individual' | 'family' = 'individual') {
  return useQuery({ queryKey: ['nutrition', 'weeks', mode], queryFn: () => nutritionApi.weeks(mode) });
}

/** Load one saved week by key (revisit a past week from the timeline). */
export function useWeekByKey(key: string | null) {
  return useQuery({ queryKey: ['nutrition', 'week', key], queryFn: () => nutritionApi.weekByKey(key as string), enabled: Boolean(key) });
}

/** Generate a brand-new week (never overwrites existing weeks). */
export function useNewWeek(mode: 'individual' | 'family' = 'individual') {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => nutritionApi.newWeek(mode),
    onSuccess: (plan) => { syncPlanCaches(qc, mode, plan); void qc.invalidateQueries({ queryKey: ['nutrition', 'weeks', mode] }); },
  });
}

/** Duplicate a saved week's meals into a new (empty) week. */
export function useDuplicateWeek(mode: 'individual' | 'family' = 'individual') {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sourceKey: string) => nutritionApi.duplicateWeek(sourceKey, mode),
    onSuccess: (plan) => { syncPlanCaches(qc, mode, plan); void qc.invalidateQueries({ queryKey: ['nutrition', 'weeks', mode] }); },
  });
}

/**
 * Push an edited/returned week into BOTH the weekly and daily caches so the two
 * views are ALWAYS the same single plan (edit in one → appears instantly in the
 * other), then refresh the dependents (day summary, grocery list, history).
 * The DB is already updated by the mutating call; this just keeps the client in
 * lockstep without a refetch round-trip.
 */
export function syncPlanCaches(qc: QueryClient, mode: string, plan: WeekPlan) {
  const merge = (prev: WeekPlan | undefined) => ({ ...((prev ?? {}) as WeekPlan), ...plan });
  qc.setQueryData(KEY(mode), merge);
  qc.setQueryData(DAILY_KEY(mode), merge);
  void qc.invalidateQueries({ queryKey: ['nutrition', 'summary'] });
  void qc.invalidateQueries({ queryKey: ['nutrition', 'week-summary'] });
  void qc.invalidateQueries({ queryKey: ['nutrition', 'grocery-plan'] });
  void qc.invalidateQueries({ queryKey: ['nutrition', 'history', mode] });
  void qc.invalidateQueries({ queryKey: ['nutrition', 'weeks', mode] });
}

export function useNutritionTargets() {
  return useQuery({ queryKey: ['nutrition', 'targets'], queryFn: () => nutritionApi.targets() });
}

/** Medical Nutrition Recommendations — shown above the meal plan. */
export function useMedicalRecs() {
  return useQuery({ queryKey: ['nutrition', 'medical-recs'], queryFn: () => nutritionApi.medicalRecs() });
}
export function useDecideMedicalRec() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { condition: string; choice: 'apply' | 'keep' }) => nutritionApi.decideMedicalRec(v.condition, v.choice),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['nutrition', 'medical-recs'] });
      qc.invalidateQueries({ queryKey: ['nutrition', 'preferences'] });
      qc.invalidateQueries({ queryKey: ['nutrition', 'weekly'] });
      qc.invalidateQueries({ queryKey: ['nutrition', 'targets'] });
      qc.invalidateQueries({ queryKey: ['nutrition', 'advice'] });
    },
  });
}

/** Personalized Nutrition Advice — dietary-balance advisories for the overview. */
export function useNutritionAdvice() {
  return useQuery({ queryKey: ['nutrition', 'advice'], queryFn: () => nutritionApi.advice() });
}

export function useNutritionHistory(mode: 'individual' | 'family' = 'individual') {
  return useQuery({ queryKey: ['nutrition', 'history', mode], queryFn: () => nutritionApi.history(mode) });
}

const FAM_KEY = ['nutrition', 'family', 'members'] as const;
export function useFamilyMembers() {
  return useQuery({ queryKey: FAM_KEY, queryFn: () => nutritionApi.familyMembers() });
}
export function useFamilyPortions(dayIndex: number) {
  return useQuery({ queryKey: ['nutrition', 'family', 'portions', dayIndex], queryFn: () => nutritionApi.familyPortions(dayIndex) });
}
export function useFamilyDashboard() {
  return useQuery({ queryKey: ['nutrition', 'family', 'dashboard'], queryFn: () => nutritionApi.familyDashboard() });
}
export function useFamilyProfile() {
  return useQuery({ queryKey: ['nutrition', 'family', 'profile'], queryFn: () => nutritionApi.familyProfile() });
}
export function useFamilyHealth() {
  return useQuery({ queryKey: ['nutrition', 'family', 'health'], queryFn: () => nutritionApi.familyHealth() });
}
export function useFamilyMemberMutations() {
  const qc = useQueryClient();
  const set = (data: import('./api').FamilyMemberProfile[]) => { qc.setQueryData(FAM_KEY, data); qc.invalidateQueries({ queryKey: ['nutrition', 'family'] }); qc.invalidateQueries({ queryKey: ['nutrition', 'grocery-plan'] }); };
  const update = useMutation({ mutationFn: (v: { id: string; dto: import('./api').FamilyMemberInput }) => nutritionApi.updateFamilyMember(v.id, v.dto), onSuccess: set });
  const remove = useMutation({ mutationFn: (id: string) => nutritionApi.removeFamilyMember(id), onSuccess: set });
  return { update, remove };
}

/** Privacy — what I share with households I belong to. */
export function useHouseholdSharing() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ['nutrition', 'family', 'sharing'], queryFn: () => nutritionApi.householdSharing() });
  const update = useMutation({
    mutationFn: (patch: Partial<import('./api').HouseholdSharing>) => nutritionApi.setHouseholdSharing(patch),
    onSuccess: (s) => { qc.setQueryData(['nutrition', 'family', 'sharing'], s); qc.invalidateQueries({ queryKey: ['nutrition', 'family'] }); },
  });
  return { query, update };
}

/** Family Meal Planning mode — the shared household toggle + this user's role.
 *  Toggling regenerates nobody automatically; members derive live from the
 *  master plan, so every planner cache is invalidated to re-read on next view. */
export function useFamilyMealPlanning() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ['nutrition', 'family', 'meal-planning'], queryFn: () => nutritionApi.familyMealPlanning() });
  const update = useMutation({
    mutationFn: (on: boolean) => nutritionApi.setFamilyMealPlanning(on),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['nutrition', 'family', 'meal-planning'] });
      void qc.invalidateQueries({ queryKey: ['nutrition', 'weekly'] });
      void qc.invalidateQueries({ queryKey: ['nutrition', 'daily'] });
    },
  });
  return { query, update };
}

/** Shared household pantry. */
export function usePantry() {
  return useQuery({ queryKey: ['nutrition', 'family', 'pantry'], queryFn: () => nutritionApi.pantry() });
}
export function usePantryMutations() {
  const qc = useQueryClient();
  const set = (v: import('./api').PantryView) => qc.setQueryData(['nutrition', 'family', 'pantry'], v);
  const add = useMutation({ mutationFn: (v: { name: string; grams?: number }) => nutritionApi.addPantryItem(v.name, v.grams), onSuccess: set });
  const stock = useMutation({ mutationFn: () => nutritionApi.stockPantry(), onSuccess: set });
  const update = useMutation({ mutationFn: (v: { id: string; grams: number }) => nutritionApi.updatePantryItem(v.id, v.grams), onSuccess: set });
  const remove = useMutation({ mutationFn: (id: string) => nutritionApi.removePantryItem(id), onSuccess: set });
  return { add, stock, update, remove };
}

/** Household invite flow (Nutrition Hub only — separate from social graph). */
export function useHouseholdInvites() {
  return useQuery({ queryKey: ['nutrition', 'family', 'invites'], queryFn: () => nutritionApi.householdInvites() });
}
export function useInviteHousehold() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { userRef: string; role: import('./api').HouseholdRole }) => nutritionApi.inviteHousehold(v.userRef, v.role),
    onSuccess: (r) => { qc.setQueryData(FAM_KEY, r.household); qc.invalidateQueries({ queryKey: ['nutrition', 'family'] }); qc.invalidateQueries({ queryKey: ['nutrition', 'grocery-plan'] }); },
  });
}
export function useRespondHouseholdInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; accept: boolean }) => nutritionApi.respondHouseholdInvite(v.id, v.accept),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['nutrition', 'family'] }); qc.invalidateQueries({ queryKey: ['nutrition', 'grocery-plan'] }); },
  });
}

/** Auto-repair a saved day in place (swaps + portions) so it meets the
 *  prescription — invalidates the day summary and both plan views. */
export function useRepairDay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { planKey: string; dayIndex: number }) => nutritionApi.repairDay(v.planKey, v.dayIndex),
    onSuccess: (_r, v) => {
      qc.invalidateQueries({ queryKey: ['nutrition', 'summary', v.planKey, v.dayIndex] });
      qc.invalidateQueries({ queryKey: ['nutrition', 'week-summary'] });
      qc.invalidateQueries({ queryKey: ['nutrition', 'weekly'] });
      qc.invalidateQueries({ queryKey: ['nutrition', 'daily'] });
    },
  });
}

export function useWeekNutrition(planKey: string | undefined) {
  return useQuery({
    queryKey: ['nutrition', 'week-summary', planKey],
    queryFn: () => nutritionApi.weekSummary(planKey as string),
    enabled: Boolean(planKey),
  });
}

export function useDaySummary(planKey: string | undefined, dayIndex: number) {
  return useQuery({
    queryKey: ['nutrition', 'summary', planKey, dayIndex],
    queryFn: () => nutritionApi.daySummary(planKey as string, dayIndex),
    enabled: Boolean(planKey),
  });
}

export function useRegenerateWeek(mode: 'individual' | 'family' = 'individual') {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => nutritionApi.regenerate(mode),
    onSuccess: (plan: WeekPlan) => syncPlanCaches(qc, mode, plan),
  });
}

export function useRecipes(diet?: string) {
  return useQuery({ queryKey: ['nutrition', 'recipes', diet ?? 'everything'], queryFn: () => nutritionApi.recipes(diet) });
}

export function useSearchRecipes(ingredients: string[], diet?: string) {
  return useQuery({
    queryKey: ['nutrition', 'recipes-search', diet ?? 'everything', ingredients.join(',')],
    queryFn: () => nutritionApi.searchRecipes(ingredients, diet),
    enabled: ingredients.length > 0,
  });
}

export function useRecipe(id: string | undefined) {
  return useQuery({
    queryKey: ['nutrition', 'recipe', id],
    queryFn: () => nutritionApi.recipe(id as string),
    enabled: Boolean(id),
  });
}

export function useGroceryCart() {
  return useQuery({ queryKey: ['nutrition', 'cart'], queryFn: () => nutritionApi.cart() });
}

/** Supermarket-style grocery plan (Grocery Planner redesign) — aisles + recipe view. */
export function useGroceryPlan(mode: 'individual' | 'family' = 'individual') {
  return useQuery({
    queryKey: ['nutrition', 'grocery-plan', mode],
    queryFn: () => nutritionApi.groceryPlan(mode),
  });
}

export function useBuildCart() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (opts?: { planKey?: string; recipeIds?: string[]; people?: number; mode?: 'individual' | 'family' }) => nutritionApi.buildCart(opts),
    onSuccess: (cart) => qc.setQueryData(['nutrition', 'cart'], cart),
  });
}

/** Combined family grocery — merges every member's portions + protein swaps. */
export function useBuildFamilyCart() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => nutritionApi.buildFamilyCart(),
    onSuccess: (cart) => qc.setQueryData(['nutrition', 'cart'], cart),
  });
}

export function useHealthLog(dates: string[]) {
  return useQuery({
    queryKey: ['nutrition', 'health', dates.join(',')],
    queryFn: () => nutritionApi.healthLog(dates),
    enabled: dates.length > 0,
  });
}

export function useAddCalorie() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (e: { date: string; name: string; kcal: number; type: 'Meal Plan' | 'Extra' | 'Alcohol' }) => nutritionApi.addCalorie(e),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['nutrition', 'health'] }),
  });
}

export function useRemoveCalorie() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => nutritionApi.removeCalorie(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['nutrition', 'health'] }),
  });
}

export function useBloodPanel() {
  return useQuery({ queryKey: ['nutrition', 'blood'], queryFn: () => nutritionApi.blood() });
}

export function useSaveBlood() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Record<string, number>) => nutritionApi.saveBlood(input),
    onSuccess: (panel) => {
      qc.setQueryData(['nutrition', 'blood'], panel);
      void qc.invalidateQueries({ queryKey: ['nutrition', 'supplements'] });
    },
  });
}

export function useSupplements() {
  return useQuery({ queryKey: ['nutrition', 'supplements'], queryFn: () => nutritionApi.supplements() });
}

export function useDietitians() {
  return useQuery({ queryKey: ['nutrition', 'dietitians'], queryFn: () => nutritionApi.dietitians() });
}

export function useBookDietitian() {
  return useMutation({ mutationFn: (id: string) => nutritionApi.bookDietitian(id) });
}

export function useFoodPref() {
  return useQuery({ queryKey: ['nutrition', 'preferences'], queryFn: () => nutritionApi.preferences() });
}

export function useUpdateFoodPref() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof nutritionApi.updatePreferences>[0]) => nutritionApi.updatePreferences(input),
    onSuccess: (pref) => {
      qc.setQueryData(['nutrition', 'preferences'], pref);
      void qc.invalidateQueries({ queryKey: ['nutrition', 'targets'] });
      void qc.invalidateQueries({ queryKey: ['nutrition', 'weekly'] });
    },
  });
}

export function useWallet() {
  return useQuery({ queryKey: ['nutrition', 'wallet'], queryFn: () => nutritionApi.wallet() });
}

export function useOrders() {
  return useQuery({ queryKey: ['nutrition', 'orders'], queryFn: () => nutritionApi.orders() });
}

export function usePlaceOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (method: 'wallet' | 'card' = 'wallet') => nutritionApi.placeOrder(method),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['nutrition', 'orders'] });
      void qc.invalidateQueries({ queryKey: ['nutrition', 'wallet'] });
      void qc.invalidateQueries({ queryKey: ['financial'] });
    },
  });
}

export function useCancelDelivery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { orderId: string; deliveryId: string }) => nutritionApi.cancelDelivery(v.orderId, v.deliveryId),
    onSuccess: (orders) => {
      qc.setQueryData(['nutrition', 'orders'], orders);
      void qc.invalidateQueries({ queryKey: ['nutrition', 'wallet'] });
    },
  });
}

// ───── Quick Commerce — find the grocery list across online stores ─────

export function useQcCompare(mode: 'individual' | 'family' = 'individual', enabled = true) {
  return useQuery({
    queryKey: ['nutrition', 'qc-compare', mode],
    queryFn: () => nutritionApi.qcCompare(mode),
    enabled,
    staleTime: 5 * 60_000,
  });
}

export function useQcSearch() {
  return useMutation({ mutationFn: (q: string) => nutritionApi.qcSearch(q) });
}

export function useQcOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ provider, mode, method }: { provider: string; mode?: 'individual' | 'family'; method?: 'wallet' | 'card' }) =>
      nutritionApi.qcOrder(provider, mode ?? 'individual', method ?? 'wallet'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['nutrition', 'orders'] }),
  });
}

/** Live tracking — polls while the order is on its way, stops once delivered. */
export function useQcTrack(orderId: string | null, delivered = false) {
  return useQuery({
    queryKey: ['nutrition', 'qc-track', orderId],
    queryFn: () => nutritionApi.qcTrack(orderId as string),
    enabled: !!orderId,
    refetchInterval: delivered ? false : 10_000,
  });
}

export function useNutritionOrders() {
  return useQuery({ queryKey: ['nutrition', 'orders'], queryFn: nutritionApi.orders });
}
