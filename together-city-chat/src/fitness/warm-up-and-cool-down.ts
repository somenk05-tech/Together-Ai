import { EXERCISE_CATALOG, exerciseGifUrl, exerciseThumbUrl, type CatalogExercise } from './exercise-catalog';
import { LIBRARY, howTo, mediaFor, type Exercise } from './exercise-library';

/**
 * ── THE WARM-UP AND THE COOL-DOWN, ON EVERY DAY (owner, 18 Sep) ─────────────
 *
 * "Add the warm-up and rest workouts too, each day, and make it detailed."
 *
 * Today's session always had a warm-up and a cool-down (session-engine.ts);
 * a day of the month did not — it was the working sets alone, so a citizen
 * who opened Thursday saw five movements and no way in or out of them. Now
 * every day carries both, built from what the day works:
 *
 *   · THE WARM-UP is movement, not stretching: a minute of marching, the
 *     spine through cat–cow, then the joints the day will load — hips open
 *     before a lower day, shoulders circle before an upper day, both before a
 *     full-body one. From the library's hand-written mobility rows, which
 *     carry their own steps and, where the owner has filmed them, a film.
 *   · THE COOL-DOWN is the stretches for the muscles just worked, from the
 *     catalogue — the rows the working pool deliberately leaves out — one per
 *     muscle the day touched, held for thirty seconds, with the catalogue's
 *     own steps and animation. Then the calf stretch or the doorway chest
 *     opener from the library, which are filmed.
 *   · A DAY OFF gets a MOBILITY ROUTINE instead: no warm-up, and a cool-down
 *     that is the four stretches a trainer would give anybody — hips,
 *     hamstrings, chest, back — so the day off is the owner's "rest workout"
 *     rather than nothing at all. A light day gets the short warm-up and the
 *     same routine.
 *
 * Deterministic: seeded on the citizen and the day, like the working sets,
 * so the day reads the same on every open.
 */
export interface MobilityStep {
  id: string;
  name: string;
  /** 'hips' · 'chest' — the citizen's word for what it works. */
  works: string;
  /** Held or moved for the time, never counted. */
  seconds: number;
  steps: string[];
  thumb: string;
  gif: string;
  /** The city's own film, or ''. */
  video: string;
}

const UPPER = new Set(['pectorals', 'delts', 'triceps', 'lats', 'upper back', 'biceps', 'traps', 'forearms']);
const LOWER = new Set(['quads', 'hamstrings', 'glutes', 'calves', 'adductors', 'abductors']);

function fromLibrary(id: string, seconds: number): MobilityStep | null {
  const e: Exercise | undefined = LIBRARY.find((x) => x.id === id);
  if (!e) return null;
  const m = mediaFor(e);
  return { id: `lib-${e.id}`, name: e.name, works: e.muscles.join(', '), seconds, steps: howTo(e), thumb: m.thumb, gif: m.gif, video: e.video ?? '' };
}

function fromCatalogue(c: CatalogExercise, seconds: number): MobilityStep {
  return { id: c.id, name: c.name, works: c.target, seconds, steps: c.steps, thumb: exerciseThumbUrl(c), gif: exerciseGifUrl(c), video: '' };
}

const STRETCHES = EXERCISE_CATALOG.filter((e) => /stretch/i.test(e.name) && !/assisted|partner/i.test(e.name));

/** A small deterministic pick: the nth of a seeded order. */
function pick<T>(xs: T[], rnd: () => number): T | undefined {
  if (!xs.length) return undefined;
  return xs[Math.floor(rnd() * xs.length)];
}

/** The way in. Movement for the joints the day will load. */
export function warmUpFor(muscles: readonly string[], kind: 'strength' | 'cardio' | 'rest'): MobilityStep[] {
  if (kind === 'rest') return [];
  const upper = muscles.some((m) => UPPER.has(m));
  const lower = muscles.some((m) => LOWER.has(m));
  const out: (MobilityStep | null)[] = [fromLibrary('march-in-place', 60), fromLibrary('cat-cow', 40)];
  if (kind === 'cardio' || lower || (!upper && !lower)) out.push(fromLibrary('hip-opener', 40));
  if (kind === 'cardio' || upper || (!upper && !lower)) out.push(fromLibrary('shoulder-circles', 30));
  return out.filter((x): x is MobilityStep => x != null);
}

/** The way out: one stretch per muscle the day worked, then the filmed closer. */
export function coolDownFor(muscles: readonly string[], kind: 'strength' | 'cardio' | 'rest', rnd: () => number): MobilityStep[] {
  const out: MobilityStep[] = [];
  const used = new Set<string>();
  const take = (target: string) => {
    const c = pick(STRETCHES.filter((s) => s.target === target && !used.has(s.id)), rnd);
    if (c) { used.add(c.id); out.push(fromCatalogue(c, 30)); }
  };
  if (kind === 'strength' && muscles.length) {
    for (const m of [...new Set(muscles)].slice(0, 4)) take(m);
    const upper = muscles.some((m) => UPPER.has(m));
    const closer = fromLibrary(upper ? 'chest-opener' : 'calf-stretch', 30);
    if (closer) out.push(closer);
    return out;
  }
  /* A DAY OFF, OR A LIGHT DAY: the routine a trainer gives anybody. */
  for (const m of ['glutes', 'hamstrings', 'pectorals', 'lats']) take(m);
  const closer = fromLibrary('calf-stretch', 30);
  if (closer) out.push(closer);
  return out;
}
