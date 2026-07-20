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

export interface Meal {
  slot: Slot;
  recipe: Recipe;
  skipped: boolean;
  sides?: Sides;
}

export interface DayPlan {
  day: string;                // Monday…Sunday
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
  days: DayPlan[];
  guidance?: PlanGuidance | null;
  incomplete?: boolean;                          // profile missing required fields
  missing?: { key: string; label: string }[];    // what to complete before planning
}

export interface NutritionTargets {
  kcal: number; protein: number; carb: number; fat: number; fiber: number; waterMl: number;
}

export interface DaySummary {
  kcal: number; protein: number; carbs: number; fat: number; fiber: number; cost: number;
  coverage: Record<string, number>;   // micronutrient % of daily reference
}
