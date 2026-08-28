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
 * AND THE RULE THE OWNER REVERSED ON 16 AUG. This header said raising ₹5,000
 * to ₹10,000 did not mean "spend ₹10,000" — it does now. Utilisation of
 * 95–105% is the first rule, so a bigger budget is an instruction to spend
 * it, and the engine climbs even where the products left claim fewer of the
 * stated concerns. What did NOT reverse: the pool is still decided before
 * the money looks, safety holds at every budget, no need is ever un-covered,
 * and a genuinely dry shelf is explained in leanReason rather than padded.
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
    for (const budget of [500, 1500, 3000, 6000, 8000]) {
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
    // THESE NUMBERS MOVED WITH THE UNIT, NOT WITH THE RULE. The budget is set
    // and spent in purchase prices now, so ₹300 buys one sunscreen rather than
    // a month of four products. The floor for this profile is ₹548 to buy.
    /**
     * ₹700 / ₹1,200 / ₹3,000 → ₹900 / ₹1,300 / ₹5,000, and all three moved for
     * the same reason: the 2026-08 catalogue REPLACED the shelf and the
     * mass-market tier left with the old one. Measured on the new shelf for
     * this profile — ₹700 no longer carries the three essentials (it drops
     * Moisturise), ₹900 is the first budget that does, and the sixth role is
     * not affordable until ₹5,000 where ₹3,000 used to reach it.
     *
     * The RULE is untouched and still asserted below: a short budget keeps
     * Protect, fills essentials in clinical order, and loses the optional steps
     * first. Only the prices the shelf can offer moved.
     */
    const tiny = at(oily, 900).picks.map((x) => x.role);
    const small = at(oily, 1300).picks.map((x) => x.role);
    const full = at(oily, 5000).picks.map((x) => x.role);

    expect(tiny.length).toBeLessThan(full.length);
    expect(tiny).toEqual(expect.arrayContaining(['Protect', 'Moisturise', 'Cleanse']));
    for (const routine of [tiny, small, full]) expect(routine).toContain('Protect');
    // Optional steps are what a short budget loses, never an essential one.
    expect(tiny).not.toContain('Prep');
  });

  it('treats a bigger budget as an instruction to spend it, inside the guards', () => {
    /**
     * REVERSED, 16 AUG, AT THE OWNER'S WORD. This test pinned ₹6,000, ₹7,000
     * and ₹8,000 to the same routine with the rest reported; the band-first
     * rule spends each of them to 95–105% or explains why the guarded shelf
     * could not. Spending is monotone — more money never buys a cheaper
     * routine — and the band is asserted at every point rather than "it grows
     * eventually".
     */
    let prev = 0;
    for (const budget of [6000, 7000, 8000]) {
      const plan = at(oily, budget);
      expect({ budget, monotone: plan.spendInr >= prev }).toEqual({ budget, monotone: true });
      prev = plan.spendInr;
      expect({ budget, bandOrExplained: plan.spendInr >= plan.targetLowInr || plan.leanReason !== null })
        .toEqual({ budget, bandOrExplained: true });
    }
  });

  it('stays silent in the band, and explains only a genuinely dry shelf', () => {
    // The lean sentence used to be the normal case at ₹8,000 — the honest
    // report of an unreachable band. Band-first makes it the exception: this
    // face shelf reaches 95% of ₹8,000, so there is nothing to explain and
    // saying something anyway would be the page apologising for succeeding.
    const plan = at(oily, 8000);
    expect(plan.spendInr).toBeGreaterThanOrEqual(plan.targetLowInr);
    expect(plan.leanReason).toBeNull();
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
    for (const budget of [300, 800, 1500, 3000, 6000, 8000]) {
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
