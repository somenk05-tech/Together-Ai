import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { nutritionApi } from './api';

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
      void qc.invalidateQueries({ queryKey: ['nutrition', 'medical-recs'] });
      void qc.invalidateQueries({ queryKey: ['nutrition', 'preferences'] });
      void qc.invalidateQueries({ queryKey: ['nutrition', 'weekly'] });
      void qc.invalidateQueries({ queryKey: ['nutrition', 'targets'] });
      void qc.invalidateQueries({ queryKey: ['nutrition', 'advice'] });
    },
  });
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
  const set = (data: import('./api').FamilyMemberProfile[]) => { qc.setQueryData(FAM_KEY, data); void qc.invalidateQueries({ queryKey: ['nutrition', 'family'] }); void qc.invalidateQueries({ queryKey: ['nutrition', 'grocery-plan'] }); };
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
    onSuccess: (s) => { qc.setQueryData(['nutrition', 'family', 'sharing'], s); void qc.invalidateQueries({ queryKey: ['nutrition', 'family'] }); },
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
  // Cooking a meal draws its ingredients down — refresh the pantry AND the
  // grocery list, which now only asks for what's still missing.
  const cooked = useMutation({
    mutationFn: (v: { mealKey: string; label?: string; people?: number }) => nutritionApi.markCooked(v.mealKey, v.label, v.people),
    onSuccess: (r) => { set(r); void qc.invalidateQueries({ queryKey: ['nutrition', 'grocery-plan'] }); void qc.invalidateQueries({ queryKey: ['nutrition', 'cart'] }); },
  });
  return { add, stock, update, remove, cooked };
}

/** Household invite flow (Nutrition Hub only — separate from social graph). */
export function useHouseholdInvites() {
  return useQuery({ queryKey: ['nutrition', 'family', 'invites'], queryFn: () => nutritionApi.householdInvites() });
}
export function useRespondHouseholdInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; accept: boolean }) => nutritionApi.respondHouseholdInvite(v.id, v.accept),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['nutrition', 'family'] }); void qc.invalidateQueries({ queryKey: ['nutrition', 'grocery-plan'] }); },
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

/** Server-side saved recipes (favourites). */
export function useSavedRecipes() {
  return useQuery({ queryKey: ['nutrition', 'saved'], queryFn: () => nutritionApi.savedRecipes() });
}
export function useToggleSave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, saved }: { id: string; saved: boolean }) => nutritionApi.saveRecipe(id, saved),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['nutrition', 'saved'] }); },
  });
}
/** One-tap real recipe variants (higher protein, vegan, kidney-friendly…). */
export function useRecipeVariants(id: string | undefined, type: string | null) {
  return useQuery({
    queryKey: ['nutrition', 'variants', id, type],
    queryFn: () => nutritionApi.recipeVariants(id as string, type as string),
    enabled: Boolean(id) && Boolean(type),
  });
}

/** Supermarket-style grocery plan (Grocery Planner redesign) — aisles + recipe view. */
/**
 * The basket. Keyed by mode alone — there is no window any more: the server
 * builds it from the days the citizen has locked (owner decision, 1 Aug).
 */
export function useGroceryPlan(
  mode: 'individual' | 'family' = 'individual',
  days?: number,
  startDate?: string,
) {
  // days/startDate are part of the key: three days of shopping and seven days
  // of shopping are different baskets and must never share a cache entry.
  return useQuery({
    queryKey: ['nutrition', 'grocery-plan', mode, days ?? null, startDate ?? null],
    queryFn: () => nutritionApi.groceryPlan(mode, days, startDate),
  });
}

export function useBuildCart() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (opts?: { planKey?: string; recipeIds?: string[]; people?: number; mode?: 'individual' | 'family' }) => nutritionApi.buildCart(opts),
    onSuccess: (cart) => qc.setQueryData(['nutrition', 'cart'], cart),
  });
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
      void qc.invalidateQueries({ queryKey: ['profile'] });
    },
  });
}

export function useWallet() {
  return useQuery({ queryKey: ['nutrition', 'wallet'], queryFn: () => nutritionApi.wallet() });
}




