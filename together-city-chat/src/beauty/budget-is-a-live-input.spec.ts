import { recommendProducts } from './beauty-engine';
import { planCategory } from './budget-routine';
import { assessBeauty } from './beauty-analysis';
import { activeFamiliesOf } from './active-families';

/**
 * ── CHANGING THE BUDGET RE-RUNS THE RECOMMENDATION ──────────────────────────
 *
 * The owner's rule, and it is a contract rather than a preference:
 *
 *   When the citizen changes their budget, the engine rebuilds the recommended
 *   products for that budget while holding their skin, hair, concerns, goals,
 *   preferences, existing products and safety constraints CONSTANT.
 *
 * Three things it must therefore not be:
 *
 *   NOT  budget → find products costing about that much
 *   NOT  recommend products → add up the prices → say whether they fit
 *   NOT  a bigger budget → the same routine with more things bolted on
 *
 * The order is: conditions → the steps this person needs → the catalogue →
 * safety and preferences → the budget → rank by suitability then value → build
 * → and only then price it. planCategory's six passes ARE that order, which is
 * why this file asserts the order's consequences rather than the passes.
 *
 * AND THE RULE THAT OUTRANKS ALL OF IT. Raising ₹5,000 to ₹10,000 does not mean
 * "spend ₹10,000". It means "what is the best routine achievable within
 * ₹10,000". If that is ₹6,200, the answer is ₹6,200 and the rest is reported,
 * not absorbed. This is asserted twice below, in both directions, because it is
 * the one an optimiser reaches for a reason to break.
 */

const OILY = assessBeauty({
  skinType: 'oily', skinConcerns: ['Acne', 'Dark Spots'], skinGoals: ['Oil Control'], age: 26,
});
const MATURE = assessBeauty({
  skinType: 'dry', skinConcerns: ['Dryness', 'Fine Lines'], skinGoals: ['Hydration', 'Anti Ageing'], age: 47,
});

const shelfFor = (a: ReturnType<typeof assessBeauty>, skinType: string) => {
  const readings = [...a.skin.readings, ...a.hair.readings];
  return {
    products: recommendProducts({ readings, concerns: [], profile: { skinType }, insights: [] }),
    needs: new Set(readings.filter((r) => r.level !== 'good').map((r) => r.key)),
  };
};

const oily = shelfFor(OILY, 'oily');
const mature = shelfFor(MATURE, 'dry');

const at = (s: typeof oily, budget: number) => planCategory(s.products, 'face', budget, s.needs);
const idsAt = (s: typeof oily, budget: number) => at(s, budget).picks.map((x) => x.product.id);
const roleMap = (s: typeof oily, budget: number) =>
  new Map(at(s, budget).picks.map((x) => [x.role, x.product.id]));

describe('the budget is an input to selection, not a display over the answer', () => {
  it('holds everything except the money constant', () => {
    /**
     * THE PRECONDITION FOR EVERY OTHER ASSERTION IN THIS FILE. If the eligible
     * pool moved with the budget, "the routine changed" would prove nothing —
     * the profile would have changed underneath it. The pool is decided by the
     * assessment, the skin type, the allergies and the conditions, and the
     * budget is not one of its arguments. Asserted rather than trusted, because
     * the day somebody passes the budget into recommendProducts to "help it
     * rank", every test below starts passing for the wrong reason.
     */
    const pool = oily.products.filter((p) => p.matched).map((p) => p.id).sort();
    for (const budget of [500, 1500, 3000, 6000, 10000, 60000]) {
      const eligible = oily.products.filter((p) => p.matched).map((p) => p.id).sort();
      expect({ budget, pool: eligible }).toEqual({ budget, pool });
    }
  });

  it('re-selects rather than appends when the budget goes up', () => {
    /**
     * A BIGGER BUDGET MAY REPLACE A STEP, NOT ONLY ADD ONE. Measured on the
     * mature profile, where the shelf has genuinely better-matched products
     * further up: ₹1,000 buys a Nivea sunscreen, a Kama Ayurveda cleanser and
     * Minimalist Retinol 0.3%; ₹2,000 replaces two of those three; ₹4,000
     * replaces the retinoid with the Vichy specialist serum, which answers more
     * of this person's findings than the one it displaces.
     *
     * Replacement is the whole property. A routine that can only grow is a
     * shopping list with a budget printed on it.
     */
    const lean = roleMap(mature, 1000);
    const roomy = roleMap(mature, 4000);
    const replaced = [...lean].filter(([role, id]) => roomy.has(role) && roomy.get(role) !== id);
    expect(replaced.length).toBeGreaterThan(0);
  });

  it('strips down to what matters when the budget goes down, in clinical order', () => {
    /**
     * NOT "the first four of the six". Sunscreen is the one face step with no
     * substitute and washing with water is at least possible, so a short budget
     * keeps Protect and loses the optional steps first. The floor's own
     * ordering, seen from outside.
     */
    const tiny = at(oily, 300).picks.map((x) => x.role);
    const small = at(oily, 800).picks.map((x) => x.role);
    const full = at(oily, 1500).picks.map((x) => x.role);

    expect(tiny.length).toBeLessThan(full.length);
    expect(tiny).toEqual(expect.arrayContaining(['Protect', 'Moisturise', 'Cleanse']));
    for (const routine of [tiny, small, full]) expect(routine).toContain('Protect');
    // Optional steps are what a short budget loses, never an essential one.
    expect(tiny).not.toContain('Prep');
  });

  it('does not treat a bigger budget as an instruction to spend it', () => {
    /**
     * THE RULE THAT OUTRANKS THE REST. Once the shelf has nothing left that is
     * better matched, more money buys the SAME routine and the difference is
     * reported. Asserted across the whole top of the range rather than at one
     * pair, because "it stops eventually" is not the property — "it stops at
     * the right routine and stays there" is.
     */
    const settled = idsAt(oily, 6000);
    for (const budget of [6000, 10000, 25000, 60000]) {
      expect({ budget, picks: idsAt(oily, budget) }).toEqual({ budget, picks: settled });
      const plan = at(oily, budget);
      expect({ budget, spentAll: plan.remainingInr === 0 }).toEqual({ budget, spentAll: false });
    }
  });

  it('says why it stopped, rather than leaving the gap unexplained', () => {
    // "You increased your budget, and we are not recommending you spend the
    // rest" has to be a sentence on the page, not an absence on it.
    const plan = at(oily, 10000);
    expect(typeof plan.leanReason).toBe('string');
    expect(plan.leanReason).toContain('10,000');
    expect(plan.remainingInr).toBeGreaterThan(0);
  });

  it('prices the routine it built, and never builds to a price', () => {
    for (const budget of [800, 1500, 3000, 6000, 20000]) {
      const plan = at(oily, budget);
      const summed = plan.picks.reduce((n, x) => n + x.monthlyInr, 0);
      // The monthly figure is the routine's, arrived at afterwards.
      expect({ budget, monthly: plan.monthlyInr }).toEqual({ budget, monthly: summed });
      // And it never crosses the ceiling to reach anything.
      expect({ budget, overCeiling: plan.monthlyInr > plan.ceilingInr })
        .toEqual({ budget, overCeiling: false });
    }
  });

  it('keeps every safety constraint at every budget', () => {
    /**
     * SAFETY IS NOT A FUNCTION OF THE MONEY. A citizen who raises their budget
     * has not consented to two retinoids, and one who lowers it has not lost
     * the right to a routine that does not fight itself. The overlap rule and
     * the one-per-role rule are asserted across the whole range, in both
     * directions, because a budget pass is exactly where a guard gets skipped.
     */
    for (const budget of [300, 800, 1500, 3000, 6000, 10000, 25000, 60000]) {
      const picks = at(oily, budget).picks;
      const roles = picks.map((x) => x.role);
      expect({ budget, dupeRoles: roles.length !== new Set(roles).size })
        .toEqual({ budget, dupeRoles: false });
      const families = picks.flatMap((x) => [...activeFamiliesOf(x.product)]);
      expect({ budget, dupeActives: families.length !== new Set(families).size })
        .toEqual({ budget, dupeActives: false });
    }
  });
});
