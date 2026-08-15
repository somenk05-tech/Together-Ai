import { recommendProducts } from './beauty-engine';
import { planCategory, usefulMaxInr, TARGET_LOW, TARGET_CEILING } from './budget-routine';
import { assessBeauty } from './beauty-analysis';
import { BEAUTY_PRODUCTS } from './beauty-catalog';
import { buildRoutines } from './routine-engine';

/**
 * ── TWO RULES THAT ARRIVED TOGETHER, AND WHICH ONE WINS ─────────────────────
 *
 * USE THE BUDGET. The owner's acceptance criterion: a ₹5,000 routine lands in
 * ₹4,750–₹5,250, and "nothing else is worth the money" is not an answer a
 * citizen can check. On 16 Aug the owner ranked this rule FIRST — above
 * holding the highest-scoring bottle — reversing the 15-Aug reconciliation
 * that stopped at the non-inferior shelf and explained the difference. Pass
 * 5d now spends toward B × 0.95 even where what remains claims fewer of the
 * stated concerns; the measured cost (a face routine's total match score
 * falling as the budget rises) is taken with eyes open, at the owner's word.
 *
 * WHAT THE BAND STILL CANNOT BUY, because utilisation never outranked safety
 * or relevance: anything unmatched, anything answering none of this person's
 * needs, a second active the routine already carries, a product past the
 * share cap, a rupee past B × 1.05 — and no swap may un-cover a need the
 * routine answers (`keepsCoverage`). Fit is spent; coverage and safety never.
 */

const PROFILES = {
  oily: assessBeauty({ skinType: 'oily', skinConcerns: ['Acne', 'Dark Spots'], skinGoals: ['Oil Control'], age: 26 }),
  sensitive: assessBeauty({ skinType: 'sensitive', skinConcerns: ['Rosacea', 'Dryness'], age: 30 }),
};
const shelf = (a: typeof PROFILES.oily, skinType: string) => {
  const readings = [...a.skin.readings, ...a.hair.readings];
  return {
    products: recommendProducts({ readings, concerns: [], profile: { skinType }, insights: [] }),
    needs: new Set(readings.filter((r) => r.level !== 'good').map((r) => r.key)),
  };
};
const oily = shelf(PROFILES.oily, 'oily');
const sensitive = shelf(PROFILES.sensitive, 'sensitive');
const answers = (needs: Set<string>) => (p: { profileKeys: string[] }) => p.profileKeys.filter((k) => needs.has(k)).length;

describe('the band', () => {
  it('is ±5%, and it is the ceiling as well as the floor', () => {
    expect([TARGET_LOW, TARGET_CEILING]).toEqual([0.95, 1.05]);
  });

  it('lands inside the band wherever the shelf allows it', () => {
    // Not "always" — six roles and finite price points cannot hit every number,
    // and a plan that could would be buying something to make the arithmetic
    // work. Asserted as a rate, with the misses named rather than smoothed.
    const missed: string[] = [];
    let inBand = 0, tried = 0;
    const max = usefulMaxInr(oily.products, 'face', oily.needs);
    for (const budget of [1000, 1500, 2000, 2500, 3000, 4000]) {
      if (budget > max) continue;
      tried++;
      const c = planCategory(oily.products, 'face', budget, oily.needs);
      const pct = c.spendInr / budget;
      if (pct >= TARGET_LOW && pct <= TARGET_CEILING) inBand++;
      else missed.push(`₹${budget} → ₹${c.spendInr} (${Math.round(pct * 100)}%)`);
    }
    expect({ tried, inBand, missed }).toEqual(expect.objectContaining({ tried }));
    expect(inBand / tried).toBeGreaterThanOrEqual(0.7);
  });

  it('reaches the band past the non-inferior shelf, without ever padding', () => {
    /**
     * THE 15-AUG RULE STOPPED at the dearest non-inferior routine and put the
     * rest in a sentence; the 16-AUG RULE SPENDS IT — utilisation first, at
     * the owner's word. What survives the reversal, and what this catches if
     * it slips: every product bought on the way up still answers at least one
     * of this person's needs. The band never parks money in an anti-ageing
     * serum for a profile that never mentioned ageing.
     */
    const a = answers(oily.needs);
    const full = planCategory(oily.products, 'face', 8000, oily.needs);
    expect(full.spendInr / 8000).toBeGreaterThanOrEqual(TARGET_LOW);
    expect(full.spendInr / 8000).toBeLessThanOrEqual(TARGET_CEILING);
    for (const pick of full.picks) {
      expect({ role: pick.role, addressesHer: a(pick.product) > 0 })
        .toEqual({ role: pick.role, addressesHer: true });
    }
  });

  it('reports a ceiling that is the band itself, and no longer apologises', () => {
    // usefulMaxInr is the plan at the dial's own maximum, so the ceiling the
    // wire reports is a number the planner actually reaches — and with the
    // band pass in, that number sits at or above 95% of the range. A routine
    // inside the band has nothing to explain, so leanReason is null; the
    // sentence is reserved for the guarded shelf genuinely running dry.
    const max = usefulMaxInr(oily.products, 'face', oily.needs);
    const over = planCategory(oily.products, 'face', 8000, oily.needs);
    expect(over.usefulMaxInr).toBe(max);
    expect(max).toBeGreaterThanOrEqual(Math.round(8000 * TARGET_LOW));
    expect(over.leanReason).toBeNull();
  });

  it('is denominated in what the citizen actually hands over', () => {
    // Purchase price, not amortised monthly cost. The monthly figure is still
    // computed and still printed — it just decides nothing.
    const c = planCategory(oily.products, 'face', 3000, oily.needs);
    expect(c.spendInr).toBe(c.picks.reduce((n, x) => n + x.product.priceInr, 0));
    expect(c.monthlyInr).toBe(c.picks.reduce((n, x) => n + x.monthlyInr, 0));
    expect(c.spendInr).not.toBe(c.monthlyInr);
  });
});

describe('"all skin types" is not a claim about sensitive skin', () => {
  it('reaches a sensitive citizen only where the sheet names her', () => {
    /**
     * 76 of 132 face products declared `all`, and a sensitive citizen reached
     * 91 of them while only fifteen named her — seven of the 91 carried a
     * retinoid. `all` is a claim about the oily-to-dry scale; reactivity is a
     * different axis and a formula that has not mentioned it has not claimed it.
     */
    const reachable = BEAUTY_PRODUCTS.filter((p) => p.group === 'Skincare'
      && sensitive.products.some((s) => s.id === p.id && s.matched));
    for (const p of reachable) expect({ id: p.id, names: p.suitableSkin.includes('sensitive') }).toEqual({ id: p.id, names: true });
  });

  it('still leaves her a routine she can actually build', () => {
    // A gate that empties the shelf is not a safety feature.
    const plan = planCategory(sensitive.products, 'face', 3000, sensitive.needs);
    expect(plan.picks.map((x) => x.role)).toEqual(expect.arrayContaining(['Cleanse', 'Moisturise', 'Protect']));
  });

  it('does not take `all` away from everybody else', () => {
    const forOily = recommendProducts({
      readings: [...PROFILES.oily.skin.readings], concerns: [], profile: { skinType: 'oily' }, insights: [],
    }).filter((p) => p.matched && p.suitableSkin.includes('all'));
    expect(forOily.length).toBeGreaterThan(10);
  });
});

describe('a step is told to go where the product works', () => {
  it('does not tell a scalp treatment to avoid the scalp', () => {
    /**
     * Found by reading the live routine page. "Hair Serum/Leave-in" is one
     * column on the sheet and two different objects — a finishing oil for the
     * ends, and a Redensyl scalp serum for the roots. Both were classified
     * 'Finish' and both were printed with "do not go near the roots", which for
     * the second is the opposite of how it is used.
     */
    const scalp = BEAUTY_PRODUCTS.filter((p) => p.category === 'Hair serum'
      && /redensyl|anagain|hair growth|vitalizer/i.test(`${p.name} ${p.actives.join(' ')}`));
    expect(scalp.length).toBeGreaterThan(0);
    for (const p of scalp) {
      const step = buildRoutines([{
        ...p, matched: true, matchScore: 80, primaryReasons: [], biomarkerReasons: [],
        explanation: '', reasons: [],
      }]).flatMap((r) => r.steps).find((s) => s.productId === p.id);
      expect({ id: p.id, step: step?.step }).toEqual({ id: p.id, step: 'Scalp' });
      expect(step?.instructions).not.toMatch(/not go near the roots/i);
      expect(step?.instructions).toMatch(/scalp/i);
    }
  });

  it('still sends a finishing serum to the ends', () => {
    const finish = BEAUTY_PRODUCTS.find((p) => p.category === 'Hair serum'
      && !/redensyl|anagain|hair growth|vitalizer/i.test(`${p.name} ${p.actives.join(' ')}`))!;
    const step = buildRoutines([{
      ...finish, matched: true, matchScore: 80, primaryReasons: [], biomarkerReasons: [],
      explanation: '', reasons: [],
    }]).flatMap((r) => r.steps)[0];
    expect(step.step).toBe('Finish');
  });

  it('gives every display category a step of its own kind', () => {
    // The hand cream matched `/moisturiser|cream/` three lines above its own
    // rule and came out as MOISTURISE at rank 50 — above the body wash, with
    // "seal everything underneath" for an instruction, and printing MOISTURISE
    // twice in one band. classify() reads the CATEGORY, and of the sixteen the
    // sheet produces exactly two contain "cream".
    const of = (category: string) => {
      const p = BEAUTY_PRODUCTS.find((x) => x.category === category)!;
      return buildRoutines([{
        ...p, matched: true, matchScore: 80, primaryReasons: [], biomarkerReasons: [],
        explanation: '', reasons: [],
      }]).flatMap((r) => r.steps)[0];
    };
    expect(of('Hand cream').step).toBe('Hands');
    expect(of('Body lotion').step).toBe('Moisturise');
    expect(of('Moisturiser').step).toBe('Moisturise');
    expect(of('Lip balm').step).toBe('Lips');
    // And the body band runs in the order a body is actually washed.
    const body = BEAUTY_PRODUCTS.filter((p) => ['Body wash', 'Body scrub', 'Body lotion', 'Hand cream', 'Lip balm']
      .includes(p.category)).filter((p, i, a) => a.findIndex((q) => q.category === p.category) === i);
    const band = buildRoutines(body.map((p) => ({
      ...p, matched: true, matchScore: 80, primaryReasons: [], biomarkerReasons: [], explanation: '', reasons: [],
    }))).find((r) => r.timeOfDay === 'body')!;
    expect(band.steps.map((s) => s.step)).toEqual(['Wash', 'Exfoliate', 'Moisturise', 'Hands', 'Lips']);
  });
});

describe('coverage belongs to the routine, not to a product', () => {
  const profile = assessBeauty({
    skinType: 'oily', skinConcerns: ['Blackheads', 'Dark Spots', 'Hyperpigmentation', 'Oily Skin'], age: 30,
  });
  const readings = [...profile.skin.readings, ...profile.hair.readings];
  const needs = new Set(readings.filter((r) => r.level !== 'good').map((r) => r.key));
  const shelf = recommendProducts({ readings, concerns: [], profile: { skinType: 'oily' }, insights: [] });

  it('never drops a need on the way up', () => {
    /**
     * THE RULE THIS REPLACED asked whether the CANDIDATE answered as many
     * findings as the product it displaced, which made a specialist unable to
     * displace a generalist however good it was. On the live shelf a ₹595
     * sunscreen claiming [acne, oil, pigmentation] answered three, so nothing
     * dearer could ever take that step — and the routine came out at ₹4,245 of
     * ₹8,000 covering oil five times over.
     *
     * Coverage is a property of the ROUTINE. The question is whether every
     * need is still covered afterwards, not whether one bottle claims them all.
     */
    for (const budget of [1000, 2000, 3000, 5000, 8000]) {
      const c = planCategory(shelf, 'face', budget, needs);
      const covered = new Set(c.picks.flatMap((x) => x.product.profileKeys).filter((k) => needs.has(k)));
      expect({ budget, covered: covered.size }).toEqual({ budget, covered: needs.size });
    }
  });

  it('pays for the band in score, never in coverage or relevance', () => {
    // THE ROUTINE'S TOTAL MATCH SCORE MAY NOW FALL AS THE BUDGET RISES — that
    // is the measured price of band-first, taken knowingly on 16 Aug, and the
    // assertion that used to forbid it is gone on purpose. What may still
    // never happen, at any budget: a need going uncovered, or a product
    // entering that answers nothing this person raised.
    for (const p of [{ skinType: 'oily', skinConcerns: ['Acne', 'Dark Spots'] },
      { skinType: 'dry', skinConcerns: ['Dryness', 'Fine Lines'] }] as const) {
      const a = assessBeauty(p as never);
      const rd = [...a.skin.readings, ...a.hair.readings];
      const n = new Set(rd.filter((r) => r.level !== 'good').map((r) => r.key));
      const s = recommendProducts({ readings: rd, concerns: [], profile: { skinType: p.skinType }, insights: [] });
      let prevCovered = -1;
      for (const budget of [1000, 2000, 3000, 5000, 8000]) {
        const c = planCategory(s, 'face', budget, n);
        const covered = new Set(c.picks.flatMap((x) => x.product.profileKeys).filter((k) => n.has(k))).size;
        expect({ skin: p.skinType, budget, coverageHeld: covered >= prevCovered })
          .toEqual({ skin: p.skinType, budget, coverageHeld: true });
        prevCovered = covered;
        for (const pick of c.picks) {
          expect({ skin: p.skinType, budget, role: pick.role, relevant: pick.product.profileKeys.some((k) => n.has(k)) })
            .toEqual({ skin: p.skinType, budget, role: pick.role, relevant: true });
        }
      }
    }
  });

  it('reports a ceiling the planner can actually reach', () => {
    // usefulMaxInr was a per-role sum computed by a rule the band pass no
    // longer uses, so the card said "this shelf tops out at ₹7,144" over a
    // routine the planner stopped building at ₹4,444.
    const c = planCategory(shelf, 'face', 8000, needs);
    expect(c.usefulMaxInr).toBeGreaterThanOrEqual(c.spendInr);
    const atCeiling = planCategory(shelf, 'face', 60000, needs);
    expect(c.usefulMaxInr).toBe(atCeiling.spendInr);
  });
});
