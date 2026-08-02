/**
 * The cuisine mix — ONE list, ONE cap rule, ONE way to merge it back.
 *
 * The citizen's cuisine preference is a weighted mix (cuisine → % share of the
 * plan) living inside `FoodPref.extras`. The meal engine reads it; the Nutrition
 * preferences page has always edited it; the Master Profile now edits it too.
 *
 * TWO EDITORS, ONE STORE — and that distinction is the whole safety argument.
 * Nothing is copied into `SharedFields` or the MasterProfile row. Both screens
 * read and write the same `FoodPref.extras`, so there is no second copy for a
 * `syncShared()` to overwrite (d7b0d43, where Beauty destroyed a non-binary
 * citizen's genderIdentity on a skin-type save). What two editors DO risk is
 * drifting apart in what they offer and how they cap, which is why the list and
 * the arithmetic live here rather than in either page.
 *
 * AND `extras` IS REPLACED WHOLESALE ON SAVE — `upsertFoodPref` writes whatever
 * JSON it is handed. So an editor that sends only its own keys erases proteins,
 * allergies and health conditions. `withMix()` exists so neither page can
 * forget to merge.
 */

/** The cuisines a citizen can weight. */
export const CUISINES = [
  'Indian', 'Chinese', 'Italian', 'Mexican', 'Thai',
  'Continental', 'Japanese', 'Mediterranean', 'American', 'Middle Eastern',
];

/**
 * THE THIRD LIST, AND THE TWO QUESTIONS IT WAS WAITING ON.
 *
 * `cuisine-one-store.test.ts` found MealPlan.tsx keeping its own seven-entry
 * list for the per-slot LOCK and recorded it rather than merging it, because
 * both halves were product decisions: does a slot lock offer all ten, and does
 * 'Global' belong in a mix? Measured against the corpus, they answer
 * themselves.
 *
 * WHICH KITCHENS EXIST IS NOT OUR OPINION. The dataset carries ten `country`
 * values across 11,217 recipes — Indian 30.3%, American 19.7%, Continental
 * 16.7%, Thai 7.4%, Mediterranean 7.1%, Middle Eastern 6.7%, Chinese 3.6%,
 * Japanese 3.3%, Italian 2.8%, Mexican 2.5% — and the ten above are exactly
 * those. The planner offered six of them. American, Japanese, Mexican and
 * Middle Eastern, 32.2% of the corpus, could not be chosen at all; and because
 * a LOCKED bucket excludes everything outside the chosen list, somebody who
 * wanted American lunches had no way to say so. So the lock offers all ten.
 *
 * 'GLOBAL' IS NOT A KITCHEN. It is the twelve curated components that belong to
 * no cuisine — fruit bowl, mixed nuts, boiled eggs, sweet corn, whey shake. It
 * stays OUT of the mix, where a percentage share would be a second and
 * contradictory answer to a question the composer already answers (out-of-mix
 * recipes score 1, neutral ones score 5). It stays IN the slot list, where its
 * job is exact and load-bearing: a lock EXCLUDES, so without it, locking Snacks
 * to Indian deletes every neutral snack and the composer quietly drops the lock
 * to refill the meal.
 *
 * The API's `cuisine-vocabulary.spec.ts` holds both lists against the corpus,
 * in both directions — a kitchen offered with no food, and food with no way to
 * choose it, are different bugs and are checked separately.
 */
export const NEUTRAL_CUISINE = 'Global';

/** What a per-slot cuisine lock offers: every kitchen, plus the components that
 *  belong to none. A different SETTING from the mix, so a different list is
 *  fine — a different idea of which kitchens exist is not. */
export const SLOT_CUISINES: string[] = [...CUISINES, NEUTRAL_CUISINE];

/** 'Global' is a storage key the engine matches on; it is not a word to put in
 *  front of somebody. Same rule as the blood group labels. */
export function slotCuisineLabel(cuisine: string): string {
  return cuisine === NEUTRAL_CUISINE ? 'Anything (no cuisine)' : cuisine;
}

/** The extras keys this module touches. Everything else on the blob is somebody
 *  else's and must survive a save untouched. */
export interface CuisineExtras {
  cuisineMix?: Record<string, number>;
  /** Legacy multi-select, kept in step so older readers still work. */
  cuisines?: string[];
}

/** The mix as it stands, falling back to an even split of the legacy list. */
export function readMix(ex: CuisineExtras | null | undefined): Record<string, number> {
  if (ex?.cuisineMix) return ex.cuisineMix;
  const legacy = ex?.cuisines ?? [];
  if (!legacy.length) return {};
  return Object.fromEntries(legacy.map((c) => [c, Math.round(100 / legacy.length)]));
}

/** Total assigned, across the offered cuisines only. */
export const mixTotal = (mix: Record<string, number>): number =>
  CUISINES.reduce((sum, c) => sum + (mix[c] ?? 0), 0);

/** A percentage for one cuisine, capped at whatever is left of 100. */
export function capPct(mix: Record<string, number>, cuisine: string, value: number): number {
  const others = mixTotal(mix) - (mix[cuisine] ?? 0);
  return Math.max(0, Math.min(Math.round(value) || 0, 100 - others));
}

/** An even split across whatever is currently chosen (or everything, if none). */
export function balanced(mix: Record<string, number>): Record<string, number> {
  const active = CUISINES.filter((c) => (mix[c] ?? 0) > 0);
  const list = active.length ? active : CUISINES;
  const each = Math.floor(100 / list.length);
  const next: Record<string, number> = {};
  list.forEach((c, i) => { next[c] = each + (i < 100 - each * list.length ? 1 : 0); });
  return next;
}

/** "Indian 60% · Italian 40%", or a plain sentence when nothing is set. */
export function cuisineSummary(mix: Record<string, number>): string {
  const chosen = Object.entries(mix).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  return chosen.length ? chosen.map(([k, v]) => `${k} ${v}%`).join(' · ') : 'Broad mix — no preference set';
}

/**
 * The extras blob to SEND: everything that was there, with the mix replaced.
 * Zero-share cuisines are dropped rather than stored as noise.
 *
 * The spread is the point. `extras` is replaced wholesale by the server, so an
 * editor that builds its payload from scratch silently deletes the citizen's
 * allergies.
 */
export function withMix<T extends CuisineExtras>(ex: T, mix: Record<string, number>): T {
  const cleaned = Object.fromEntries(Object.entries(mix).filter(([, v]) => v > 0));
  return { ...ex, cuisineMix: cleaned, cuisines: Object.keys(cleaned) };
}
