import { http as api } from '@/api/client';
import type { WeekPlan, DaySummary, NutritionTargets, Sides, Recipe, NutritionHistoryWeek } from './types';

/** Nutrition endpoints on the NestJS backend (no engine logic duplicated client-side). */
export const nutritionApi = {
  weeklyPlan: (mode: 'individual' | 'family' = 'individual', readOnly = false) =>
    api.get<WeekPlan>('/nutrition/plan/weekly', { params: { mode, ...(readOnly ? { readOnly: 1 } : {}) } }).then((r) => r.data),
  history: (mode?: 'individual' | 'family') =>
    api.get<NutritionHistoryWeek[]>('/nutrition/history', { params: mode ? { mode } : undefined }).then((r) => r.data),
  historyDetail: (id: string) =>
    api.get<Record<string, unknown>>(`/nutrition/history/${id}`).then((r) => r.data),
  familyMembers: () => api.get<FamilyMemberProfile[]>('/nutrition/family/members').then((r) => r.data),
  searchHouseholdUser: (q: string) => api.get<HouseholdSearchResult>('/nutrition/family/search', { params: { q } }).then((r) => r.data),
  inviteHousehold: (userRef: string, role: HouseholdRole) =>
    api.post<{ invited: HouseholdUserCard & { role: HouseholdRole }; message: string; household: FamilyMemberProfile[] }>('/nutrition/family/invite', { userRef, role }).then((r) => r.data),
  householdInvites: () => api.get<HouseholdInvite[]>('/nutrition/family/invites').then((r) => r.data),
  respondHouseholdInvite: (id: string, accept: boolean) =>
    api.post<{ ok: boolean; status: string; invites: HouseholdInvite[] }>(`/nutrition/family/invites/${id}/respond`, { accept }).then((r) => r.data),
  familyProfile: () => api.get<FamilyProfile>('/nutrition/family/profile').then((r) => r.data),
  familyHealth: () => api.get<FamilyHealth>('/nutrition/family/health').then((r) => r.data),
  householdSharing: () => api.get<HouseholdSharing>('/nutrition/family/sharing').then((r) => r.data),
  setHouseholdSharing: (patch: Partial<HouseholdSharing>) => api.patch<HouseholdSharing>('/nutrition/family/sharing', patch).then((r) => r.data),
  pantry: () => api.get<PantryView>('/nutrition/family/pantry').then((r) => r.data),
  addPantryItem: (name: string, grams?: number) => api.post<PantryView>('/nutrition/family/pantry', { name, grams }).then((r) => r.data),
  stockPantry: () => api.post<PantryView>('/nutrition/family/pantry/stock', {}).then((r) => r.data),
  updatePantryItem: (id: string, grams: number) => api.patch<PantryView>(`/nutrition/family/pantry/${id}`, { grams }).then((r) => r.data),
  removePantryItem: (id: string) => api.delete<PantryView>(`/nutrition/family/pantry/${id}`).then((r) => r.data),
  updateFamilyMember: (id: string, dto: FamilyMemberInput) => api.patch<FamilyMemberProfile[]>(`/nutrition/family/members/${id}`, dto).then((r) => r.data),
  removeFamilyMember: (id: string) => api.delete<FamilyMemberProfile[]>(`/nutrition/family/members/${id}`).then((r) => r.data),
  familyPortions: (dayIndex: number) => api.get<FamilyPortions>(`/nutrition/family/portions/${dayIndex}`).then((r) => r.data),
  buildFamilyCart: () => api.post<GroceryCart>('/nutrition/family/cart', {}).then((r) => r.data),
  familyDashboard: () => api.get<FamilyDashboard>('/nutrition/family/dashboard').then((r) => r.data),
  regenerate: (mode: 'individual' | 'family' = 'individual') =>
    api.post<WeekPlan>('/nutrition/plan/weekly/regenerate', { mode }).then((r) => r.data),
  daySummary: (planKey: string, dayIndex: number) =>
    api.get<DaySummary>(`/nutrition/plan/${planKey}/day/${dayIndex}/summary`).then((r) => r.data),
  targets: () => api.get<NutritionTargets>('/nutrition/targets').then((r) => r.data),
  swapMeal: (planKey: string, dayIndex: number, slot: string, restoreRecipeId?: string) =>
    api.post<WeekPlan>(`/nutrition/plan/${planKey}/day/${dayIndex}/swap`, restoreRecipeId ? { slot, restoreRecipeId } : { slot }).then((r) => r.data),
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
  groceryPlan: (mode: 'individual' | 'family' = 'individual') =>
    api.get<GroceryPlan>('/nutrition/grocery/plan', { params: { mode } }).then((r) => r.data),
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
export type HouseholdRole = 'owner' | 'adult' | 'child' | 'guest';
export interface FamilyMemberProfile {
  id: string; name: string; role: string; sex: string; age: number; heightCm: number;
  weightKg: number; activity: number; goal: string; diet: string; isSelf: boolean;
  userId: string | null;              // real Together City user (null for the owner self-row)
  image: string | null;              // profile photo
  householdRole: HouseholdRole;      // owner | adult | child | guest
  capabilities: string[];            // what this role may do
  privacy: { targets: boolean; conditions: boolean; weight: boolean; bloodTests: boolean }; // true = hidden by that member
  proteins: string[]; cuisines: string[]; allergies: string; healthConditions: string[];
  targets: { kcal: number; protein: number; carb: number; fat: number; fiber: number; adjustments: string[] };
}
export interface HouseholdSharing { targets: boolean; conditions: boolean; weight: boolean; bloodTests: boolean }

/** Family Health command centre (Medical Hub → Family Profiles). */
export type HealthStatus = 'excellent' | 'good' | 'attention' | 'follow-up';
export type AlertLevel = 'green' | 'yellow' | 'orange' | 'red';
export interface FamilyHealthMember {
  id: string; userId: string | null; name: string; image: string | null; age: number; sex: string;
  relationship: string; isSelf: boolean; canUpload: boolean; medicalHubPath: string | null;
  privacy: { bloodTests: boolean; reports: boolean; diagnoses: boolean; summary: boolean; nutrition: boolean };
  lastBloodTest: string | null; lastReport: string | null; lastVisit: string | null;
  reportCount: number; bloodTestDue: boolean;
  healthScore: number | null; nutritionScore: number | null; status: HealthStatus;
  snapshot: string[]; alerts: { label: string; level: AlertLevel }[];
  latestDiagnosis: string | null; nextTest: string | null; reminder: string | null;
}
export interface FamilyHealth {
  summary: {
    members: number; chronicConditions: number; bloodTestsDue: number; reportsUploaded: number;
    avgHealthScore: number | null; nutritionScore: number | null; reminders: string[];
  };
  members: FamilyHealthMember[];
}
export interface PantryItemView { id: string; name: string; grams: number; qtyLabel: string; unit: string; updatedAt: string }
export interface PantryAisle { key: string; icon: string; title: string; items: PantryItemView[] }
export interface PantryView { aisles: PantryAisle[]; itemCount: number }
export interface FamilyMemberInput {
  name: string; role: string; sex: string; age: number; heightCm: number; weightKg: number;
  activity: number; goal: string; diet: string; healthConditions: string[]; allergies?: string;
}

/** Household Connection invite/search (Nutrition Hub only — never social). */
export interface HouseholdUserCard { id: string; handle: string; name: string; profileImage: string | null }
export interface HouseholdSearchResult {
  found: boolean;
  user?: HouseholdUserCard;
  relationship?: 'self' | 'member' | 'pending' | 'none';
}
export interface HouseholdInvite {
  id: string; ownerId: string; role: HouseholdRole; createdAt: string;
  from: { name: string; handle: string; image: string | null };
  message: string;
}
export interface FamilyCompatibility {
  score: number; level: 'high' | 'moderate' | 'low';
  extraDishesRecommended: number; reasons: string[]; recommendation: string;
}
export interface FamilyProfile {
  name: string;
  counts: { total: number; adults: number; children: number; seniors: number };
  dietTypes: string[]; conditions: string[]; allergies: string[]; cuisines: string[]; goals: string[];
  compatibility: FamilyCompatibility;
  weeklyBudgetInr: number | null; cookingFrequency: string; groceryFrequency: string;
  summary: {
    members: number; avgCalories: number; avgProtein: number; avgFiber: number; totalCalories: number;
    goals: string[]; medicalAlerts: { member: string; flag: string }[];
    weeklyGroceryCostInr: number; nutritionScore: number | null; adherenceScore: number | null;
    mealCompletion: number; status: 'none' | 'all-on-track' | 'needs-attention';
  };
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
export interface FamilyMemberStatus {
  id: string; name: string; role: string; diet: string; isSelf: boolean;
  target: { kcal: number; protein: number; fiber: number };
  consumed: { kcal: number; protein: number; fiber: number };
  kcalPct: number; proteinPct: number;
  calorieStatus: 'none' | 'under' | 'on' | 'over';
  proteinStatus: 'none' | 'low' | 'met' | 'over';
  medicalOk: boolean; flags: string[]; adjustments: string[];
}
export interface FamilyDashboard {
  hasPlan: boolean; mealsPerDay: number; memberCount: number;
  familyStatus: 'none' | 'all-on-track' | 'needs-attention';
  members: FamilyMemberStatus[];
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

/** Supermarket-style grocery plan (Grocery Planner redesign). */
export interface GroceryUsedIn { recipe: string; qtyLabel: string }
export interface GroceryPlanItem {
  name: string; aisle: string; qtyLabel: string; unit: string; grams: number;
  pack: string;                    // recommended retail pack to buy
  shelfLife: string; storageTip: string; usedIn: GroceryUsedIn[];
}
export interface GroceryAisle {
  key: string; icon: string; title: string; note: string; items: GroceryPlanItem[];
}
export interface GroceryRecipeView { recipe: string; items: { name: string; qtyLabel: string }[] }
export interface GroceryScaleMember { name: string; dailyKcal: number; multiplier: number }
export interface GrocerySummary {
  householdSize: number; days: number;
  meals: { breakfast: number; lunch: number; dinner: number; snacks: number };
  estimatedCostInr: number; wastePct: number; scale: number; members: GroceryScaleMember[];
}
export interface GroceryPlan {
  aisles: GroceryAisle[]; recipes: GroceryRecipeView[]; itemCount: number; summary?: GrocerySummary;
}

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
