import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { http as api } from '@/api/client';
import type { MealComponent, OwnDay } from './composed.api';

/**
 * BUILD YOUR DAY — the read side of the loop.
 *
 * Two queries under one key prefix, ['nutrition','day']: the day read (target,
 * what is on it, what is still needed, what to eat now) and the database
 * (filtered for this citizen, ranked by what the day still needs). Both are
 * invalidated by every write to the day — see useOwnMutation — because the
 * remaining requirement is an input to both.
 */

export type NutrientKind = 'budget' | 'target' | 'range';
export type NutrientKey = 'kcal' | 'protein' | 'carbs' | 'fat' | 'fiber';
export interface NutrientLine {
  key: NutrientKey; label: string; unit: 'kcal' | 'g'; kind: NutrientKind; kindLabel: string;
  eaten: number; target: number; low?: number; high?: number; remaining: number;
  status: 'under' | 'ok' | 'over'; said: string;
}
export interface ProteinFix { name: string; amount: string; grams: number; proteinG: number; kcal: number; kind: 'food' | 'supplement'; closes: boolean }
export interface Advice {
  kind: 'over-budget' | 'protein' | 'fat' | 'carbs' | 'fibre' | 'done' | 'start';
  headline: string; body: string; options?: string[]; fixes?: ProteinFix[];
  priorities?: Array<'protein' | 'fibre' | 'lower-fat' | 'lower-carb' | 'light'>;
}
export interface Recommended extends MealComponent { portionPct: number; fits: boolean; why: string }
export interface DayTarget {
  kcal: number; protein: number; carb: number; fat: number; fiber: number;
  kind: Record<NutrientKey, NutrientKind>;
  personalised: boolean; assumed: string[]; estimate: boolean; ready: boolean;
  readiness: { ok: boolean; missing?: Array<{ field: string; label: string; why: string; href: string }>; headline?: string; body?: string } | null;
  bloodInformed: boolean; adjustments: string[]; basis: string;
}
export interface DayRead {
  target: DayTarget;
  day: OwnDay | null;
  dayIndex: number; dayISO: string; live: boolean;
  lines: NutrientLine[];
  remaining: { kcal: number; protein: number; carbs: number; fat: number; fiber: number };
  priorities: Array<{ key: string; label: string }>;
  next: string;
  nextSlot: { slot: 'b' | 'l' | 'es' | 'd'; key: string; label: string; start: string; open: boolean };
  recommend: Recommended[];
  advice: Advice[];
  pool: { eligible: number; all: number; hidden: number };
  constraints: { diet: string; excluded: number; cuisines: string[]; clinical: boolean };
}

export interface DayRecipe {
  id: string; name: string; cuisine: string; diet: string;
  kcal: number; protein: number; carbs: number; fat: number; fiber: number;
  minutes: number; grams: number; imageUrl: string | null; slot: 'b' | 'l' | 'es' | 'd';
  fit: { portionPct: number; fits: boolean; score: number; grams: number; kcal: number; protein: number; fiber: number };
}
export interface DayRecipesResult {
  items: DayRecipe[]; total: number; page: number; pageSize: number; pages: number;
  cuisines: Array<{ name: string; count: number }>;
  pool: { eligible: number; all: number; hidden: number };
  slot: string; remaining: DayRead['remaining']; priorities: Array<{ key: string; label: string }>;
}
export interface DayRecipesQuery {
  search?: string; cuisine?: string; mealType?: string; ingredients?: string; page?: number; sort?: string; now?: string;
}

/** The browser's clock, as HH:MM — the server has no other way to know what
 *  time it is where the citizen is eating. */
export function nowHHMM(d = new Date()): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function useBuildYourDay(now: string) {
  return useQuery({
    queryKey: ['nutrition', 'day', 'read', now],
    queryFn: () => api.get<DayRead>('/nutrition/day', { params: { now } }).then((r) => r.data),
    placeholderData: keepPreviousData,
  });
}

export function useDayRecipes(q: DayRecipesQuery, enabled = true) {
  return useQuery({
    queryKey: ['nutrition', 'day', 'recipes', q],
    queryFn: () => api.get<DayRecipesResult>('/nutrition/day/recipes', { params: q }).then((r) => r.data),
    enabled,
    placeholderData: keepPreviousData,
  });
}

/** The journal's reader, borrowed: a sentence in, reviewed estimates out. */
export interface EstimateItem {
  name: string; qty: number; unit: string; grams?: number;
  kcal: number; proteinG: number; carbG: number; fatG: number; fibreG?: number; confidence?: number;
}
export interface EstimateResult { available: boolean; items: EstimateItem[]; note?: string }
export const estimateFood = (text: string) =>
  api.post<EstimateResult>('/nutrition/journal/analyze', { text }).then((r) => r.data);
