import { SLOTS, type SlotCode, type MealCategory } from './meal-engine';
import { scaleComponent, sumTotals, type PoolRecipe, type ComposedMeal, type MealComponentOut } from './meal-composer';

/**
 * THE DAY A CITIZEN BUILDS THEMSELVES.
 *
 * "Create Your Own Meal Plan" added dishes to a grocery CART: you picked food
 * and got a shopping list, never a plan. This is the plan — the dishes somebody
 * chose, on the day they chose them, laid out in the same four courses and read
 * on the same page as the engine's.
 *
 * IT IS DELIBERATELY EMPTY UNTIL THEY FILL IT. The other option was to let their
 * choices take over slots in the composed day, which keeps the prescription met
 * — and is not what was asked for. A day built by hand shows what was put in it
 * and nothing else, so the totals are the honest sum of their choices rather
 * than a number the engine topped up behind them. The page says how that
 * compares to their target; it does not quietly fix it.
 *
 * Prisma-free and pure, so the slot inference and the arithmetic can be tested
 * without a database — the same reason mail-inbound's helpers live apart.
 */

/** A dish somebody added, and the course they added it to. */
export interface OwnEntry { slot: SlotCode; recipeId: string }

/**
 * Which course does this dish belong to?
 *
 * Read off the recipe's own categories, which the corpus already computes —
 * asking the citizen to file every dish into a course would be a second
 * decision for something the data already knows. Ties go to the earliest course
 * in the day that admits it, so a dish that is both lunch and dinner lands at
 * lunch and can be moved.
 *
 * Nothing matches → dinner, the course with the widest plate. A dish with no
 * usable category is a corpus gap, and stranding it would hide that from the
 * person who just chose it.
 */
export function slotForRecipe(r: { categories: MealCategory[] }): SlotCode {
  const cats = r.categories ?? [];
  for (const s of SLOTS) {
    if (cats.some((c) => s.categories.includes(c))) return s.code;
  }
  return 'd';
}

/**
 * The day index a new dish should join: the first day from today that has not
 * been locked.
 *
 * This is the whole of "once they lock a day, the next dish is tomorrow's".
 * Locking is the only thing that moves it, so a citizen who adds nothing and
 * locks nothing keeps adding to today, and one who locks three days in a row is
 * building Thursday.
 */
export function targetDay(todayIndex: number, locks: readonly number[], horizon: number): number {
  const locked = new Set(locks);
  for (let d = todayIndex; d < todayIndex + horizon; d++) if (!locked.has(d)) return d;
  return todayIndex + horizon - 1;   // every day ahead is settled — hold on the last one
}

/**
 * Assemble one citizen-built day into the same ComposedMeal shape the engine
 * emits, so the day view renders both with one component.
 *
 * Portions are 100%: they chose the dish, not a fraction of it. The engine
 * scales its picks to hit a target; scaling somebody's own choice to 62% of a
 * serving would be the plan arguing with them.
 */
export function buildOwnDay(entries: readonly OwnEntry[], pool: readonly PoolRecipe[]): ComposedMeal[] {
  const byId = new Map(pool.map((r) => [r.id, r]));
  const out: ComposedMeal[] = [];

  for (const def of SLOTS) {
    const mine = entries.filter((e) => e.slot === def.code);
    if (!mine.length) continue;

    const components: MealComponentOut[] = [];
    for (const e of mine) {
      const r = byId.get(e.recipeId);
      // A dish that has left the corpus — or one this citizen may no longer eat
      // — is skipped rather than rendered as a blank row. The caller reports the
      // count so the page can say something happened.
      if (r) components.push(scaleComponent(r, 100, r.role));
    }
    if (!components.length) continue;

    const totals = sumTotals(components);
    out.push({
      slot: def.code, key: def.key, label: def.label,
      title: def.label,
      scheduledTime: def.start,
      energyPct: 0, targetKcal: 0,
      totals, minutes: components.reduce((t, c) => t + (c.minutes ?? 0), 0),
      components,
    });
  }
  return out;
}

/** Every component across a built day, for totals and for the grocery list. */
export function ownDayComponents(meals: readonly ComposedMeal[]): MealComponentOut[] {
  return meals.flatMap((m) => m.components);
}
