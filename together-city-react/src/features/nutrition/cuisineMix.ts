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
