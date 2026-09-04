import { buildRoutines } from './routine-engine';
import { claimRank, planWithinBudget } from './budget-routine';
import { BEAUTY_PRODUCTS } from './beauty-catalog';
import { recommendProducts, type RecommendedProduct } from './beauty-engine';

/**
 * ── A BAND IS ITS OWN CATEGORY, AND A STEP YOU OWN IS STILL A STEP ──────────
 *
 * Four findings off the live routine sheet, each of which read as correct in
 * every individual string involved. That is what they have in common and why
 * they are together in one file: none of them is a typo or a bad number, and
 * none of them would be caught by a test that checks a value. They are all the
 * page asserting something nobody had checked against the plan underneath it.
 */

const product = (over: Partial<RecommendedProduct> & { id: string; category: string; usage: string }): RecommendedProduct => ({
  name: over.id, brand: 'A Brand', group: 'Skincare', tier: 'Budget', priceInr: 900, tags: [], profileKeys: [],
  suitableSkin: ['all'], actives: [], blurb: '', keyIngredient: '', ingredients: [], ingredientsSource: 'sheet',
  image: '', imageAlt: '', productUrl: '', matched: true,
  ...over,
} as RecommendedProduct);

const bandOf = (rs: ReturnType<typeof buildRoutines>, when: string) => rs.find((r) => r.timeOfDay === when)!;

describe('a hair product is never a step in a face band', () => {
  /**
   * THE ONE THAT SHIPPED. Moroccanoil Treatment Light is a Hair Care product,
   * charged to the hair budget, and its usage copy says night — so the evening
   * SKINCARE column printed it as step 3, labelled FINISH, directly after the
   * face moisturiser. `Finish` is a role name in both vocabularies, which is
   * why every string in the chain was individually right.
   */
  it('keeps a Hair Care product out of the morning and evening whatever its usage says', () => {
    for (const usage of ['Night', 'Morning', 'Morning & Night', 'Daily']) {
      const r = buildRoutines([product({ id: 'oil', group: 'Hair Care', category: 'Hair serum', usage })]);
      expect(bandOf(r, 'morning').steps).toHaveLength(0);
      expect(bandOf(r, 'evening').steps).toHaveLength(0);
      expect(bandOf(r, 'weekly').steps.map((s) => s.productId)).toEqual(['oil']);
    }
  });

  it('keeps a Body Care product in the body band whatever its usage says', () => {
    const r = buildRoutines([product({ id: 'lot', group: 'Body Care', category: 'Body lotion', usage: 'Morning & Night' })]);
    expect(bandOf(r, 'body').steps).toHaveLength(1);
    expect([bandOf(r, 'morning'), bandOf(r, 'evening'), bandOf(r, 'weekly')].every((b) => b.steps.length === 0)).toBe(true);
  });

  it('still reads the usage string for a face product, which is the only thing it decides now', () => {
    const r = buildRoutines([product({ id: 'x', category: 'Serum', usage: 'Night' })]);
    expect(bandOf(r, 'morning').steps).toHaveLength(0);
    expect(bandOf(r, 'evening').steps).toHaveLength(1);
  });
});

describe('a step the citizen already owns holds its place in the order', () => {
  const owned = [{ category: 'face' as const, role: 'Cleanse', why: 'You told us you already have a cleanser.' }];

  it('appears in both face bands, in position, with nothing to buy', () => {
    const r = buildRoutines([product({ id: 'spf', category: 'Sunscreen', usage: 'Morning' })], owned);
    const am = bandOf(r, 'morning').steps;
    expect(am.map((s) => s.step)).toEqual(['Cleanse', 'Protect']);
    expect(am[0].owned).toBe(true);
    expect(am[0].productId).toBe('');
    expect(am[0].priceInr).toBe(0);
    expect(am[0].ownedWhy).toBe(owned[0].why);
    // THE EVENING IS THE ONE THAT MATTERED. Without this the PM column never
    // removed the SPF the AM column put on.
    expect(bandOf(r, 'evening').steps.map((s) => s.step)).toEqual(['Cleanse']);
  });

  it('is numbered in the same sequence as everything else', () => {
    const r = buildRoutines([product({ id: 'spf', category: 'Sunscreen', usage: 'Morning' })], owned);
    expect(bandOf(r, 'morning').steps.map((s) => s.order)).toEqual([1, 2]);
  });

  it('does not fire the no-sunscreen note when the sunscreen is the one they own', () => {
    const withOwnedSpf = buildRoutines(
      [product({ id: 'cream', category: 'Moisturiser', usage: 'Morning' })],
      [{ category: 'face', role: 'Protect', why: 'You told us you already have a sunscreen.' }],
    );
    expect(bandOf(withOwnedSpf, 'morning').notes.join(' ')).not.toMatch(/No sunscreen/i);
    // And it still fires when there genuinely is none.
    const without = buildRoutines([product({ id: 'cream', category: 'Moisturiser', usage: 'Morning' })]);
    expect(bandOf(without, 'morning').notes.join(' ')).toMatch(/No sunscreen/i);
  });

  it('places a kept hair role on wash day, not in a face band', () => {
    const r = buildRoutines([], [{ category: 'hair', role: 'Wash', why: 'You told us you already have a shampoo.' }]);
    expect(bandOf(r, 'weekly').steps.map((s) => s.step)).toEqual(['Wash']);
    expect(bandOf(r, 'morning').steps).toHaveLength(0);
  });
});

describe('two claims the planner will not reach for first', () => {
  /**
   * A TIEBREAK, NOT A FILTER. These assert the ORDER of the comparator, not
   * that any product is unavailable — every one of them is still on the shelf
   * and still buyable in the Market.
   */
  it('ranks an SPF above 50 below a defensible one, and leaves 30–50 alone', () => {
    expect(claimRank({ name: 'Some Sunblock SPF 100 (50 g)', category: 'Sunscreen' })).toBe(1);
    expect(claimRank({ name: 'Some Fluid SPF 50+ PA++++ (50 ml)', category: 'Sunscreen' })).toBe(0);
    expect(claimRank({ name: 'Some Gel SPF 30 (50 ml)', category: 'Sunscreen' })).toBe(0);
  });

  it('ranks a skin-lightening claim below one that does not carry it', () => {
    expect(claimRank({ name: 'O3+ Whitening Tonic (150 ml)', category: 'Toner' })).toBe(1);
    expect(claimRank({ name: 'A Fairness Cream (50 g)', category: 'Moisturiser' })).toBe(1);
    // `brighten` is ordinary radiance copy and catching it would empty the
    // pigmentation shelf. It is deliberately not in the pattern.
    expect(claimRank({ name: 'A Brightening Serum (30 ml)', category: 'Serum' })).toBe(0);
  });

  it('is the shelf’s own SPF claims that it catches, not a synthetic one', () => {
    // The rank sits AFTER answers() in the comparator, so it can only ever
    // break a tie that effectiveness left open. Asserted on the real shelf so
    // that a sheet which stops carrying these stops this test rather than
    // leaving it green against nothing.
    const high = BEAUTY_PRODUCTS.filter((p) => /SPF\s*(6[0-9]|[7-9][0-9]|100)\b/i.test(p.name));
    expect(high.length).toBeGreaterThan(0);
    // AT LEAST ONE, NOT EXACTLY ONE. Two of this shelf's five high-SPF
    // sunblocks are also whitening sunblocks and score both — which is the
    // shelf telling us something about itself worth leaving in the assertion.
    expect(high.every((p) => claimRank(p) >= 1)).toBe(true);
    expect(high.filter((p) => claimRank(p) === 2).length).toBeGreaterThan(0);
  });
});

describe('a concern shown as a chip is a concern the plan reports on', () => {
  const READINGS = [
    { key: 'pigmentation', label: 'Pigmentation & spots', level: 'attention' },
    { key: 'oil', label: 'Oil balance', level: 'attention' },
  ];
  const SHELF = recommendProducts({ readings: READINGS, concerns: [], profile: { skinType: 'combination' }, insights: [] });

  it('names a finding the routine does not answer, and does not name one it does', () => {
    const needs = [...READINGS.map((r) => r.key), 'a-finding-no-product-claims'];
    const plan = planWithinBudget(SHELF, { face: 8000, hair: 8000, body: 8000 }, needs);

    expect(plan.face.uncoveredNeeds).toContain('a-finding-no-product-claims');
    const answered = new Set(plan.face.picks.flatMap((x) => x.product.profileKeys));
    expect(plan.face.uncoveredNeeds.some((k) => answered.has(k))).toBe(false);
    // It is a report and nothing acts on it: the routine is the same either way.
    const without = planWithinBudget(SHELF, { face: 8000, hair: 8000, body: 8000 }, READINGS.map((r) => r.key));
    expect(plan.face.picks.map((x) => x.product.id)).toEqual(without.face.picks.map((x) => x.product.id));
  });
});
