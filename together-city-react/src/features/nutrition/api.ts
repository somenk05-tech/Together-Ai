import { http as api } from '@/api/client';
import type { WeekPlan, DaySummary, NutritionTargets, Sides, Recipe, NutritionHistoryWeek } from './types';

/** Nutrition endpoints on the NestJS backend (no engine logic duplicated client-side). */
export const nutritionApi = {
  weeklyPlan: (mode: 'individual' | 'family' = 'individual') =>
    api.get<WeekPlan>('/nutrition/plan/weekly', { params: { mode } }).then((r) => r.data),
  history: (mode?: 'individual' | 'family') =>
    api.get<NutritionHistoryWeek[]>('/nutrition/history', { params: mode ? { mode } : undefined }).then((r) => r.data),
  historyDetail: (id: string) =>
    api.get<Record<string, unknown>>(`/nutrition/history/${id}`).then((r) => r.data),
  familyMembers: () => api.get<FamilyMemberProfile[]>('/nutrition/family/members').then((r) => r.data),
  addFamilyMember: (dto: FamilyMemberInput) => api.post<FamilyMemberProfile[]>('/nutrition/family/members', dto).then((r) => r.data),
  updateFamilyMember: (id: string, dto: FamilyMemberInput) => api.patch<FamilyMemberProfile[]>(`/nutrition/family/members/${id}`, dto).then((r) => r.data),
  removeFamilyMember: (id: string) => api.delete<FamilyMemberProfile[]>(`/nutrition/family/members/${id}`).then((r) => r.data),
  familyPortions: (dayIndex: number) => api.get<FamilyPortions>(`/nutrition/family/portions/${dayIndex}`).then((r) => r.data),
  buildFamilyCart: () => api.post<GroceryCart>('/nutrition/family/cart', {}).then((r) => r.data),
  regenerate: (mode: 'individual' | 'family' = 'individual') =>
    api.post<WeekPlan>('/nutrition/plan/weekly/regenerate', { mode }).then((r) => r.data),
  daySummary: (planKey: string, dayIndex: number) =>
    api.get<DaySummary>(`/nutrition/plan/${planKey}/day/${dayIndex}/summary`).then((r) => r.data),
  targets: () => api.get<NutritionTargets>('/nutrition/targets').then((r) => r.data),
  swapMeal: (planKey: string, dayIndex: number, slot: string) =>
    api.post<WeekPlan>(`/nutrition/plan/${planKey}/day/${dayIndex}/swap`, { slot }).then((r) => r.data),
  skipMeal: (planKey: string, dayIndex: number, slot: string, skipped: boolean) =>
    api.post<WeekPlan>(`/nutrition/plan/${planKey}/day/${dayIndex}/skip`, { slot, skipped }).then((r) => r.data),
  healthLog: (dates: string[]) =>
    api.get<{ entries: CalorieEntry[] }>('/nutrition/health/log', { params: { dates: dates.join(',') } }).then((r) => r.data),
  addCalorie: (e: { date: string; name: string; kcal: number; type: CalorieType }) =>
    api.post<{ entries: CalorieEntry[] }>('/nutrition/health/log', e).then((r) => r.data),
  removeCalorie: (id: string) =>
    api.delete<{ ok: boolean }>(`/nutrition/health/log/${id}`).then((r) => r.data),
  setSides: (planKey: string, dayIndex: number, slot: string, sides: Sides) =>
    api.patch<WeekPlan>(`/nutrition/plan/${planKey}/day/${dayIndex}/sides`, { slot, sides }).then((r) => r.data),
  recipes: (diet?: string) =>
    api.get<Recipe[]>('/nutrition/recipes', { params: diet && diet !== 'everything' ? { diet } : undefined }).then((r) => r.data),
  searchRecipes: (ingredients: string[], diet?: string) =>
    api.get<Recipe[]>('/nutrition/recipes/search', {
      params: { ingredients: ingredients.join(','), ...(diet && diet !== 'everything' ? { diet } : {}) },
    }).then((r) => r.data),
  recipe: (id: string) =>
    api.get<RecipeDetail>(`/nutrition/recipes/${id}`).then((r) => r.data),
  cart: () => api.get<GroceryCart>('/nutrition/cart').then((r) => r.data),
  buildCart: (opts?: { planKey?: string; recipeIds?: string[]; people?: number; mode?: 'individual' | 'family' }) =>
    api.post<GroceryCart>('/nutrition/cart', opts ?? {}).then((r) => r.data),
  blood: () => api.get<BloodPanel>('/nutrition/blood').then((r) => r.data),
  saveBlood: (input: Record<string, number>) =>
    api.post<BloodPanel>('/nutrition/blood', input).then((r) => r.data),
  supplements: () => api.get<SupplementPlan>('/nutrition/supplements').then((r) => r.data),
  dietitians: () => api.get<DietitianCard[]>('/nutrition/dietitians').then((r) => r.data),
  bookDietitian: (id: string) =>
    api.post<{ bookingId: string; conversationId: string }>(`/nutrition/dietitians/${id}/book`, {}).then((r) => r.data),
  preferences: () => api.get<FoodPref>('/nutrition/preferences').then((r) => r.data),
  updatePreferences: (input: Partial<FoodPref>) =>
    api.patch<FoodPref>('/nutrition/preferences', input).then((r) => r.data),
  wallet: () => api.get<Wallet>('/nutrition/wallet').then((r) => r.data),
  orders: () => api.get<NutritionOrder[]>('/nutrition/orders').then((r) => r.data),
  placeOrder: (method: 'wallet' | 'card' = 'wallet') => api.post<NutritionOrder>('/nutrition/orders', { method }).then((r) => r.data),
  cancelDelivery: (orderId: string, deliveryId: string) =>
    api.post<NutritionOrder[]>(`/nutrition/orders/${orderId}/deliveries/${deliveryId}/cancel`, {}).then((r) => r.data),
};

export type CalorieType = 'Meal Plan' | 'Extra' | 'Alcohol';
export interface FamilyMemberProfile {
  id: string; name: string; role: string; sex: string; age: number; heightCm: number;
  weightKg: number; activity: number; goal: string; diet: string; isSelf: boolean;
  proteins: string[]; cuisines: string[]; allergies: string; healthConditions: string[];
  targets: { kcal: number; protein: number; carb: number; fat: number; fiber: number; adjustments: string[] };
}
export interface FamilyMemberInput {
  name: string; role: string; sex: string; age: number; heightCm: number; weightKg: number;
  activity: number; goal: string; diet: string; healthConditions: string[]; allergies?: string;
}
export interface MemberPortion {
  memberId: string; name: string; role: string; factor: number; grams: number; kcal: number; protein: number;
  swap?: { from: string; to: string } | null;   // same gravy, protein swapped for this member's diet
  note?: string | null;                          // medical variation (e.g. "low sodium")
}
export interface FamilyMealPortions { slot: string; slotName: string; name: string; sharedBase?: boolean; refKcal: number; perMember: MemberPortion[] }
export interface FamilyPortions {
  members: { id: string; name: string; role: string; dayKcal: number }[];
  meals: FamilyMealPortions[];
}

export interface CalorieEntry { id: string; date: string; name: string; kcal: number; type: CalorieType }

export interface RecipeIngredient { name: string; grams: number; priceInr: number }
export interface CookStep { text: string; durationSec: number; active: boolean }
export interface PlateSideItem { name: string; qty: number; unit: string; kcal: number }
export interface PlateSides {
  applicable: boolean; note: string; items: PlateSideItem[];
  sideKcal: number; plateKcal: number; targetKcal: number;
}
export interface WhyPoint { label: string; text: string }
export interface WhyForYou {
  personalised: boolean; headline: string; points: WhyPoint[];
  summary: string; cites: { id: string; label: string; ref: string }[];
}
export interface RecipeDetail extends Recipe {
  ingredients: RecipeIngredient[]; method?: string[]; cookSteps?: CookStep[];
  sides?: PlateSides; whyForYou?: WhyForYou;
}
export interface GroceryItem {
  id: string; name: string;
  category: 'pantry' | 'weekly' | 'daily' | 'fresh'; // 'fresh' kept for older carts
  qty: number; priceInr: number;
  grams?: number; unit?: string; qtyLabel?: string;
}
export interface GroceryCart { id: string | null; items: GroceryItem[]; createdAt?: string }

export interface Citation { id: string; label: string; ref: string }
export interface BloodMarkerResult {
  key: string; label: string; unit: string; value: number;
  status: 'low' | 'normal' | 'high'; advice: string;
  caveat: string | null; range: string; citations: Citation[];
}
export interface CriticalAlert { key: string; label: string; value: number; urgent: boolean; message: string }
export interface ConditionGuidance { key: string; name: string; principles: string[]; citations: Citation[] }
export interface BloodPanel {
  markers: BloodMarkerResult[];
  alerts: CriticalAlert[];
  conditions: ConditionGuidance[];
  disclaimer: string;
}

export interface SupplementDef { name: string; purpose: string; dose: string; timing: string; priceInr: number; citations?: Citation[] }
export interface SupplementPlan { goal: string; kit: SupplementDef[]; totalInr: number }

export interface DietitianCard {
  id: string; name: string; handle: string; specialty: string;
  languages: string[]; rating: number; priceInr: number;
}

export interface FoodPref {
  diet: string;
  goal: 'lose' | 'maintain' | 'gain';
  heightCm: number | null;
  weightKg: number | null;
  age: number | null;
  sex: 'male' | 'female' | null;
  activity: number;
  extras?: string | null; // JSON blob of extended preferences
}

export interface WalletTransaction { id: string; amountInr: number; kind: 'credit' | 'debit' | 'refund'; note: string | null; createdAt: string }
export interface Wallet { balanceInr: number; transactions: WalletTransaction[] }
export interface FreshDelivery { id: string; dayIndex: number; date: string; status: 'scheduled' | 'delivered' | 'cancelled'; amountInr: number }
export interface NutritionOrder {
  id: string;
  totalInr: number;
  status: string;
  createdAt: string;
  items: GroceryItem[];
  deliveries: FreshDelivery[];
}
