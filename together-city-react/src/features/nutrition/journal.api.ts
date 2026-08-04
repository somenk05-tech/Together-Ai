import { http as api } from '@/api/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

/** AI Food Journal — types mirror food-journal.dto.ts on the API. */

export interface JournalItem {
  name: string; qty: number; unit: string; grams?: number;
  kcal: number; proteinG: number; carbG: number; fatG: number;
  fibreG?: number; sugarG?: number; sodiumMg?: number; waterMl?: number;
  confidence?: number;
}
export interface JournalTotals {
  kcal: number; proteinG: number; carbG: number; fatG: number;
  fibreG: number; sugarG: number; sodiumMg: number; waterMl: number;
}
export interface JournalEntry {
  id: string; at: string; mealType: MealType; source: string;
  items: JournalItem[]; totals: JournalTotals; photoUrl: string | null; note: string | null;
}
export type MealType = 'breakfast' | 'morning-snack' | 'lunch' | 'evening-snack' | 'dinner' | 'other';
export const MEAL_LABEL: Record<MealType, string> = {
  'breakfast': 'Breakfast', 'morning-snack': 'Morning snack', 'lunch': 'Lunch',
  'evening-snack': 'Evening snack', 'dinner': 'Dinner', 'other': 'Other',
};

export interface AnalyzeResult { available: boolean; items: JournalItem[]; note: string; totals?: JournalTotals }
export interface JournalDay {
  date: string;
  entries: JournalEntry[];
  totals: JournalTotals;
  target: { kcal: number; proteinG: number; carbG: number; fatG: number; fibreG: number; waterMl: number; sodiumMaxMg?: number; personalised: boolean; assumed: string[] };
  remainingKcal: number;
  coach: string[];
  basis: string;
}
export interface JournalWeek {
  days: Array<JournalTotals & { date: string; meals: number }>;
  targetKcal: number;
  loggedDays: number;
  avg: { kcal: number; proteinG: number; carbG: number; fatG: number; fibreG: number; waterMl: number };
}

export const journalApi = {
  analyze: (input: { photo?: string; mediaType?: string; text?: string }) =>
    api.post<AnalyzeResult>('/nutrition/journal/analyze', input).then((r) => r.data),
  log: (input: { at?: string; mealType: MealType; source: string; items: JournalItem[]; photoUrl?: string; note?: string }) =>
    api.post<{ entry: JournalEntry; day: JournalDay }>('/nutrition/journal', input).then((r) => r.data),
  day: (date?: string) =>
    api.get<JournalDay>('/nutrition/journal', { params: date ? { date } : {} }).then((r) => r.data),
  week: () => api.get<JournalWeek>('/nutrition/journal/week').then((r) => r.data),
  update: (id: string, items: JournalItem[]) =>
    api.patch<JournalEntry>(`/nutrition/journal/${id}`, { items }).then((r) => r.data),
  remove: (id: string) => api.delete<{ ok: boolean }>(`/nutrition/journal/${id}`).then((r) => r.data),
};

export function useJournalDay(date?: string) {
  return useQuery({ queryKey: ['nutrition', 'journal', 'day', date ?? 'today'], queryFn: () => journalApi.day(date) });
}
export function useJournalWeek() {
  return useQuery({ queryKey: ['nutrition', 'journal', 'week'], queryFn: () => journalApi.week() });
}
export function useAnalyzeMeal() {
  return useMutation({ mutationFn: journalApi.analyze });
}
export function useLogMeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: journalApi.log,
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['nutrition', 'journal'] }); },
  });
}
export function useRemoveMeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: journalApi.remove,
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['nutrition', 'journal'] }); },
  });
}

/** The meal slot a clock hour usually means — a default, never a decision. */
export function mealTypeForHour(h: number): MealType {
  if (h < 11) return 'breakfast';
  if (h < 12) return 'morning-snack';
  if (h < 15) return 'lunch';
  if (h < 18) return 'evening-snack';
  if (h < 22) return 'dinner';
  return 'other';
}
