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
  imageUrl?: string;         // dish photo (when available), keyed by recipeNo
  healthGrade?: string | null; // A–E health grade
  healthPercent?: number;    // 0–100 health score
}

export interface Sides { rice: number; roti: number; curd: number; salad: number; }

export interface PlateComponent {
  role: 'main' | 'secondary' | 'carb' | 'vegetable' | 'dairy' | 'salad';
  icon: string; name: string; portion: string;
  kcal: number; protein: number; carbs: number; fat: number; fiber: number;
  recipeId?: string;   // clickable → that component's own recipe page
}
export interface PlateMacro { kcal: number; protein: number; carbs: number; fat: number; fiber: number }
export interface Plate { components: PlateComponent[]; totals: PlateMacro }

export interface Meal {
  slot: Slot;
  recipe: Recipe;
  skipped: boolean;
  portionPct?: number; // quantized portion (50/75/100/125/150 — ½ to 1½ plates)
  addons?: MealAddon[]; // complement foods on this plate (egg, curd, fruit…)
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

/** Evidence-based medical recommendation shown as advice — never overrides the
 *  saved food preference (spec §21). Level 1 Informational · 2 Recommended · 3 Safety. */
export interface MedicalAdvisory {
  key: string;
  condition: string;
  level: 1 | 2 | 3;
  title: string;
  message: string;
  actionable: boolean;            // show Update/Keep actions (a preference change is suggested)
  recommendedPreference?: string; // e.g. 'veg' | 'pesc'
}

export interface HealthScore {
  preferenceMatch: number;        // % — always 100 (preferences are honoured)
  medicalOptimisation: number;    // % — how well choices align with conditions
  overall: number;                // % — blended
  note: string;
}

export interface WeekPlan {
  key: string;
  weekNumber?: number;        // ISO week number (spec §20)
  weekStart?: string;         // ISO yyyy-mm-dd (Monday)
  weekEnd?: string;           // ISO yyyy-mm-dd (Sunday)
  weekLabel?: string;         // "20–26 Jul 2026"
  days: DayPlan[];
  guidance?: PlanGuidance | null;
  advisories?: MedicalAdvisory[];   // §21 medical advisory cards
  healthScore?: HealthScore;        // §21 preference-vs-medical score
  incomplete?: boolean;                          // profile missing required fields
  missing?: { key: string; label: string }[];    // what to complete before planning
  needsPlan?: boolean;                           // read-only view (Daily) with no saved plan yet
  stale?: boolean;                               // preferences changed since the plan was saved
  isCurrentWeek?: boolean;                       // whether the loaded plan is this calendar week
}

/** One saved week in the calendar/timeline. */
export interface WeekSummary {
  key: string; weekStart: string; weekEnd: string; weekLabel: string;
  weekNumber: number; isCurrent: boolean; meals: number; createdAt: string;
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
  coverage: Record<string, number>;   // micronutrient % of daily reference (legacy)
  micros?: MicroIntake[];             // real ingredient-estimated micronutrients
}

/** One micronutrient row from the backend estimation engine. */
export interface MicroIntake {
  key: string; label: string; unit: string;
  intake: number; target: number; pct: number;
  marker?: string; markerStatus?: string | null;
  foods: string[]; topSources: string[];
}

/** Personalized Nutrition Advice item (dietary balance advisory). */
export interface NutritionAdvisory { key: string; title: string; body: string }

/** Weekly Nutrition Progress payload (cumulative budgeting). */
export interface WeekNutritionSummary {
  key: string;
  days: Array<{
    dayIndex: number; day: string;
    kcal: number; protein: number; carbs: number; fat: number; fiber: number;
    cumulative: { kcal: number; protein: number; carbs: number; fat: number; fiber: number };
    cumulativeTarget: Record<string, number>;
  }>;
  weeklyTarget: { kcal: number; protein: number; carbs: number; fat: number; fiber: number };
  weeklyIntake: { kcal: number; protein: number; carbs: number; fat: number; fiber: number };
  weeklyScore: number;
  compliancePct: number;
  dailyTarget: { kcal: number; protein: number; carbs: number; fat: number; fiber: number };
}

/** Medical Nutrition Recommendation card (condition guidelines vs preferences). */
export interface MedRecCard {
  condition: string; icon: string; title: string; intro: string;
  recs: Array<{ key: string; label: string; reason: string; applyable: boolean }>;
  scoreBefore: number; scoreAfter: number;
}

/** A complement food added to a meal's plate (whole units — egg, curd, fruit…). */
export interface MealAddon { key: string; units: number; label: string; kcal: number }
