import { BEAUTY_PRODUCTS } from './beauty-catalog';
import { ruleFor, SHOP_ONLY_CATEGORIES, buildRoutines } from './routine-engine';
import { recommendProducts } from './beauty-engine';
import { ROUTINE_GROUPS } from './budget-routine';

/**
 * ── A CATEGORY THE ROUTINE CANNOT PLACE IS A CATEGORY IT PLACES WRONGLY ─────
 *
 * `classify()` ends in `?? { step: 'Treat', rank: 45, instructions: 'Apply a
 * thin, even layer.' }`. That fallback is a safety net and it is also a
 * SILENT one: a category with no rule does not throw, it produces a plausible
 * step in roughly the middle of the face routine with an instruction that is
 * true of almost nothing.
 *
 * The 2026-08 catalogue took the shelf from 16 display categories to 55 and
 * thirteen of them landed in that net at once — 560 products, including 166
 * facial kits, 107 hair kits and 37 foot creams, every one of them printed
 * into a face routine as "Treat · apply a thin, even layer". Two more did
 * something worse than fall through: "Hair treatment" and "Scalp treatment"
 * MATCHED the face `/treatment/` rule thirty lines above their own and were
 * handed "a pea-sized amount over the whole face, avoiding the eye area".
 *
 * That is the second time this exact failure has happened in this file — the
 * comment above the moisturiser rule records the first, when `/cream/` caught
 * "Hand cream" — and both times it was found by looking rather than by a test.
 * This is the test.
 */

const cats = new Map<string, { group: string; n: number }>();
for (const p of BEAUTY_PRODUCTS) {
  if (!cats.has(p.category)) cats.set(p.category, { group: p.group, n: 0 });
  (cats.get(p.category) as { group: string; n: number }).n++;
}
const routineCats = [...cats].filter(([c, { group }]) => ROUTINE_GROUPS.has(group) && !SHOP_ONLY_CATEGORIES.has(c));

/**
 * The rank bands each group's steps must live in. A face rule reaching a hair
 * product is how the whole-face instruction got onto a keratin treatment.
 *
 * SUNSCREEN IS THE ONE DELIBERATE EXCEPTION and it is not a gap in the scheme:
 * rank 90 puts it after every other face step because under anything else it
 * stops working. It sits above the hair and body bands numerically and is
 * still a face step, so it is named here rather than widening the face band to
 * 90 — which would let any hair or body rule drift into it unnoticed.
 */
const BAND: Record<string, [number, number]> = {
  Skincare: [10, 57],
  'Hair Care': [58, 69],
  'Body Care': [70, 79],
};
const inBand = (group: string, rank: number) => {
  if (group === 'Skincare' && rank === 90) return true;
  const [lo, hi] = BAND[group];
  return rank >= lo && rank <= hi;
};

describe('every category on the shelf is a step the routine can place', () => {
  it('leaves no routine category without a rule of its own', () => {
    const unruled = routineCats.filter(([c]) => !ruleFor(c)).map(([c, { n }]) => `${c} (${n} products)`);
    expect(unruled).toEqual([]);
  });

  it('never lets one group’s rule reach another group’s product', () => {
    const crossed = routineCats
      .filter(([c, { group }]) => {
        const r = ruleFor(c);
        if (!r) return false;
        return !inBand(group, r.rank);
      })
      .map(([c, { group }]) => `${c} is ${group} but classifies at rank ${ruleFor(c)?.rank}`);
    expect(crossed).toEqual([]);
  });

  it('gives every step a real instruction, not a shrug', () => {
    // 'Apply a thin, even layer' is the fallback's text. Any rule that repeats
    // it has a rule in name only.
    const shrugs = routineCats
      .filter(([c]) => {
        const r = ruleFor(c);
        return !r || r.instructions.trim().length < 30 || /^apply a thin, even layer\.?$/i.test(r.instructions.trim());
      })
      .map(([c]) => c);
    expect(shrugs).toEqual([]);
  });

  it('never tells a dry shampoo to be rinsed out', () => {
    // /shampoo/ matches 'Dry shampoo', so the wash rule reached it and said
    // "rinse thoroughly" — the one instruction it must never be given.
    const dry = ruleFor('Dry shampoo');
    expect(dry).not.toBeNull();
    expect(dry?.instructions ?? '').not.toMatch(/rinse/i);
  });

  it('keeps bundles and worn items out of a list of steps', () => {
    // They are on the shelf, in a routine group, and still not steps. If one
    // ever gains a rule, this says so rather than letting both be true.
    for (const c of SHOP_ONLY_CATEGORIES) expect({ category: c, hasRule: !!ruleFor(c) }).toEqual({ category: c, hasRule: false });
  });

  it('builds a routine that places every step it prints', () => {
    const readings = [
      { key: 'acne', label: 'Acne', level: 'attention' },
      { key: 'hydration', label: 'Hydration', level: 'attention' },
      { key: 'pigmentation', label: 'Pigmentation', level: 'monitor' },
      { key: 'scalp', label: 'Scalp', level: 'attention' },
      { key: 'damage', label: 'Damage', level: 'attention' },
      { key: 'texture', label: 'Texture', level: 'monitor' },
    ];
    const shelf = recommendProducts({ readings, concerns: [], profile: { skinType: 'combination' }, insights: [] });
    const routines = buildRoutines(shelf);

    // Every band the shelf can fill is filled, and nothing lands on the fallback.
    const steps = routines.flatMap((r) => r.steps);
    expect(steps.length).toBeGreaterThan(0);
    expect(steps.filter((s) => s.instructions === 'Apply a thin, even layer.')).toEqual([]);

    // And no product from a group that is not a routine, nor a shop-only bundle.
    const byId = new Map(shelf.map((p) => [p.id, p]));
    const strays = steps
      .map((s) => byId.get(s.productId))
      .filter((p) => !p || !ROUTINE_GROUPS.has(p.group) || SHOP_ONLY_CATEGORIES.has(p.category))
      .map((p) => p?.id ?? 'unknown');
    expect(strays).toEqual([]);
  });
});
