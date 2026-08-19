import { recommendProducts } from './beauty-engine';
import { planCategory } from './budget-routine';
import { assessBeauty } from './beauty-analysis';
import { BEAUTY_PRODUCTS } from './beauty-catalog';
import { conditionsDeclared, findContraindication } from '../shared/topical-contraindications';

/**
 * THE ASSESSMENT'S PROMISES HAVE TO REACH THE PRODUCTS.
 *
 * A citizen who told us she was pregnant was shown, in one response:
 *
 *   caution   "Pregnant/breastfeeding: avoid retinoids, high-dose salicylic
 *              acid and hydroquinone — safer alternatives suggested above."
 *   PM step   "Bakuchiol serum"
 *   routine   Deconstruct Oil Control Serum 2% Salicylic + 1% RETINOL
 *
 * The prose knew. `recommendProducts` was called with `{ skinType, budget,
 * allergies }` and did not, so the swap happened in the advice and never in the
 * shelf. Two answers to one question, and the actionable one was wrong.
 *
 * This file is the boundary test. It does not care how the filter is written;
 * it cares that nothing the caution names can appear in a plan.
 */

const RETINOID = /retin(ol|al|aldehyde|yl|oid)|tretinoin|adapalene|tazarotene|hydroquinone/i;
/**
 * "RETINOL ALTERNATIVE" IS NOT A RETINOID, AND THIS TEST USED TO SAY IT WAS.
 *
 * Two Moroccanoil Night Body Serum sizes list "Retinol Alternative" among their
 * actives — a bakuchiol-class ingredient, named for what it replaces. The blunt
 * regex above matched the word 'Retinol' inside it and failed the shelf.
 *
 * The engine was right and this test was wrong: topical-contraindications.ts
 * has carried `except: ['retinol alternative', 'retinol free', ...]` since the
 * rule was written, with a comment saying that blocking the alternative would
 * be "the exact opposite of this rule" — because a retinol alternative is
 * precisely what the pregnancy caution RECOMMENDS in place of a retinoid.
 *
 * The exception is mirrored here rather than the regex loosened. Widening
 * RETINOID would blunt the guard; naming the phrase keeps it sharp and keeps
 * the two files agreeing about one fact.
 */
const NOT_A_RETINOID = /retinol[- ](alternative|free)|vitamin a rich|beta[- ]carotene/i;
const carriesRetinoid = (p: { name: string; actives: string[]; keyIngredient: string }) => {
  const hay = [p.name, p.keyIngredient, ...p.actives].join(' ');
  return RETINOID.test(hay.replace(NOT_A_RETINOID, ''));
};

const PREGNANT = assessBeauty({
  skinType: 'oily', skinConcerns: ['Acne', 'Fine Lines'], skinGoals: ['Anti Ageing'],
  age: 32, medicalConditions: ['Pregnant'],
});
const READINGS = [...PREGNANT.skin.readings, ...PREGNANT.hair.readings];
const NEEDS = new Set(READINGS.filter((r) => r.level !== 'good').map((r) => r.key));

describe('a declared condition reaches the shelf', () => {
  it('recognises how somebody actually says it', () => {
    for (const said of ['Pregnant', 'pregnancy', 'Breastfeeding', 'nursing', 'currently pregnant']) {
      expect(conditionsDeclared([said])).toEqual(['pregnancy']);
    }
    expect(conditionsDeclared(['PCOS', 'Thyroid'])).toEqual([]);
    expect(conditionsDeclared([])).toEqual([]);
  });

  it('takes every retinoid off a pregnant citizen\'s shelf', () => {
    const shelf = recommendProducts({
      readings: READINGS, concerns: [],
      profile: { skinType: 'oily', conditions: ['Pregnant'] }, insights: [],
    });
    expect(shelf.filter(carriesRetinoid)).toEqual([]);
    // And the shelf is genuinely shorter than the unfiltered one, so the test
    // cannot pass because the catalogue happens to have no retinoids in it.
    const open = recommendProducts({
      readings: READINGS, concerns: [], profile: { skinType: 'oily' }, insights: [],
    });
    expect(open.filter(carriesRetinoid).length).toBeGreaterThan(0);
    expect(shelf.length).toBeLessThan(open.length);
  });

  it('never puts one in a plan, at any budget', () => {
    const shelf = recommendProducts({
      readings: READINGS, concerns: [],
      profile: { skinType: 'oily', conditions: ['Pregnant'] }, insights: [],
    });
    const offenders: string[] = [];
    for (const budget of [500, 1000, 2500, 5000, 8000]) {
      for (const cat of ['face', 'hair', 'body'] as const) {
        const plan = planCategory(shelf, cat, budget, NEEDS);
        for (const x of [...plan.picks, ...plan.upgrades]) {
          if (carriesRetinoid(x.product)) offenders.push(`₹${budget} ${cat} ${x.role}: ${x.product.name}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('reads the front of the bottle, not only the ingredient list', () => {
    // "Olay Regenerist Retinol24 Night Moisturiser" says it on the label, and a
    // filter reading only `actives` is one derivation away from missing it.
    const hit = findContraindication('Olay Regenerist Retinol24 Night Moisturiser (50 g)', [], ['pregnancy']);
    expect(hit?.condition).toBe('pregnancy');
  });

  it('does not refuse the alternative it recommends instead', () => {
    // The assessment offers bakuchiol in place of a retinoid. A rule that
    // excluded "Bakuchiol (retinol alternative)" for the word retinol would be
    // the exact opposite of this feature.
    expect(findContraindication('Bakuchiol Serum — a retinol alternative', ['Bakuchiol 1%'], ['pregnancy'])).toBeNull();
  });

  it('leaves everybody else\'s shelf alone', () => {
    const open = recommendProducts({ readings: READINGS, concerns: [], profile: { skinType: 'oily' }, insights: [] });
    expect(open.length).toBe(BEAUTY_PRODUCTS.length);
  });
});
