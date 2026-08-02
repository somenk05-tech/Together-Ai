import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { SEED_POOL, normCuisine } from './meal-composer';

/**
 * THE THIRD CUISINE VOCABULARY: the one nobody wrote.
 *
 * Two lists are written by hand — the whole-plan mix and the planner's per-slot
 * lock — and both are answers to a question only the CORPUS can settle: which
 * kitchens does this app actually have food from? Nothing checked. So this
 * reads the dataset and the curated seeds and holds the hand-written lists
 * against them.
 *
 * WHAT IT WOULD HAVE CAUGHT. The planner's list offered six of the ten cuisines
 * in the corpus. American alone is 19.7% of it, and `candidates()` EXCLUDES
 * everything outside the chosen list once a bucket is locked — so a third of
 * the recipes could not be asked for, by a control whose entire job is asking.
 *
 * AND WHAT IT STILL WILL. A dataset refresh that introduces a cuisine (the
 * normalise map already knows 'Korea' → 'Korean', and the corpus holds none)
 * fails here rather than shipping a kitchen with no way to choose it. A refresh
 * that DROPS one fails too: an option that matches nothing is a filter that
 * silently returns everything, or on a locked slot, nothing at all.
 *
 * Directions matter and are checked separately. Offered-but-absent is a dead
 * chip; present-but-unoffered is unreachable food.
 */
const web = readFileSync(
  join(__dirname, '..', '..', '..', 'together-city-react', 'src', 'features', 'nutrition', 'cuisineMix.ts'),
  'utf8',
);
const dataset = JSON.parse(
  gunzipSync(readFileSync(join(__dirname, 'data', 'recipes.dataset.json.gz'))).toString(),
) as Array<{ country?: string }>;

/** The quoted strings in one exported array literal. */
const arrayIn = (name: string): string[] => {
  const at = web.indexOf(`export const ${name}`);
  if (at < 0) return [];
  return (web.slice(at, web.indexOf('];', at)).match(/'[^']+'/g) ?? []).map((s) => s.slice(1, -1));
};
const NEUTRAL = /export const NEUTRAL_CUISINE = '([^']+)'/.exec(web)?.[1] ?? '';
const MIX = arrayIn('CUISINES');
const SLOT = [...MIX, NEUTRAL];

const count = (labels: string[]) => {
  const c = new Map<string, number>();
  for (const raw of labels) {
    const k = normCuisine((raw ?? '').trim());
    if (k) c.set(k, (c.get(k) ?? 0) + 1);
  }
  return c;
};
const inDataset = count(dataset.map((r) => r.country ?? ''));
const inSeeds = count(SEED_POOL.map((r) => r.cuisine));
const inPool = new Set([...inDataset.keys(), ...inSeeds.keys()]);

describe('the cuisine vocabulary the corpus decides', () => {
  it('reports what is actually in there', () => {
    const rows = [...inDataset.entries()].sort((a, b) => b[1] - a[1])
      .map(([k, n]) => `  ${k.padEnd(16)} ${String(n).padStart(6)}  ${(100 * n / dataset.length).toFixed(1)}%`);
    // eslint-disable-next-line no-console
    console.log(
      `\n================ CUISINES IN THE CORPUS ================\n`
      + `Dataset recipes: ${dataset.length}\n${rows.join('\n')}\n`
      + `Curated seeds: ${SEED_POOL.length} — `
      + [...inSeeds.entries()].map(([k, n]) => `${k} ${n}`).join(' · ')
      + `\n========================================================\n`,
    );
    expect(dataset.length).toBeGreaterThan(1000);
  });

  it('offers no kitchen the corpus cannot cook', () => {
    // A dead chip on a LOCKED slot is not cosmetic: it empties the meal and the
    // composer falls back by dropping the lock, so the citizen's instruction is
    // silently discarded rather than refused.
    const dead = MIX.filter((c) => !(inDataset.get(c) ?? 0));
    expect(dead).toEqual([]);
    expect(MIX.length).toBe(inDataset.size);
  });

  it('hides no kitchen the corpus has', () => {
    // The direction that cost 32.2% of the recipes.
    const unreachable = [...inPool].filter((c) => !SLOT.includes(c));
    expect(unreachable).toEqual([]);
  });

  it('keeps the neutral components out of the mix and inside the lock', () => {
    // 'Global' is not a kitchen. The mix spends a 100% budget across kitchens,
    // and pick() already gives the neutral components a default weight of 5 —
    // giving them a share of that budget would be a second, contradictory
    // answer to the same question. The LOCK is different: it EXCLUDES, so
    // without this entry locking Snacks to Indian removes every neutral snack.
    expect(NEUTRAL).toBe('Global');
    expect(MIX).not.toContain(NEUTRAL);
    expect(SLOT).toContain(NEUTRAL);
    expect(inDataset.get(NEUTRAL) ?? 0).toBe(0);
    expect(inSeeds.get(NEUTRAL) ?? 0).toBeGreaterThan(0);
  });

  it('folds every spelling the corpus stores onto a name that is offered', () => {
    // The seeds say 'India' where the dataset says 'Indian'; normCuisine is the
    // only thing reconciling them, and a raw label it does not know passes
    // through unchanged — straight into this check.
    const raw = new Set<string>([
      ...dataset.map((r) => (r.country ?? '').trim()),
      ...SEED_POOL.map((r) => r.cuisine.trim()),
    ].filter(Boolean));
    for (const label of raw) expect(SLOT).toContain(normCuisine(label));
  });
});
