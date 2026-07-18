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
    mutationFn: (planKey?: string) => nutritionApi.buildCart(planKey),
    onSuccess: (cart) => qc.setQueryData(['nutrition', 'cart'], cart),
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
