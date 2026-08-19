import { recommendProducts, severityOf } from './beauty-engine';
import { planCategory } from './budget-routine';
import { monthlyCostInr } from './monthly-cost';
import { assessBeauty } from './beauty-analysis';
import { activeFamiliesOf, irritantLoad } from './active-families';

/**
 * PRICE IS A CONSTRAINT AND A TIEBREAKER. IT IS NEVER A QUALITY SIGNAL.
 *
 * The forensic audit of 15 Aug ran the shipped planner at seven budgets against
 * one oily/acne profile and found the same routine costing ₹888 a month at a
 * ₹1,000 budget and ₹4,803 at a ₹10,000 one — with every measure of benefit the
 * engine possessed identical at both. Same findings answered, same match score,
 * three-and-a-half thousand rupees a month apart. The upgrade was bought on
 * `tier`, a price band copied off a spreadsheet, because `matchScore` had two
 * realised values across a matched shelf and could not break a single tie.
 *
 * This file guards the two halves of that repair: the score has to
 * discriminate, and money is not allowed to decide what suitability could not.
 */

const OILY_ACNE = assessBeauty({ skinType: 'oily', skinConcerns: ['Acne'], skinGoals: ['Oil Control'], age: 26 });
const READINGS = [...OILY_ACNE.skin.readings, ...OILY_ACNE.hair.readings];
const NEEDS = new Set(READINGS.filter((r) => r.level !== 'good').map((r) => r.key));
const SHELF = recommendProducts({ readings: READINGS, concerns: [], profile: { skinType: 'oily' }, insights: [] });
const face = (n: number) => planCategory(SHELF, 'face', n, NEEDS);
const answers = (p: { profileKeys: string[] }) => p.profileKeys.filter((k) => NEEDS.has(k)).length;

describe('the score can actually tell two products apart', () => {
  it('does not collapse a matched shelf onto two values', () => {
    // THE MEASUREMENT THAT STARTED ALL OF THIS. Two distinct scores across
    // twenty-seven matched products meant every downstream comparison claiming
    // to rank "on effectiveness" was really ranking on price. Six is not a
    // magic number; it is comfortably more than a formula that saturates can
    // produce, and comfortably fewer than the shelf could support.
    const matched = SHELF.filter((p) => p.matched);
    const distinct = new Set(matched.map((p) => p.matchScore));
    expect(matched.length).toBeGreaterThan(10);
    expect(distinct.size).toBeGreaterThanOrEqual(6);
  });

  it('separates a finding somebody has three signals of from one they ticked once', () => {
    const once = assessBeauty({ skinType: 'normal', skinConcerns: ['Acne'] });
    const thrice = assessBeauty({ skinType: 'normal', skinConcerns: ['Acne', 'Whiteheads'], medicalConditions: ['PCOS'] });
    const acne = (a: typeof once) => a.skin.readings.find((r) => r.key === 'acne')!;
    expect(acne(thrice).intensity).toBeGreaterThan(acne(once).intensity);
    expect(severityOf(acne(thrice))).toBeGreaterThan(severityOf(acne(once)));
  });

  it('reads an assessment saved before `intensity` existed exactly as its level', () => {
    // No migration, no backfill. Absent is "whatever the level implies", never
    // zero — an old 'attention' row means we knew it was attention.
    const old = { key: 'acne', label: 'Acne', level: 'attention' };
    const fresh = { ...old, intensity: 2 };
    expect(severityOf(old)).toBe(severityOf(fresh));
  });
});

describe('a price grade never buys a swap', () => {
  it('does not spend three times as much for the same answer', () => {
    // ₹888 → ₹4,803 with Σ answers and Σ matchScore both unmoved is the exact
    // shape of the defect. A bigger budget may still buy a better-MATCHED
    // routine; it may not buy an identically-matched dearer one.
    const lean = face(1000);
    const rich = face(10000);
    const benefit = (c: ReturnType<typeof face>) => ({
      answered: c.picks.reduce((n, x) => n + answers(x.product), 0),
      score: c.picks.reduce((n, x) => n + x.product.matchScore, 0),
    });
    const a = benefit(lean);
    const b = benefit(rich);
    if (b.answered === a.answered && b.score === a.score) {
      expect(rich.monthlyInr).toBeLessThanOrEqual(Math.round(lean.monthlyInr * 1.25));
    } else {
      expect(b.answered + b.score).toBeGreaterThan(a.answered + a.score);
    }
  });

  it('lets a cheaper equal win only where the band does not need the money', () => {
    // The Paula's Choice case: ₹2,517/month for a step a ₹167 product answered
    // identically. UNDER BAND-FIRST (owner, 16 Aug) that purchase is exactly
    // what pass 5d makes once nothing better can absorb the money — so the
    // property is scoped to where it still holds: a plan that has NOT reached
    // its band floor has no utilisation excuse, and there a dearer pick over
    // an equally-suitable cheaper one is still the bug it always was.
    const offenders: string[] = [];
    for (const budget of [500, 1000, 2500, 5000, 8000]) {
      const c = face(budget);
      if (c.spendInr >= c.targetLowInr) continue; // the band bought this, on purpose
      for (const pick of c.picks) {
        const cheaper = SHELF.filter((p) => p.matched
          && p.category === pick.product.category
          && p.id !== pick.product.id
          && answers(p) >= answers(pick.product)
          && p.matchScore >= pick.product.matchScore
          && monthlyCostInr(p) * 2 < pick.monthlyInr);
        if (cheaper.length) offenders.push(`₹${budget} ${pick.role}: ${pick.product.name} over ${cheaper[0].name}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('offers the premium alternative instead of taking it, and says why', () => {
    // Pass 5b's whole output. An offer with no sentence is the old behaviour
    // with a different destination, so the sentence is asserted, not the count.
    const c = face(20000);
    const roles = new Set(c.picks.map((x) => x.role));
    const premium = c.upgrades.filter((u) => roles.has(u.role));
    for (const u of premium) {
      expect(typeof u.reason).toBe('string');
      expect(u.reason!.length).toBeGreaterThan(20);
      // And it is genuinely an alternative to a step that is IN the routine,
      // not a second product for it.
      expect(c.picks.some((p) => p.product.id === u.product.id)).toBe(false);
    }
  });

  it('still spends more when the money buys a better-matched product', () => {
    // The repair must not turn into "always cheapest". Pass 4 is untouched and
    // this is the assertion that says so: a budget that can afford a product
    // answering MORE of this person's findings takes it.
    const lean = face(1000);
    const roomy = face(10000);
    const answered = (c: ReturnType<typeof face>) => c.picks.reduce((n, x) => n + answers(x.product), 0);
    expect(answered(roomy)).toBeGreaterThanOrEqual(answered(lean));
    expect(roomy.picks.length).toBeGreaterThanOrEqual(lean.picks.length);
  });
});

describe('no active twice, and not too many at once', () => {
  it('never puts the same active family in two products', () => {
    const clashes: string[] = [];
    for (const budget of [500, 1000, 2500, 5000, 8000]) {
      for (const cat of ['face', 'hair', 'body'] as const) {
        const c = planCategory(SHELF, cat, budget, NEEDS);
        const seen = new Map<string, string>();
        for (const pick of c.picks) {
          for (const f of activeFamiliesOf(pick.product)) {
            const prior = seen.get(f);
            if (prior) clashes.push(`₹${budget} ${cat}: ${f} in both ${prior} and ${pick.product.name}`);
            else seen.set(f, pick.product.name);
          }
        }
      }
    }
    expect(clashes).toEqual([]);
  });

  it('holds a routine to two barrier-taxing actives, and to one on reactive skin', () => {
    const calm = planCategory(SHELF, 'face', 10000, NEEDS);
    expect(irritantLoad(calm.picks.map((x) => x.product))).toBeLessThanOrEqual(2);

    // `redness` on the needs list is what "reactive" means here — a declared
    // sensitive skin type, rosacea or eczema on the medical list, redness in
    // the concerns, or the photograph. Its reading note has said "patch-test
    // new actives" since it was written and changed nothing until now.
    const reactive = assessBeauty({ skinType: 'sensitive', skinConcerns: ['Rosacea', 'Dryness'], age: 30 });
    const rr = [...reactive.skin.readings, ...reactive.hair.readings];
    const rNeeds = new Set(rr.filter((r) => r.level !== 'good').map((r) => r.key));
    expect(rNeeds.has('redness')).toBe(true);
    const shelf = recommendProducts({ readings: rr, concerns: [], profile: { skinType: 'sensitive' }, insights: [] });
    const plan = planCategory(shelf, 'face', 5000, rNeeds);
    expect(irritantLoad(plan.picks.map((x) => x.product))).toBeLessThanOrEqual(1);
  });

  it('fills every essential role even where the shelf offers nothing clear', () => {
    // The overlap rule may not take a cleanser away. If every one of them
    // carries an acid the moisturiser already has, the answer is still a
    // cleanser — the same argument that exempts the floor from the share cap.
    /**
     * ── THE FLOOR MOVED ₹1,000 → ₹1,400, AND THE MOVE IS THE FINDING ────────
     *
     * `BELOW_THE_FLOOR` in the sibling suite has moved twice before on the same
     * argument — the shelf changed, so the cheapest complete routine changed,
     * so the number changed and the test stayed. This is the third move and the
     * first one in the wrong direction.
     *
     * The 2026-08 catalogue REPLACED the shelf rather than adding to it, and it
     * has no mass-market tier: Minimalist, CeraVe, Cetaphil, The Ordinary, Plum
     * and Biotique all left with the old catalogue. The cheapest moisturiser
     * that matches an oily-combination profile went from ₹47 a month to ₹425,
     * so the three essentials no longer fit inside ₹1,000 and Cleanse — last in
     * clinical floor order, because washing with water is at least possible —
     * is what the floor drops.
     *
     * That is a real regression in what the shop can offer somebody on a small
     * budget, and it is recorded here rather than smoothed over. The planner is
     * behaving correctly: it fills essentials in clinical order and reports
     * what it could not carry. The shelf simply got more expensive.
     */
    for (const budget of [1400, 5000, 8000]) {
      const roles = face(budget).picks.map((x) => x.role);
      expect(roles).toEqual(expect.arrayContaining(['Cleanse', 'Moisturise', 'Protect']));
    }
  });
});
