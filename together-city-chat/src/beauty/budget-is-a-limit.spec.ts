import { recommendProducts } from './beauty-engine';
import { planCategory, planWithinBudget, planForWire, categoryOf, clampBudget, BUDGET_MIN, BUDGET_MAX } from './budget-routine';
import { monthlyCostInr, monthsOfUse, packSize, lastsLabel } from './monthly-cost';
import { BEAUTY_PRODUCTS } from './beauty-catalog';

/**
 * THE BUDGET IS A LIMIT, NOT AN ESTIMATE.
 *
 * The failure this file exists to prevent is the one every shop makes: build
 * the ideal routine, price it, and present a number the person cannot afford
 * with an apology attached. That is not a budget feature — it is a quote. The
 * budget here is an INPUT to selection, and the only way to know that is still
 * true is to plan at six budgets and check the answers are actually different
 * and never over.
 *
 * The six are the ones the owner named: ₹1,000, ₹2,500, ₹5,000, ₹10,000,
 * ₹25,000, ₹60,000.
 */

const READINGS = [
  { key: 'pigmentation', label: 'Pigmentation & spots', level: 'attention' },
  { key: 'hydration', label: 'Hydration', level: 'monitor' },
  { key: 'oil', label: 'Oil balance', level: 'attention' },
  { key: 'redness', label: 'Redness', level: 'monitor' },
  { key: 'scalp', label: 'Scalp', level: 'attention' },
  { key: 'damage', label: 'Damage', level: 'monitor' },
];
const NEEDS = READINGS.map((r) => r.key);
const SHELF = recommendProducts({ readings: READINGS, concerns: [], profile: { skinType: 'combination' }, insights: [] });
const TIERS = [1000, 2500, 5000, 10000, 25000, 60000];
const plan = (n: number) => planWithinBudget(SHELF, { face: n, hair: n, body: n }, NEEDS);

describe('what a product costs per month', () => {
  it('reads the pack size off the name, in ml or g alike', () => {
    expect([packSize('X (100 ml)'), packSize('Y (50 g)'), packSize('Z (1.5 l)'), packSize('No size')])
      .toEqual([100, 50, 1500, null]);
  });

  it('costs a big cheap pack per month, not per purchase', () => {
    // The whole point. A ₹195 body wash bought twice a year is not a ₹195
    // monthly expense, and a budget compared against purchase prices is
    // comparing two different things.
    const wash = { name: 'Body wash (300 ml)', category: 'Body wash', usage: 'Body', priceInr: 195 };
    expect(monthlyCostInr(wash)).toBeLessThan(wash.priceInr);
    expect(monthsOfUse(wash)).toBeGreaterThan(1);
  });

  it('never says a product lasts more than a year', () => {
    // A 500 ml micellar water at face-sized doses works out at two and a half
    // years, which is not a plan — it is a bottle you will throw away. Most of
    // these carry a 6M or 12M symbol.
    expect(monthsOfUse({ name: 'Micellar (500 ml)', category: 'Toner', usage: 'Morning & Night' }))
      .toBeLessThanOrEqual(12);
  });

  it('counts a twice-daily serum as twice the serum', () => {
    const once = { name: 'S (30 ml)', category: 'Serum', usage: 'Night', priceInr: 900 };
    const twice = { ...once, usage: 'Morning & Night' };
    expect(monthsOfUse(twice)).toBeCloseTo(monthsOfUse(once) / 2, 5);
  });

  it('rounds the monthly figure UP', () => {
    // Eight steps each rounded down is a routine that fits on the page and not
    // in the month.
    const p = { name: 'X (100 ml)', category: 'Cleanser', usage: 'Morning & Night' };
    expect(monthlyCostInr({ ...p, priceInr: 1000 })).toBe(Math.ceil(1000 / monthsOfUse(p)));
  });

  it('says how long it lasts in words somebody uses', () => {
    // "1.4 months" is not a thing anybody says, and rounding it to "1 month" is
    // the difference between one sunscreen a month and running out halfway.
    expect([lastsLabel(0.9), lastsLabel(1.4), lastsLabel(3), lastsLabel(2.5)])
      .toEqual(['about 4 weeks', 'about 6 weeks', 'about 3 months', 'about 2½ months']);
  });

  it('gives every product on the shelf a sane monthly cost', () => {
    const silly = BEAUTY_PRODUCTS.filter((p) => {
      const m = monthlyCostInr(p);
      return m < 1 || m > p.priceInr * 2;
    }).map((p) => p.id);
    expect(silly).toEqual([]);
  });
});

describe('the budget is a limit', () => {
  it.each(TIERS)('never exceeds ₹%i in any category', (n) => {
    const p = plan(n);
    expect([
      ['face', p.face.monthlyInr <= n],
      ['hair', p.hair.monthlyInr <= n],
      ['body', p.body.monthlyInr <= n],
    ]).toEqual([['face', true], ['hair', true], ['body', true]]);
  });

  it('charges a product to its own category, never to the band it lands in', () => {
    // A face mask and a shampoo share the weekly band and nothing else.
    expect([categoryOf('Skincare'), categoryOf('Hair Care'), categoryOf('Body Care')])
      .toEqual(['face', 'hair', 'body']);
    for (const c of ['face', 'hair', 'body'] as const) {
      const wrong = plan(10000)[c].picks.filter((x) => categoryOf(x.product.group) !== c).map((x) => x.product.id);
      expect(wrong).toEqual([]);
    }
  });

  it('clamps anything outside the range the sliders offer, and zero is inside it', () => {
    expect([clampBudget(0), clampBudget(-5), clampBudget(999999), clampBudget(NaN)])
      .toEqual([0, BUDGET_MIN, BUDGET_MAX, BUDGET_MIN]);
    expect(BUDGET_MIN).toBe(0);
  });

  it('plans nothing at all for a category set to zero', () => {
    // ZERO IS AN ANSWER. Somebody who already owns a body wash they like says
    // so by setting it to zero, and the correct response is silence — not the
    // cheapest thing we could find, and not a list of what they are missing.
    const p = planWithinBudget(SHELF, { face: 5000, hair: 3000, body: 0 }, NEEDS);
    expect({
      skipped: p.body.skipped, picks: p.body.picks.length,
      leftOut: p.body.leftOut.length, upgrades: p.body.upgrades.length,
      minimum: p.body.minimumInr, monthly: p.body.monthlyInr,
    }).toEqual({ skipped: true, picks: 0, leftOut: 0, upgrades: 0, minimum: null, monthly: 0 });
    // And it does not disturb the categories that were funded.
    expect(p.face.picks.length).toBeGreaterThan(0);
    expect(p.hair.picks.length).toBeGreaterThan(0);
    expect(p.totalMonthlyInr).toBe(p.face.monthlyInr + p.hair.monthlyInr);
  });
});

describe('the routine genuinely changes with the budget', () => {
  it('builds a smaller routine at ₹1,000 than at ₹5,000', () => {
    const lean = plan(1000).face;
    const roomy = plan(5000).face;
    expect(lean.monthlyInr).toBeLessThan(roomy.monthlyInr);
    expect(lean.picks.length).toBeLessThan(roomy.picks.length);
  });

  it('says what a short budget would need, rather than just failing', () => {
    const lean = plan(1000).face;
    // Not "your budget is insufficient" — a number, so the choice is real.
    expect(typeof lean.minimumInr).toBe('number');
    expect(lean.minimumInr!).toBeGreaterThan(1000);
    // And it still builds what it can, naming what it left out.
    expect(lean.picks.length).toBeGreaterThan(0);
    expect(lean.leftOut.length).toBeGreaterThan(0);
  });

  it('drops the most substitutable step first, not the last one declared', () => {
    // Sunscreen is the one face step with no substitute. Cleansing with water
    // is at least possible. A short budget keeps the sunscreen.
    const lean = plan(1000).face;
    expect(lean.picks.map((x) => x.role)).toContain('Protect');
  });

  it('spends more on a better product before it spends on another product', () => {
    // ₹2,500 buys the same four ROLES as ₹1,000 could not, but the moisturiser
    // it picks answers more of this person's needs than the cheapest one does.
    const cheap = plan(1000).face.picks.find((x) => x.role === 'Moisturise')!;
    const better = plan(2500).face.picks.find((x) => x.role === 'Moisturise')!;
    expect(better.monthlyInr).toBeGreaterThan(cheap.monthlyInr);
    const answers = (x: typeof cheap) => x.product.profileKeys.filter((k) => NEEDS.includes(k)).length;
    expect(answers(better)).toBeGreaterThan(answers(cheap));
  });

  it('does NOT spend the rest of a large budget', () => {
    // The line the whole feature turns on. ₹10,000, ₹25,000 and ₹60,000 all buy
    // the same routine, because there is nothing left worth adding — and the
    // remaining money is reported rather than absorbed.
    const ten = plan(10000).face;
    const sixty = plan(60000).face;
    expect(sixty.picks.map((x) => x.product.id)).toEqual(ten.picks.map((x) => x.product.id));
    expect(sixty.remainingInr).toBeGreaterThan(40000);
  });

  it('is bounded by the roles a routine has, not by the money', () => {
    // LEAN IS STRUCTURAL. Six roles exist for the face and there is no seventh
    // to buy, so a budget ten times larger cannot produce a longer list — only
    // a better one. This is what the old count-based rule was really protecting
    // and it survives the change from ceiling to target intact.
    for (const n of TIERS) {
      expect({ budget: n, over: plan(n).face.picks.length > 6 }).toEqual({ budget: n, over: false });
    }
    // And more money genuinely does not mean more steps beyond that point.
    expect(plan(60000).face.picks.length).toBeLessThanOrEqual(plan(10000).face.picks.length);
  });

  it('holds at most one product per role, at any budget', () => {
    // This is what prevents cleanser-toner-essence-serum-serum-serum, and it is
    // structural rather than a cap on the count.
    for (const n of TIERS) {
      for (const c of ['face', 'hair', 'body'] as const) {
        const roles = plan(n)[c].picks.map((x) => x.role);
        expect({ budget: n, category: c, dupes: roles.length !== new Set(roles).size })
          .toEqual({ budget: n, category: c, dupes: false });
      }
    }
  });

  it('never crosses the ceiling, and never runs to it once the target is met', () => {
    /**
     * THE TWO PROMISES THE HEADROOM MAKES. B × 1.05 is a hard stop — nothing is
     * ever chosen that crosses it, at any budget, for any reason. And the five
     * per cent above B is there to let a MEANINGFULLY better match through, not
     * as an allowance to be spent: both target passes ask `spent < B × 0.90`
     * before every single move, so a routine that has reached its target does
     * not then climb.
     */
    for (const n of TIERS) {
      const c = planCategory(SHELF, 'face', n, new Set(NEEDS));
      expect({ budget: n, aboveCeiling: c.monthlyInr > c.ceilingInr }).toEqual({ budget: n, aboveCeiling: false });
      expect({ budget: n, overBy: c.overInr <= c.ceilingInr - c.budgetInr }).toEqual({ budget: n, overBy: true });
      if (c.monthlyInr >= c.targetLowInr) {
        expect({ budget: n, ranToCeiling: c.monthlyInr === c.ceilingInr }).toEqual({ budget: n, ranToCeiling: false });
      }
    }
  });

  it('never lets one product become most of the routine', () => {
    /**
     * WHAT AN OPTIMISER DOES IF NOTHING FORBIDS IT. Aiming at ₹5,000 and taking
     * whichever single swap landed closest, the planner put a ₹3,300-a-month
     * sunscreen into a ₹5,000 face routine — one purchase with four accessories
     * attached, and every individual rule satisfied. Half the category budget
     * is the cap on any step the target passes reach for.
     *
     * The floor is exempt and has to be: if the only compatible sunscreen costs
     * that much, that is the routine, and no amount of capping changes it.
     */
    for (const n of TIERS) {
      for (const cat of ['face', 'hair', 'body'] as const) {
        const c = planCategory(SHELF, cat, n, new Set(NEEDS));
        const dominant = c.picks.filter((x) => x.monthlyInr > c.budgetInr * 0.5);
        // Anything over the cap can only be there because the floor put it
        // there — which means the routine could not have been built without it.
        const excusable = dominant.every((x) => c.picks.length === 1 || x.tier === 'essential');
        expect({ budget: n, category: cat, ok: excusable }).toEqual({ budget: n, category: cat, ok: true });
      }
    }
  });

  it('uses a budget it can reach, instead of stopping at a fifth of it', () => {
    // THE FAILURE THIS REPLACED. A ₹5,000 face budget bought a ₹1,108 routine —
    // twenty-two per cent — while better-matched products for those very steps
    // sat on the shelf. Either the plan now reaches the target, or it is under
    // the quarter-of-the-budget line with a sentence saying why.
    for (const n of [2500, 5000, 10000]) {
      const c = planCategory(SHELF, 'face', n, new Set(NEEDS));
      const ok = c.monthlyInr >= c.targetLowInr || c.leanReason !== null;
      expect({ budget: n, reachedOrExplained: ok }).toEqual({ budget: n, reachedOrExplained: true });
    }
    // And at ₹5,000 specifically it does reach it, because this shelf can.
    const five = planCategory(SHELF, 'face', 5000, new Set(NEEDS));
    expect(five.monthlyInr).toBeGreaterThan(5000 * 0.25);
  });

  it('never buys a worse-matched product than one it could have had for the money', () => {
    // COMPATIBILITY AND EFFECTIVENESS OUTRANK BUDGET UTILISATION, and this is
    // that ranking as an assertion: for every step in the plan, no product for
    // the same step answers more of this person's findings. If reaching the
    // target ever cost effectiveness, this is what would catch it.
    const c = planCategory(SHELF, 'face', 5000, new Set(NEEDS));
    const answers = (p: { profileKeys: string[] }) => p.profileKeys.filter((k) => NEEDS.includes(k)).length;
    for (const pick of c.picks) {
      const rivals = SHELF.filter((p) => p.matched && p.category === pick.product.category);
      const best = Math.max(...rivals.map(answers));
      expect({ role: pick.role, asGoodAsAvailable: answers(pick.product) === best })
        .toEqual({ role: pick.role, asGoodAsAvailable: true });
    }
  });

  it('offers what could be added instead of adding it', () => {
    const rich = plan(60000).face;
    for (const u of rich.upgrades) expect(rich.picks.map((x) => x.role)).not.toContain(u.role);
  });
});

describe('one category does not spend another category\'s money', () => {
  it('plans face, hair and body independently', () => {
    // A generous face budget must not buy a better shampoo.
    const even = planWithinBudget(SHELF, { face: 5000, hair: 5000, body: 5000 }, NEEDS);
    const lopsided = planWithinBudget(SHELF, { face: 60000, hair: 5000, body: 5000 }, NEEDS);
    expect(lopsided.hair.picks.map((x) => x.product.id)).toEqual(even.hair.picks.map((x) => x.product.id));
    expect(lopsided.body.picks.map((x) => x.product.id)).toEqual(even.body.picks.map((x) => x.product.id));
  });

  it('totals what it actually spent, not what it was given', () => {
    const p = plan(10000);
    expect(p.totalBudgetInr).toBe(30000);
    expect(p.totalMonthlyInr).toBe(p.face.monthlyInr + p.hair.monthlyInr + p.body.monthlyInr);
    expect(p.totalRemainingInr).toBe(30000 - p.totalMonthlyInr);
  });
});

describe('the monthly budget does not sit on top of the profile\'s own answer', () => {
  /**
   * THE OUTAGE THIS PREVENTS. `extras.budget` is the profile's onboarding
   * answer — a STRING, "₹1000–2500". The monthly budget was first stored under
   * that same key, so an object landed where a string was expected and
   * `recommendProducts` called `.match()` on it. That function is the one every
   * beauty screen goes through: the market, the routine and the profile all
   * returned 500 together, and the only thing the citizen saw was "we couldn't
   * build your routine just now".
   *
   * Two guards, because either one alone would have been enough and neither was
   * there: the key is different, and the parser checks the shape.
   */
  it('survives a budget field that is not a string at all', () => {
    const shelf = recommendProducts({
      readings: READINGS, concerns: [],
      // Exactly what was written to that field, cast through `unknown` because
      // the type says string and the stored blob did not care.
      profile: { skinType: 'combination', budget: { face: 3000 } as unknown as string },
      insights: [],
    });
    expect(shelf.length).toBeGreaterThan(0);
  });

  it('still reads a real budget string', () => {
    const cheap = recommendProducts({ readings: READINGS, concerns: [], profile: { skinType: 'combination', budget: 'Under ₹500' }, insights: [] });
    const rich = recommendProducts({ readings: READINGS, concerns: [], profile: { skinType: 'combination', budget: '₹5000+' }, insights: [] });
    // The band nudges preference by a few points, so the ORDER of the shelf
    // differs even though the same products are on it.
    expect(cheap.map((p) => p.id)).not.toEqual(rich.map((p) => p.id));
  });
});

describe('a profile with concerns but no photo assessment', () => {
  it('gets every essential first, and nothing that does not suit the profile', () => {
    // No named needs means nothing to TREAT, so the high-value step is absent
    // and the essentials are all there. What the budget then adds is bounded by
    // the same compatibility gate as everything else: the plan may reach for
    // the target, it may not reach outside the matched shelf to do it.
    const shelf = recommendProducts({ readings: [], concerns: ['acne', 'dryness'], profile: { skinType: 'oily' }, insights: [] });
    const p = planCategory(shelf, 'face', 5000, new Set());
    const matched = new Set(shelf.filter((x) => x.matched).map((x) => x.id));
    // Every essential is either bought or named in leftOut — an essential that
    // silently isn't there is the one outcome a routine must never have.
    for (const role of ['Cleanse', 'Moisturise', 'Protect']) {
      const seen = p.picks.some((x) => x.role === role) || p.leftOut.some((l) => l.role === role);
      expect({ role, accountedFor: seen }).toEqual({ role, accountedFor: true });
    }
    // Everything the budget then reaches for is still inside the matched shelf.
    // The target may make the routine fuller; it may not make it less suitable.
    expect(p.picks.every((x) => matched.has(x.product.id))).toBe(true);
  });
});

describe('the plan the browser receives', () => {
  /**
   * A TYPE ON ONE SIDE OF A WIRE IS A CLAIM, NOT A FACT.
   *
   * `RoutinePick` in the React app declared `{ productId, monthlyInr,
   * monthsOfUse }`. The server sent `{ product: {...}, monthlyInr,
   * monthsOfUse }`. Both files compiled, both were confident, and they had
   * never agreed — the page happened to read only `skipped`, so the
   * disagreement cost nothing until the routine tried to join a pick to a step
   * and joined on `undefined`.
   *
   * This is the same failure as the budget-key collision one layer up, and it
   * has the same fix: assert the shape at the boundary rather than trusting the
   * annotation on either end.
   */
  const wire = planForWire(plan(5000));
  const every = [...wire.face.picks, ...wire.hair.picks, ...wire.body.picks];

  it('sends an id the routine steps can be joined on', () => {
    expect(every.length).toBeGreaterThan(0);
    expect(every.every((p) => typeof p.productId === 'string' && p.productId.length > 0)).toBe(true);
  });

  it('does not send the whole product back inside the plan', () => {
    // Every chosen product is already in a routine band. Sending it twice is
    // weight, and — worse — a second copy that can disagree with the first.
    expect(every.some((p) => 'product' in p)).toBe(false);
  });

  it('carries the pack size and the how-long phrase, so the page invents neither', () => {
    const sized = every.filter((p) => p.packLabel !== '');
    expect(sized.length).toBeGreaterThan(0);
    expect(sized.every((p) => /^[\d.]+\s?(ml|g|gm|kg|l)$/.test(p.packLabel))).toBe(true);
    expect(every.every((p) => /^about \d/.test(p.lastsLabel))).toBe(true);
  });

  it('keeps the same money as the plan it was built from', () => {
    const p = plan(5000);
    expect(wire.totalMonthlyInr).toBe(p.totalMonthlyInr);
    expect(wire.face.remainingInr).toBe(p.face.remainingInr);
    expect(wire.face.picks.map((x) => x.productId)).toEqual(p.face.picks.map((x) => x.product.id));
  });

  it('leaves a zero category as zero, all the way out', () => {
    const none = planForWire(planWithinBudget(SHELF, { face: 5000, hair: 5000, body: 0 }, NEEDS));
    expect(none.body.skipped).toBe(true);
    expect(none.body.picks).toEqual([]);
    expect(none.body.upgrades).toEqual([]);
  });
});
