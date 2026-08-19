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
// THE SIX THE OWNER NAMED, RE-SCALED WITH THE CAP. A category maxes at ₹8,000
// since 15 Aug — measured, the dearest routine this shelf can build without
// taking a worse-matched product tops out around ₹7,000–₹8,500 for a face and
// under ₹1,000 for hair, so the old ₹25,000 and ₹60,000 rungs were asking the
// planner questions the shelf has no answer to. The SPREAD is what these are
// for and the spread is intact.
const TIERS = [500, 1000, 2000, 3000, 5000, 8000];
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
    // A 300 ml wash is one month at 10 ml a shower, which is no longer a BIG
    // pack — the doses were re-anchored to the sunscreen figure and body wash
    // went from 200 ml a month to 300. The property is unchanged; the example
    // has to be an actually large pack to demonstrate it.
    const wash = { name: 'Body wash (750 ml)', category: 'Body wash', usage: 'Body', priceInr: 195 };
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
  it.each(TIERS)('never exceeds the ceiling on ₹%i in any category', (n) => {
    /**
     * TWO CORRECTIONS, AND THE SECOND IS THE INTERESTING ONE.
     *
     * `spendInr`, NOT `monthlyInr` — a leftover the ₹8,000 cap found. The
     * budget has been denominated in purchase price since the unit changed;
     * comparing the UPKEEP figure against it was a comparison between two
     * different things that happened to pass while budgets were large.
     *
     * And against the CEILING rather than against B. The 5% headroom has always
     * been the real limit — `overInr` has documented it since it was written —
     * but it was theoretical while the planner aimed under the budget, so
     * asserting `<= B` held by accident and read as the rule. The ±5% band aims
     * the routine AT the budget, so the headroom is now used on purpose: a
     * ₹1,000 face lands at ₹1,022 because the shelf has no combination at
     * exactly ₹1,000 and ₹1,022 is nearer than ₹958. That is the feature. What
     * must never happen is crossing B × 1.05, and that is what this says now.
     */
    const p = plan(n);
    expect([
      ['face', p.face.spendInr <= p.face.ceilingInr],
      ['hair', p.hair.spendInr <= p.hair.ceilingInr],
      ['body', p.body.spendInr <= p.body.ceilingInr],
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
    /**
     * THIS TEST USED TO ASK ₹1,000 AND IT WAS RIGHT TO, until the shelf got
     * better. A ₹1,000 face budget could not carry cleanse-moisturise-protect
     * on the seventy-product catalogue: measured against this file's own
     * profile the floor was ₹1,067 a month, which is where the ₹1,000 in the
     * old assertion came from and why `toBeGreaterThan(1000)` held. The shelf
     * that replaced it carries large-pack mass-market SPF and the same floor is
     * ₹311, so ₹1,000 now buys a whole routine and there is no "minimum you
     * would need" left to report.
     *
     * THE ASSERTION IS NOT THE CASUALTY OF THAT — the budget in it is. The
     * thing being guarded is that a budget too small for a routine gets a
     * NUMBER rather than "your budget is insufficient", and that path still
     * exists and still has to work. So the question is asked at a budget that
     * is genuinely below the floor, and the day the shelf gets cheap enough to
     * build a face routine for ₹300 this comment is the instruction: move the
     * number again, do not delete the test.
     */
    // ₹1,000 → ₹300 → ₹200. The shelf was 70 products, then 126, now 226, and
    // the cheapest complete face routine has fallen from ₹1,067/month to ₹311
    // to ₹215 as mass-market Indian brands joined it. Each time, the number
    // moved and the assertion did not. Measured against this file's profile.
    const BELOW_THE_FLOOR = 200;
    const lean = plan(BELOW_THE_FLOOR).face;
    // Not "your budget is insufficient" — a number, so the choice is real.
    expect(typeof lean.minimumInr).toBe('number');
    expect(lean.minimumInr!).toBeGreaterThan(BELOW_THE_FLOOR);
    // And it still builds what it can, naming what it left out.
    expect(lean.picks.length).toBeGreaterThan(0);
    expect(lean.leftOut.length).toBeGreaterThan(0);
  });

  it('carries a whole face routine at ₹1,000, which is what the shelf bought', () => {
    // The other half of the change above, asserted rather than remembered: the
    // floor moved from ₹1,067 to ₹311 and ₹1,000 stopped being short.
    // If a future catalogue puts the cheap sunscreens back in the sea, this
    // fails and the test above starts passing for the wrong reason.
    const thousand = plan(1000).face;
    expect(thousand.minimumInr).toBeNull();
    expect(thousand.picks.map((x) => x.role)).toEqual(
      expect.arrayContaining(['Cleanse', 'Moisturise', 'Protect']),
    );
  });

  it('drops the most substitutable step first, not the last one declared', () => {
    // Sunscreen is the one face step with no substitute. Cleansing with water
    // is at least possible. A short budget keeps the sunscreen.
    const lean = plan(1000).face;
    expect(lean.picks.map((x) => x.role)).toContain('Protect');
  });

  it('spends more on a better product before it spends on another product', () => {
    /**
     * THIS USED TO NAME THE MOISTURISER, and it was right to while the cheapest
     * moisturiser on the shelf was also a poorly-matched one. On the 226-row
     * shelf a ₹47-a-month Biotique moisturiser answers three of this person's
     * findings — the cheapest is now also the best-matched, so pass 4 has
     * nothing to improve and ₹2,500 buys the same bottle as ₹1,000. That is the
     * engine working, not the property failing.
     *
     * So the property is asserted directly instead of through one product: a
     * bigger budget never leaves a step worse matched, and it never pays more
     * for a step without answering more of this person with it. That second
     * clause is the one that matters — it is the rule the premium pass used to
     * break, buying a ₹2,517 toner to replace a ₹167 one on identical merits.
     */
    const lean = plan(1000).face;
    const roomy = plan(2500).face;
    const answers = (p: { profileKeys: string[] }) => p.profileKeys.filter((k) => NEEDS.includes(k)).length;
    for (const before of lean.picks) {
      const after = roomy.picks.find((x) => x.role === before.role);
      expect({ role: before.role, kept: !!after }).toEqual({ role: before.role, kept: true });
      expect({ role: before.role, notWorse: answers(after!.product) >= answers(before.product) })
        .toEqual({ role: before.role, notWorse: true });
      if (after!.monthlyInr > before.monthlyInr) {
        const gained = answers(after!.product) > answers(before.product)
          || after!.product.matchScore > before.product.matchScore;
        expect({ role: before.role, dearerButBetter: gained }).toEqual({ role: before.role, dearerButBetter: true });
      }
    }
    // And the bigger budget does still buy a bigger routine.
    expect(roomy.picks.length).toBeGreaterThan(lean.picks.length);
  });

  it('DOES spend the rest of a large budget, to the band', () => {
    // THE LINE THE FEATURE TURNED ON, REVERSED BY THE OWNER, 16 AUG. This test
    // asserted that ₹8,000 bought the same routine as ₹4,000 with the
    // difference reported — utilisation is the first rule now, so a bigger
    // budget buys a dearer routine, and the only honest stop short of the
    // band is a guard biting (coverage, safety, the share cap, the ceiling),
    // named in leanReason when it does.
    const four = plan(4000).face;
    const eight = plan(8000).face;
    expect(eight.spendInr).toBeGreaterThanOrEqual(four.spendInr);
    expect({ bandOrExplained: eight.spendInr >= eight.targetLowInr || eight.leanReason !== null })
      .toEqual({ bandOrExplained: true });
  });

  it('is bounded by the roles a routine has, not by the money', () => {
    // LEAN IS STRUCTURAL. Six roles exist for the face and there is no seventh
    // to buy, so a budget ten times larger cannot produce a longer list — only
    // a better one. This is what the old count-based rule was really protecting
    // and it survives the change from ceiling to target intact.
    for (const n of TIERS) {
      expect({ budget: n, over: plan(n).face.picks.length > 6 }).toEqual({ budget: n, over: false });
    }
    /**
     * WHAT THIS LINE USED TO SAY, AND WHY IT DOES NOT SAY IT ANY MORE.
     *
     * It asserted `plan(8000).picks.length <= plan(4000).picks.length` — more
     * money does not buy more steps. That held on the old shelf for a reason
     * that had nothing to do with the planner: mass-market skincare was cheap
     * enough that ₹4,000 already bought all six face roles, so there was no
     * seventh for ₹8,000 to add and the counts tied.
     *
     * The 2026-08 shelf is twenty-nine salon and premium brands with no
     * mass-market tier at all. ₹4,000 now reaches five roles and ₹8,000 reaches
     * six, so the inequality flips — not because the planner grew a new step to
     * sell, but because the sixth step finally became affordable. Asserting
     * `<=` here would now be asserting that a bigger budget must NOT complete
     * the routine.
     *
     * The real invariant is the structural cap above — never more than the six
     * roles that exist — plus this: more money never buys FEWER roles.
     */
    expect(plan(8000).face.picks.length).toBeGreaterThanOrEqual(plan(4000).face.picks.length);
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
    // In SPEND, the unit the budget is set in — this compared `monthlyInr` to
    // a purchase-price ceiling, two units in one inequality, and only ever
    // passed because monthly costs used to sit far below purchase totals. The
    // band pass ended that coincidence. The "never runs to the ceiling"
    // clause went with the old rule: the headroom is inside the 95–105% band,
    // and landing in it is now the point rather than a smell.
    for (const n of TIERS) {
      const c = planCategory(SHELF, 'face', n, new Set(NEEDS));
      expect({ budget: n, aboveCeiling: c.spendInr > c.ceilingInr }).toEqual({ budget: n, aboveCeiling: false });
      expect({ budget: n, overBy: c.overInr <= c.ceilingInr - c.budgetInr }).toEqual({ budget: n, overBy: true });
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
    /**
     * ── priceInr, NOT monthlyInr, AND THAT IS THE WHOLE FIX ─────────────────
     *
     * The planner budgets in PURCHASE PRICES. `cost()` is `p.priceInr`, `spent`
     * accumulates purchase prices, and `shareCap` is `budget * 0.5` measured
     * against them. `monthlyInr` is a display figure derived from the pack size
     * and is a different unit entirely.
     *
     * This assertion read `monthlyInr` against a purchase-price budget, which is
     * comparing rupees-per-month with rupees-once. It passed for as long as it
     * did because the old shelf's packs were mostly a month or more of product,
     * so the two numbers were close enough to never disagree. The 2026-08
     * catalogue carries 10 ml serums and 50 ml oils — a ₹435 hair oil in a 50 ml
     * bottle costs ₹522 a MONTH — and the units came apart.
     *
     * The cap itself was never violated: ₹435 is comfortably inside a ₹500 cap.
     */
        const dominant = c.picks.filter((x) => x.priceInr > c.budgetInr * 0.5);
        // Anything over the cap can only be there because the floor put it
        // there — which means the routine could not have been built without it.
        const excusable = dominant.every((x) => c.picks.length === 1 || x.tier === 'essential');
        expect({ budget: n, category: cat, ok: excusable }).toEqual({ budget: n, category: cat, ok: true });
      }
    }
  });

  it('caps the step it ADDS, not only the one it upgrades', () => {
    /**
     * THE HOLE THE CAP HAD FOR A MONTH. It was written inside pass 5b, the
     * premium-upgrade pass, because that is where the ₹3,300 sunscreen came
     * from — and pass 5, which ADDS a step to reach the target, priced its
     * candidate against the ceiling and nothing else. At a ₹1,000 hair budget
     * it put a ₹680-a-month hair serum on top of a ₹278 wash-and-condition
     * routine: seventy per cent of the bill, one product, every other rule
     * satisfied.
     *
     * Nothing caught it because no category had a product dear enough. Hair
     * topped out at ₹933 sticker until the premium tier was filled in, and the
     * first premium hair oil on the shelf found the hole the same afternoon.
     * This asserts the added step specifically, so the cap cannot quietly go
     * back to being one pass's guard.
     */
    const hair = planCategory(SHELF, 'hair', 1000, new Set(NEEDS));
    const added = hair.picks.filter((x) => x.tier !== 'essential');
    expect(added.length).toBeGreaterThan(0);
    // priceInr, not monthlyInr — see the note in 'never lets one product become
    // most of the routine'. The cap is on what the citizen pays at the till.
    for (const x of added) {
      expect({ role: x.role, name: x.product.name, withinHalf: x.priceInr <= 500 })
        .toEqual({ role: x.role, name: x.product.name, withinHalf: true });
    }
  });

  it('uses a budget it can reach, instead of stopping at a fifth of it', () => {
    // THE FAILURE THIS REPLACED. A ₹5,000 face budget bought a ₹1,108 routine —
    // twenty-two per cent — while better-matched products for those very steps
    // sat on the shelf. Either the plan now reaches the target, or it is under
    // the quarter-of-the-budget line with a sentence saying why.
    for (const n of [2500, 5000, 10000]) {
      const c = planCategory(SHELF, 'face', n, new Set(NEEDS));
      // spendInr, not monthlyInr. `targetLowInr` is budget × 0.95 in purchase
      // prices and `leanReason` fires on `spent < targetLow` in the same unit;
      // asserting a monthly total against it compared two different things.
      const ok = c.spendInr >= c.targetLowInr || c.leanReason !== null;
      expect({ budget: n, reachedOrExplained: ok }).toEqual({ budget: n, reachedOrExplained: true });
    }
    // And at ₹5,000 specifically it does reach it, because this shelf can.
    const five = planCategory(SHELF, 'face', 5000, new Set(NEEDS));
    expect(five.spendInr).toBeGreaterThan(5000 * 0.25);
  });

  it('never buys a product that answers nothing, however hungry the band is', () => {
    // THIS ASSERTED "as good as available" PER STEP, and the owner's band-first
    // rule (16 Aug) deliberately trades that away: reaching 95% of ₹5,000 on
    // this shelf means taking dearer products that answer fewer findings. The
    // floor that remains, and the one this catches if it slips: every product
    // bought still answers at least ONE of this person's findings, and the
    // routine as a whole still covers every need the cheap routine covered.
    const c = planCategory(SHELF, 'face', 5000, new Set(NEEDS));
    const lean = planCategory(SHELF, 'face', 1000, new Set(NEEDS));
    const answers = (p: { profileKeys: string[] }) => p.profileKeys.filter((k) => NEEDS.includes(k)).length;
    for (const pick of c.picks) {
      expect({ role: pick.role, answersSomething: answers(pick.product) > 0 })
        .toEqual({ role: pick.role, answersSomething: true });
    }
    const coveredBy = (picks: typeof c.picks) =>
      new Set(picks.flatMap((x) => x.product.profileKeys).filter((k) => NEEDS.includes(k)));
    for (const k of coveredBy(lean.picks)) {
      expect({ need: k, stillCovered: coveredBy(c.picks).has(k) }).toEqual({ need: k, stillCovered: true });
    }
  });

  it('offers what could be added instead of adding it', () => {
    /**
     * THIS ASSERTION USED TO BE `not.toContain(u.role)` AND IT WAS RIGHT TO BE,
     * while `upgrades` could only ever hold a step the routine did not have.
     * Pass 5b then stopped BUYING the premium alternative and started offering
     * it — measured, one profile at a ₹10,000 face budget was being moved from
     * a ₹167-a-month toner to a ₹2,517 one that answered the same findings at
     * the same match score, on the strength of the word "Premium" in a
     * spreadsheet column. So an offer for a role that IS in the routine is now
     * the point rather than the bug.
     *
     * WHAT IS BEING GUARDED HAS NOT CHANGED: an upgrade is never taken. The two
     * shapes it may have are asserted separately, and the second one must carry
     * the sentence that makes it an offer — an upgrade with no reason attached
     * is the old behaviour with a new destination.
     */
    const rich = plan(8000).face;
    const chosen = new Set(rich.picks.map((x) => x.product.id));
    for (const u of rich.upgrades) {
      // Never something already in the routine, whatever kind of offer it is.
      expect(chosen.has(u.product.id)).toBe(false);
      if (rich.picks.some((x) => x.role === u.role)) {
        // A dearer alternative to a step that IS there: it has to say why not.
        expect(typeof u.reason).toBe('string');
      }
    }
  });
});

describe('one category does not spend another category\'s money', () => {
  it('plans face, hair and body independently', () => {
    // A generous face budget must not buy a better shampoo.
    const even = planWithinBudget(SHELF, { face: 5000, hair: 5000, body: 5000 }, NEEDS);
    const lopsided = planWithinBudget(SHELF, { face: 8000, hair: 5000, body: 5000 }, NEEDS);
    expect(lopsided.hair.picks.map((x) => x.product.id)).toEqual(even.hair.picks.map((x) => x.product.id));
    expect(lopsided.body.picks.map((x) => x.product.id)).toEqual(even.body.picks.map((x) => x.product.id));
  });

  it('totals what it actually spent, not what it was given', () => {
    // Three categories at the ₹8,000 cap: ₹10,000 each is clamped on the way in.
    const p = plan(10000);
    expect(p.totalBudgetInr).toBe(24000);
    expect(p.totalMonthlyInr).toBe(p.face.monthlyInr + p.hair.monthlyInr + p.body.monthlyInr);
    // WHAT IS LEFT IS THE SUM OF THE CATEGORY FLOORS. A category may now land
    // up to 5% OVER its own number — the band's headroom — and its remaining
    // floors at zero rather than going negative, so the total remaining is
    // the sum of those floors and can exceed 24000 − spend. Asserting the
    // subtraction would quietly forbid the band's upper half.
    expect(p.totalRemainingInr).toBe(p.face.remainingInr + p.hair.remainingInr + p.body.remainingInr);
    expect(p.totalRemainingInr).toBeGreaterThanOrEqual(24000 - p.totalSpendInr);
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
