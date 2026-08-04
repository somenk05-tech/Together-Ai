import { http as api } from '@/api/client';
import type { NutritionTargets, NutritionAdvisory, MedRecCard, Recipe, NutritionHistoryWeek } from './types';

/** Nutrition endpoints on the NestJS backend (no engine logic duplicated client-side). */
export const nutritionApi = {
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
  familyMealPlanning: () => api.get<FamilyMealPlanningContext>('/nutrition/family/meal-planning').then((r) => r.data),
  setFamilyMealPlanning: (on: boolean) => api.patch<{ familyMealPlanning: boolean }>('/nutrition/family/meal-planning', { on }).then((r) => r.data),
  pantry: () => api.get<PantryView>('/nutrition/family/pantry').then((r) => r.data),
  addPantryItem: (name: string, grams?: number) => api.post<PantryView>('/nutrition/family/pantry', { name, grams }).then((r) => r.data),
  stockPantry: () => api.post<PantryView>('/nutrition/family/pantry/stock', {}).then((r) => r.data),
  updatePantryItem: (id: string, grams: number) => api.patch<PantryView>(`/nutrition/family/pantry/${id}`, { grams }).then((r) => r.data),
  removePantryItem: (id: string) => api.delete<PantryView>(`/nutrition/family/pantry/${id}`).then((r) => r.data),
  /** Cooking a meal draws its ingredients down from the pantry (idempotent). */
  markCooked: (mealKey: string, label?: string, people?: number) =>
    api.post<PantryView & { cooked?: boolean; alreadyCooked?: boolean; deducted?: Array<{ name: string; grams: number }> }>(
      '/nutrition/pantry/cooked', { mealKey, label, people }).then((r) => r.data),
  updateFamilyMember: (id: string, dto: FamilyMemberInput) => api.patch<FamilyMemberProfile[]>(`/nutrition/family/members/${id}`, dto).then((r) => r.data),
  removeFamilyMember: (id: string) => api.delete<FamilyMemberProfile[]>(`/nutrition/family/members/${id}`).then((r) => r.data),
  familyPortions: (dayIndex: number) => api.get<FamilyPortions>(`/nutrition/family/portions/${dayIndex}`).then((r) => r.data),
  familyDashboard: () => api.get<FamilyDashboard>('/nutrition/family/dashboard').then((r) => r.data),
  repairDay: (planKey: string, dayIndex: number) =>
    api.post<{ repaired: boolean; valid: boolean }>(`/nutrition/plan/${planKey}/day/${dayIndex}/rebalance`, {}).then((r) => r.data),
  targets: () => api.get<NutritionTargets>('/nutrition/targets').then((r) => r.data),
  advice: () => api.get<NutritionAdvisory[]>('/nutrition/advice').then((r) => r.data),
  medicalRecs: () => api.get<{ cards: MedRecCard[] }>('/nutrition/medical-recs').then((r) => r.data),
  decideMedicalRec: (condition: string, choice: 'apply' | 'keep') =>
    api.post<{ ok: boolean; choice: string; message: string }>('/nutrition/medical-recs/decide', { condition, choice }).then((r) => r.data),
  healthLog: (dates: string[]) =>
    api.get<{ entries: CalorieEntry[] }>('/nutrition/health/log', { params: { dates: dates.join(',') } }).then((r) => r.data),
  addCalorie: (e: { date: string; name: string; kcal: number; type: CalorieType }) =>
    api.post<{ entries: CalorieEntry[] }>('/nutrition/health/log', e).then((r) => r.data),
  removeCalorie: (id: string) =>
    api.delete<{ ok: boolean }>(`/nutrition/health/log/${id}`).then((r) => r.data),
  recipes: (diet?: string) =>
    api.get<Recipe[]>('/nutrition/recipes', { params: diet && diet !== 'everything' ? { diet } : undefined }).then((r) => r.data),
  searchRecipes: (ingredients: string[], diet?: string) =>
    api.get<Recipe[]>('/nutrition/recipes/search', {
      params: { ingredients: ingredients.join(','), ...(diet && diet !== 'everything' ? { diet } : {}) },
    }).then((r) => r.data),
  recipe: (id: string) =>
    api.get<RecipeDetail>(`/nutrition/recipes/${id}`).then((r) => r.data),
  savedRecipes: () =>
    api.get<{ ids: string[]; recipes: Recipe[] }>('/nutrition/saved').then((r) => r.data),
  saveRecipe: (id: string, saved: boolean) =>
    api.post<{ saved: boolean; ids: string[] }>(`/nutrition/recipes/${id}/save`, { saved }).then((r) => r.data),
  recipeVariants: (id: string, type: string) =>
    api.get<{ type: string; label: string; note: string; items: Recipe[] }>(`/nutrition/recipes/${id}/variants`, { params: { type } }).then((r) => r.data),
  groceryCheck: (key: string, checked: boolean) =>
    api.post<{ ok: true; key: string; checked: boolean }>('/nutrition/grocery/check', { key, checked }).then((r) => r.data),
  groceryAddItem: (label: string) =>
    api.post<{ ok: true; key: string }>('/nutrition/grocery/item', { label }).then((r) => r.data),
  groceryClearChecked: () =>
    api.post<{ ok: true; cleared: number }>('/nutrition/grocery/clear-checked', {}).then((r) => r.data),
  // No days/startDate: the server builds the basket from the locked plan days.
  /** `days` and `startDate` have been on this endpoint since it was written —
   *  groceryPlan(userId, mode, days = 7, startDate?), clamped 1–28 — and the web
   *  app sent neither, so the citizen had no say in how far ahead they shop. */
  groceryPlan: (mode: 'individual' | 'family' = 'individual', days?: number, startDate?: string) =>
    api.get<GroceryPlan>('/nutrition/grocery/plan', { params: { mode, days, startDate } }).then((r) => r.data),
  cart: () => api.get<GroceryCart>('/nutrition/cart').then((r) => r.data),
  prepAlerts: (mode: 'individual' | 'family' = 'individual') =>
    api.get<{ alerts: Array<{ mealKey: string; title: string; what: string; startBy: string; notified: boolean }> }>(
      '/nutrition/prep-alerts', { params: { mode } }).then((r) => r.data),
  setDeliveryTime: (time: string) =>
    api.patch<{ ok: boolean; deliveryTime: string }>('/nutrition/delivery-time', { time }).then((r) => r.data),
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
};

export type CalorieType = 'Meal Plan' | 'Extra' | 'Alcohol';
export type HouseholdRole = 'owner' | 'adult' | 'child' | 'guest';
export interface FamilyMemberProfile {
  // NULL means nobody has told us. These were non-null here and non-null in the
  // database, which is what let the card render `{m.age}y` unconditionally.
  id: string; name: string; role: string;
  sex: string | null; age: number | null; heightCm: number | null;
  weightKg: number | null; activity: number; goal: string; diet: string; isSelf: boolean;
  userId: string | null;              // real Together City user (null for the owner self-row)
  image: string | null;              // profile photo
  householdRole: HouseholdRole;      // owner | adult | child | guest
  capabilities: string[];            // what this role may do
  privacy: { targets: boolean; conditions: boolean; weight: boolean; bloodTests: boolean }; // true = hidden by that member
  proteins: string[]; cuisines: string[]; allergies: string; healthConditions: string[];
  targets: { kcal: number; protein: number; carb: number; fat: number; fiber: number; adjustments: string[] };
  /** Set when the four inputs a target needs are not all known for this member.
   *  `targets` is zeroed in that case — read this first. */
  bodyUnknown: { fields: string[] } | null;
}
export interface HouseholdSharing { targets: boolean; conditions: boolean; weight: boolean; bloodTests: boolean }

/** The diets a citizen can hold. `jainvegan` is never chosen — it is what a
 *  vegan and a Jain in one household add up to. Mirrors the API's DietKey. */
export type DietKey =
  | 'everything' | 'nonveg' | 'pesc' | 'egg'
  | 'veg' | 'vegetarian' | 'vegan' | 'jain' | 'jainvegan';

/** Planner context for this user: their household role + the shared mode flag. */
export interface FamilyMealPlanningContext {
  role: 'owner' | 'member' | 'solo';
  ownerId: string;
  familyMealPlanning: boolean;
  hasFamily: boolean;
  /** The diet the shared plan is built against: the union of the table's. */
  householdDiet: DietKey;
  /** Members whose diet made it stricter than the owner's. Empty when it did not. */
  dietBecause: string[];
}

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
export interface PantryItemView {
  id: string; name: string; grams: number; qtyLabel: string; unit: string; updatedAt: string;
  /** Depletion bar: how full this item is vs the last time it was stocked. */
  startGrams?: number; remainingPct?: number; startQtyLabel?: string;
}
export interface PantryAisle { key: string; icon: string; title: string; items: PantryItemView[] }
export interface PantryView { aisles: PantryAisle[]; itemCount: number }
export interface FamilyMemberInput {
  // Nullable for the same reason the profile is: the form has to be able to say
  // "not answered". Without this, editing a member whose body is unknown would
  // force the person editing to invent one to get past the type.
  name: string; role: string;
  sex: string | null; age: number | null; heightCm: number | null; weightKg: number | null;
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
export interface RecipeNutrients { sodiumMg: number; potassiumMg: number; phosphorusMg: number; sugarG: number; addedSugarG: number; satFatG: number; complete: boolean }
export interface RecipeMicros { ironMg: number; calciumMg: number; vitDUg: number; vitCMg: number }
export interface RecipeDetail extends Recipe {
  ingredients: RecipeIngredient[]; method?: string[]; cookSteps?: CookStep[];
  sides?: PlateSides; whyForYou?: WhyForYou;
  nutrients?: RecipeNutrients; micros?: RecipeMicros; curated?: boolean;
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
  /** Persisted (BE-11.1) — a tick survives the page closing, which is the point. */
  checked?: boolean;
  /** plan | manual. A manual line is never removed by a regeneration. */
  source?: string;
  /** Pantry-aware split: what you already have vs what's still to buy. */
  haveGrams?: number; toBuyGrams?: number; haveQtyLabel?: string; toBuyQtyLabel?: string; inPantry?: boolean;
  pack: string;                    // recommended retail pack to buy
  shelfLife: string; storageTip: string; usedIn: GroceryUsedIn[];
  /** Perishability + the day it's first cooked (drives delivery scheduling). */
  shelf?: 'pantry' | 'weekly' | 'daily'; perishable?: boolean; neededOn?: string;
}
export interface GroceryAisle {
  key: string; icon: string; title: string; note: string; items: GroceryPlanItem[];
}
export interface GroceryRecipeView { recipe: string; items: { name: string; qtyLabel: string }[] }
export interface GroceryScaleMember { name: string; dailyKcal: number; multiplier: number }
export interface GrocerySummary {
  /** The exact dates this basket covers (always today or later). */
  startDate?: string; endDate?: string;
  householdSize: number; days: number;
  meals: { breakfast: number; lunch: number; dinner: number; snacks: number };
  estimatedCostInr: number; wastePct: number; scale: number; members: GroceryScaleMember[];
  perishableCount?: number; pantryCount?: number;
}
/** When each part of the basket should actually arrive. */
export interface DeliveryDrop { date: string; time: string; itemCount: number; items: string[] }
export interface DeliverySchedule { preferredTime: string; first: DeliveryDrop; daily: DeliveryDrop[] }
export interface GroceryPlan {
  aisles: GroceryAisle[]; recipes: GroceryRecipeView[]; itemCount: number; summary?: GrocerySummary;
  deliverySchedule?: DeliverySchedule;
  /** How many plan days are locked — the basket is built from those and only those. */
  lockedDays?: number;
  /** Present when there is nothing to buy, saying WHICH nothing it is. */
  note?: string;
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
export interface QcTrackStage { key: string; label: string; atMin: number; done: boolean; current: boolean }
export interface QcTracking {
  provider: { key: string; name: string; icon: string };
  rider: { name: string; rating: number };
  etaMinutes: number; elapsedMinutes: number; arrivingInMinutes: number;
  progressPct: number; delivered: boolean; stages: QcTrackStage[];
}
export interface QcOrderMeta {
  providerKey: string; providerName: string; providerIcon: string;
  etaMinutes: number; deliveryFeeInr: number; surgeInr: number;
  placedAt: string; rider: { name: string; rating: number };
  tracking: QcTracking;
}
export interface NutritionOrder {
  qc?: QcOrderMeta | null;
  id: string;
  totalInr: number;
  status: string;
  createdAt: string;
  items: GroceryItem[];
  deliveries: FreshDelivery[];
}
