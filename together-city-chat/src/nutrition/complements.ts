/**
 * Complement foods — how a dietitian actually closes an energy/protein gap:
 * not "curry ×2.5" but "add 1 cup curd and a banana". Whole, realistic units
 * with fixed macros; the day-builder adds them to meals when the quantized
 * portions (½–1½ plates) can't reach the prescription on their own.
 */

export interface ComplementDef {
  key: string;
  /** label for ONE unit, and a plural template ({n} = count). */
  one: string;
  many: string;
  kcal: number; protein: number; carbs: number; fat: number; fiber: number;
  /** diets that may eat this (subset of everything/nonveg/pesc/egg/veg/vegan/jain). */
  diets: string[];
  /** assigned diet-plan keys that should AVOID this complement. */
  avoidForPlans?: string[];
  /** slots where this naturally belongs. */
  slots: string[];
  maxUnits: number;
  /** keyword fed to the micronutrient estimator. */
  microKeyword: string;
}

const ALL = ['everything', 'nonveg', 'pesc', 'egg', 'veg', 'vegan', 'jain'];
const DAIRY = ['everything', 'nonveg', 'pesc', 'egg', 'veg', 'jain'];
const EGGY = ['everything', 'nonveg', 'pesc', 'egg'];

export const COMPLEMENTS: ComplementDef[] = [
  { key: 'egg', one: '1 boiled egg', many: '{n} boiled eggs', kcal: 78, protein: 6.3, carbs: 0.6, fat: 5.3, fiber: 0, diets: EGGY, slots: ['b', 's'], maxUnits: 2, microKeyword: 'egg' },
  { key: 'curd', one: '1 cup curd', many: '{n} cups curd', kcal: 120, protein: 8, carbs: 9, fat: 5, fiber: 0, diets: DAIRY, slots: ['b', 'l', 'd'], maxUnits: 1, microKeyword: 'curd' },
  { key: 'milk', one: '250 ml milk', many: '{n} × 250 ml milk', kcal: 150, protein: 8, carbs: 12, fat: 8, fiber: 0, diets: DAIRY, slots: ['b', 's'], maxUnits: 1, microKeyword: 'milk' },
  { key: 'paneer', one: '50 g paneer cubes', many: '{n} × 50 g paneer', kcal: 130, protein: 9, carbs: 2, fat: 10, fiber: 0, diets: DAIRY, slots: ['l', 'd', 's'], maxUnits: 2, microKeyword: 'paneer' },
  { key: 'banana', one: '1 medium banana', many: '{n} bananas', kcal: 105, protein: 1.3, carbs: 27, fat: 0.4, fiber: 3.1, diets: ALL, avoidForPlans: ['renal'], slots: ['b', 's'], maxUnits: 2, microKeyword: 'banana' },
  { key: 'apple', one: '1 medium apple', many: '{n} apples', kcal: 95, protein: 0.5, carbs: 25, fat: 0.3, fiber: 4.4, diets: ALL, slots: ['b', 's', 'l'], maxUnits: 2, microKeyword: 'apple' },
  { key: 'almonds', one: '10 almonds', many: '{n} × 10 almonds', kcal: 70, protein: 2.6, carbs: 2.5, fat: 6, fiber: 1.5, diets: ALL, slots: ['b', 's'], maxUnits: 2, microKeyword: 'almond' },
  { key: 'peanutButterToast', one: '1 peanut-butter toast', many: '{n} peanut-butter toasts', kcal: 190, protein: 7, carbs: 18, fat: 11, fiber: 2.5, diets: ALL, avoidForPlans: ['liverFriendly'], slots: ['b', 's'], maxUnits: 2, microKeyword: 'peanut wheat' },
  { key: 'roti', one: '1 roti', many: '{n} rotis', kcal: 105, protein: 3, carbs: 20, fat: 1.5, fiber: 2.5, diets: ALL, slots: ['l', 'd'], maxUnits: 3, microKeyword: 'roti' },
  { key: 'rice', one: '1 small bowl rice', many: '{n} bowls rice', kcal: 170, protein: 3.5, carbs: 37, fat: 0.5, fiber: 1, diets: ALL, avoidForPlans: ['diabetic', 'lowGlycemic'], slots: ['l', 'd'], maxUnits: 2, microKeyword: 'rice' },
  { key: 'dal', one: '1 cup dal', many: '{n} cups dal', kcal: 150, protein: 9, carbs: 22, fat: 3, fiber: 6, diets: ALL, slots: ['l', 'd'], maxUnits: 1, microKeyword: 'dal' },
  { key: 'salad', one: '1 side salad', many: '{n} side salads', kcal: 45, protein: 1.5, carbs: 8, fat: 1, fiber: 3, diets: ALL, slots: ['l', 'd'], maxUnits: 1, microKeyword: 'salad tomato cucumber' },
  { key: 'sproutsBowl', one: '1 bowl sprouts', many: '{n} bowls sprouts', kcal: 110, protein: 7, carbs: 17, fat: 1, fiber: 5, diets: ALL, slots: ['b', 's', 'l'], maxUnits: 1, microKeyword: 'sprouts legumes' },
  { key: 'fruitBowl', one: '1 bowl mixed fruit', many: '{n} bowls mixed fruit', kcal: 90, protein: 1, carbs: 23, fat: 0.3, fiber: 3.5, diets: ALL, slots: ['b', 's'], maxUnits: 1, microKeyword: 'papaya apple orange' },
];

export interface AddonPick { key: string; units: number }

export const complementByKey = new Map(COMPLEMENTS.map((c) => [c.key, c]));

export function addonLabel(key: string, units: number): string {
  const c = complementByKey.get(key);
  if (!c) return key;
  return units <= 1 ? c.one : c.many.replace('{n}', String(units));
}

export function addonMacros(picks: AddonPick[]): { kcal: number; protein: number; carbs: number; fat: number; fiber: number } {
  const t = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
  for (const p of picks) {
    const c = complementByKey.get(p.key);
    if (!c) continue;
    t.kcal += c.kcal * p.units; t.protein += c.protein * p.units; t.carbs += c.carbs * p.units;
    t.fat += c.fat * p.units; t.fiber += c.fiber * p.units;
  }
  return t;
}

/**
 * Fill a day's remaining energy/protein gap with whole complement units.
 * Deterministic greedy: at each step add the unit that best matches the gap's
 * protein-to-energy ratio without overshooting protein's ceiling. Respects
 * diet, assigned plans, per-slot fit and per-meal add-on limits (≤3 items).
 */
export function fillGapWithComplements(opts: {
  gapKcal: number;
  gapProtein: number;              // may be ≤0 (protein already at/above target)
  proteinCeiling: number;          // grams of headroom before the band breaks
  diet: string;
  plans: string[];
  slots: string[];                 // active slots today, in fill order
  /** Dietitian discipline: at most ONE accompaniment per meal… */
  maxItemsPerMeal?: number;
  /** …and at most TWO across the day. A real plate gets a glass of milk or a
   *  bowl of curd — never a scatter of mini-foods to patch the math. */
  maxItemsTotal?: number;
}): Record<string, AddonPick[]> {
  const bySlot: Record<string, AddonPick[]> = {};
  const maxPerMeal = opts.maxItemsPerMeal ?? 1;
  const maxTotal = opts.maxItemsTotal ?? 2;
  const itemsIn = (slot: string) => (bySlot[slot] ?? []).length;
  const itemsTotal = () => Object.values(bySlot).reduce((s, a) => s + a.length, 0);
  const unitsOf = (slot: string, key: string) => (bySlot[slot] ?? []).find((p) => p.key === key)?.units ?? 0;
  let { gapKcal, gapProtein, proteinCeiling } = opts;

  const usable = COMPLEMENTS.filter((c) =>
    c.diets.includes(opts.diet) && !(c.avoidForPlans ?? []).some((p) => opts.plans.includes(p)));

  for (let guard = 0; guard < 24 && gapKcal > 60; guard++) {
    if (itemsTotal() >= maxTotal && !Object.values(bySlot).some((a) => a.some((p) => (complementByKey.get(p.key)?.maxUnits ?? 1) > p.units))) break;
    let best: { c: ComplementDef; slot: string; score: number } | null = null;
    for (const c of usable) {
      if (c.protein > proteinCeiling + 0.5) continue;   // never bust the protein band
      for (const slot of opts.slots) {
        if (!c.slots.includes(slot)) continue;
        const isNewItem = unitsOf(slot, c.key) === 0;
        if (isNewItem && (itemsIn(slot) >= maxPerMeal || itemsTotal() >= maxTotal)) continue;
        if (unitsOf(slot, c.key) >= c.maxUnits) continue;
        // Prefer items whose protein share matches what the gap needs, that
        // don't overshoot the remaining energy, spread across slots.
        const wantProteinDensity = gapProtein > 0 ? gapProtein / Math.max(1, gapKcal) : 0;
        const density = c.protein / c.kcal;
        const over = Math.max(0, c.kcal - gapKcal) / Math.max(1, c.kcal);
        const score = Math.abs(density - wantProteinDensity) * 3 + over * 2 + itemsIn(slot) * 0.3;
        if (!best || score < best.score) best = { c, slot, score };
        break; // first suitable slot in fill order is fine — slot spread comes from the itemsIn penalty
      }
    }
    if (!best) break;
    const arr = (bySlot[best.slot] ??= []);
    const existing = arr.find((p) => p.key === best!.c.key);
    if (existing) existing.units += 1; else arr.push({ key: best.c.key, units: 1 });
    gapKcal -= best.c.kcal;
    gapProtein -= best.c.protein;
    proteinCeiling -= best.c.protein;
  }
  return bySlot;
}
