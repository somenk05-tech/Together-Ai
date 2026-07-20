import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { nutritionApi } from './api';
import type { WeekPlan } from './types';

const KEY = (mode: string) => ['nutrition', 'weekly', mode] as const;

export function useWeeklyPlan(mode: 'individual' | 'family' = 'individual') {
  return useQuery({ queryKey: KEY(mode), queryFn: () => nutritionApi.weeklyPlan(mode) });
}

export function useNutritionTargets() {
  return useQuery({ queryKey: ['nutrition', 'targets'], queryFn: () => nutritionApi.targets() });
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
export function useFamilyMemberMutations() {
  const qc = useQueryClient();
  const set = (data: import('./api').FamilyMemberProfile[]) => qc.setQueryData(FAM_KEY, data);
  const add = useMutation({ mutationFn: (dto: import('./api').FamilyMemberInput) => nutritionApi.addFamilyMember(dto), onSuccess: set });
  const update = useMutation({ mutationFn: (v: { id: string; dto: import('./api').FamilyMemberInput }) => nutritionApi.updateFamilyMember(v.id, v.dto), onSuccess: set });
  const remove = useMutation({ mutationFn: (id: string) => nutritionApi.removeFamilyMember(id), onSuccess: set });
  return { add, update, remove };
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
    onSuccess: (plan: WeekPlan) => qc.setQueryData(KEY(mode), plan),
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

export function useBuildCart() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (opts?: { planKey?: string; recipeIds?: string[]; people?: number; mode?: 'individual' | 'family' }) => nutritionApi.buildCart(opts),
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
