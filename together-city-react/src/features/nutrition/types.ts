/** Nutrition domain types — mirror the NestJS meal-planner DTOs. */
export type DietKey = 'everything' | 'veg' | 'nonveg' | 'pesc' | 'egg' | 'vegan' | 'jain';
export type Slot = 'b' | 'l' | 's' | 'd';

export interface Recipe {
  id: string;
  recipeNo?: number | null;   // stable public recipe number (1..N)
  name: string;
  country: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  minutes: number;
  gramsPerServing: number;   // grams one person eats (per plate)
  servings?: number;         // one-person plates the raw batch recipe yields
  diet: DietKey;
}

export interface Sides { rice: number; roti: number; curd: number; salad: number; }

export interface PlateComponent {
  role: 'main' | 'secondary' | 'carb' | 'vegetable' | 'dairy' | 'salad';
  icon: string; name: string; portion: string;
  kcal: number; protein: number; carbs: number; fat: number; fiber: number;
}
export interface PlateMacro { kcal: number; protein: number; carbs: number; fat: number; fiber: number }
export interface Plate { components: PlateComponent[]; totals: PlateMacro }

export interface Meal {
  slot: Slot;
  recipe: Recipe;
  skipped: boolean;
  sides?: Sides;
  plate?: Plate;   // assembled Indian thali (lunch/dinner Indian mains only)
}

export interface DayPlan {
  day: string;                // Monday…Sunday
  date?: string;              // real calendar date, ISO yyyy-mm-dd (spec §20)
  dateLabel?: string;         // "Monday, 20 July 2026"
  meals: Meal[];
}

export interface PlanningMode { key: string; label: string; reason: string; citations: string[] }
export interface PlanGuidance {
  modes: PlanningMode[];
  summary: string;
  citations: { id: string; label: string; ref: string }[];
}

export interface WeekPlan {
  key: string;
  weekNumber?: number;        // ISO week number (spec §20)
  weekStart?: string;         // ISO yyyy-mm-dd (Monday)
  weekEnd?: string;           // ISO yyyy-mm-dd (Sunday)
  weekLabel?: string;         // "20–26 Jul 2026"
  days: DayPlan[];
  guidance?: PlanGuidance | null;
  incomplete?: boolean;                          // profile missing required fields
  missing?: { key: string; label: string }[];    // what to complete before planning
}

/** Stored nutrition-history week summary (spec §19/§20). */
export interface NutritionHistoryWeek {
  id: string;
  mode: string;
  weekNumber: number;
  weekLabel: string;
  startDate: string;
  endDate: string;
  createdAt: string;
  cost: number;
  totals: { kcal?: number; protein?: number; carbs?: number; fat?: number; fiber?: number; cost?: number };
  variety: { recipeVarietyPct?: number; distinctRecipes?: number; mealsServed?: number; cuisineVariety?: number; proteinVariety?: number };
  diet?: string | null;
  cuisineMix?: Record<string, number>;
}

export interface NutritionTargets {
  kcal: number; protein: number; carb: number; fat: number; fiber: number; waterMl: number;
  sugarMaxG?: number; satFatMaxG?: number; sodiumMaxMg?: number; potassiumMinMg?: number;
  perMeal?: Record<'b' | 'l' | 's' | 'd', { kcal: number; protein: number; carb: number; fat: number }>;
  adjustments?: string[]; // medical target adjustments applied
}

export interface DaySummary {
  kcal: number; protein: number; carbs: number; fat: number; fiber: number; cost: number;
  coverage: Record<string, number>;   // micronutrient % of daily reference
}
