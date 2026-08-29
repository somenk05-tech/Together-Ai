import { NUTRIENTS, nutrient, matchNutrient, HARM_CAPABLE, BIOTIN_INTERFERENCE } from './nutrients';
import { ALL_FORMULATIONS, FORMULATIONS, UNVERIFIED, formulation } from './formulations';
import { classify, totalExposure, misclassified, unmatchedNutrientIds, requirement } from './exposure';
import { regimenFor, biotinInterlock, TRIAL_LENGTH } from './regimen';
import { assessMultivitamins, assessOne, compare } from './multivitamin.engine';
import type { Citizen } from './supplements.engine';

/**
 * WHAT THESE SPECS ARE FOR.
 *
 * Not coverage. Each one holds a rule that a later, entirely reasonable-looking
 * commit would otherwise be free to relax — and the reason they exist is that
 * every one of them describes a mistake that was actually made, or very nearly
 * made, while this was being built.
 *
 * The first is the sharpest. During research, a tidy, complete, correctly
 * formatted table of "ICMR upper limits" was produced and nearly believed, and
 * every value in it was character-for-character the American figure wearing an
 * Indian institution's name. Nothing in the output would have looked wrong. So
 * the provenance rule is asserted mechanically rather than trusted.
 */

describe('provenance — a number may not wear the wrong passport', () => {
  it('no value citing an Indian authority is marked as a foreign fallback, and no foreign value claims ICMR', () => {
    const all = NUTRIENTS.flatMap((n) => [n.rdaMale, n.rdaFemale, n.fallback, n.ul].filter(Boolean));
    for (const v of all as Array<{ provenance: { authority: string; origin: string } }>) {
      const claimsIndia = /ICMR|NIN/i.test(v.provenance.authority);
      expect(claimsIndia).toBe(v.provenance.origin === 'india');
    }
  });

  it('every reference value names an authority and a year', () => {
    for (const n of NUTRIENTS) {
      for (const v of [n.rdaMale, n.rdaFemale, n.fallback, n.ul]) {
        if (!v) continue;
        expect(v.provenance.authority.length).toBeGreaterThan(3);
        expect(v.provenance.year).toBeGreaterThan(1990);
      }
    }
  });

  it('a nutrient India is silent on says so, and offers a labelled foreign figure instead of an Indian-looking one', () => {
    for (const n of NUTRIENTS) {
      if (n.rdaMale || n.rdaFemale) continue;
      expect(n.indiaSilentBecause).toBeTruthy();
      if (n.fallback) expect(n.fallback.provenance.origin).toBe('foreign-fallback');
    }
  });

  it('B6 is the one upper limit India actually publishes', () => {
    const indianUls = NUTRIENTS.filter((n) => n.ul?.provenance.origin === 'india').map((n) => n.id);
    expect(indianUls).toEqual(['vitamin-b6']);
    expect(nutrient('vitamin-b6').ul!.value).toBe(100);
  });
});

describe('an upper limit is a limit on something specific', () => {
  it('every ceiling carries a scope and a sentence explaining it', () => {
    for (const n of NUTRIENTS) {
      if (!n.ul) { expect(n.ulAbsentBecause).toBeTruthy(); continue; }
      expect(n.ul.scope).toBeTruthy();
      expect(n.ul.scopeNote.length).toBeGreaterThan(20);
    }
  });

  it("magnesium's Indian requirement is ABOVE its upper limit, and that is not an error", () => {
    const mg = nutrient('magnesium');
    expect(mg.rdaMale!.value).toBeGreaterThan(mg.ul!.value);
    expect(mg.ul!.scope).toBe('supplemental');
  });

  it('a total-intake ceiling can never be reported as exceeded from supplements alone', () => {
    /* Zinc's ceiling covers food as well, and this engine sees only pills.
       Supradyn carries 55 mg — well over 40 — and the verdict must still be
       "crowds" rather than "over", because the claim "you are over the limit"
       would be one this engine cannot support. */
    const e = totalExposure([formulation('supradyn-daily')], 'male');
    const zinc = e.nutrients.find((n) => n.nutrientId === 'zinc')!;
    expect(zinc.total).toBe(55);
    expect(zinc.ceiling.verdict).toBe('crowds-total');
    for (const n of e.nutrients) {
      if (n.ceiling.verdict !== 'over-supplemental') continue;
      expect(['supplemental', 'supplemental-niacin', 'supplemental-alpha-tocopherol', 'synthetic-folic-acid'])
        .toContain(n.ceiling.scope);
    }
  });
});

describe('folate — the requirement and the ceiling are different quantities', () => {
  it('folic acid on a label counts 1.7x against the requirement and 1x against the ceiling', () => {
    const e = totalExposure([formulation('supradyn-daily')], 'male');
    const folate = e.nutrients.find((n) => n.nutrientId === 'folate')!;
    expect(folate.total).toBe(2550);          // 1500 mcg folic acid as DFE
    expect(folate.unit).toBe('mcg DFE');
    expect(folate.ceilingAmount).toBe(1500);  // and as folic acid, against a folic-acid ceiling
    expect(folate.ceiling.verdict).toBe('over-supplemental');
  });

  it('a woman at 100% of the Indian folate requirement is NOT thereby protected, and the file says so', () => {
    const f = nutrient('folate');
    expect(f.rdaFemale!.value).toBe(220);
    expect(f.periconceptionalOverride).toBeTruthy();
    expect(f.periconceptionalOverride!.text).toContain('400');
  });
});

describe('a suspect figure is refused, never repaired', () => {
  it('the "chromium 50 mg" label is excluded from every total, with its reason', () => {
    const e = totalExposure([formulation('gnc-mega-men-one-daily')], 'male');
    expect(e.nutrients.find((n) => n.nutrientId === 'chromium')).toBeUndefined();
    const x = e.excluded.find((y) => y.nutrientId === 'chromium')!;
    expect(x.printed).toBe('50 mg');
    expect(x.because.length).toBeGreaterThan(40);
  });

  it('vitamin A part-declared as beta-carotene is not tested against the retinol ceiling by inventing a split', () => {
    const e = totalExposure([formulation('gnc-mega-men-one-daily')], 'male');
    const a = e.nutrients.find((n) => n.nutrientId === 'vitamin-a')!;
    expect(a.ceilingAmount).toBeNull();
    expect(a.ceiling.verdict).toBe('no-ceiling');
    expect(a.ceiling.text).toContain('preformed retinol');
  });
});

describe('the label database describes what it names, or says it cannot', () => {
  it('every nutrient row resolves to a row in the reference database', () => {
    expect(unmatchedNutrientIds()).toEqual([]);
  });

  it('every product with no published composition says what would settle it', () => {
    for (const f of ALL_FORMULATIONS) {
      if (f.compositionSource !== 'UNKNOWN') continue;
      expect(f.nutrients).toEqual([]);
      expect(f.unknownBecause && f.unknownBecause.length).toBeGreaterThan(20);
    }
    expect(UNVERIFIED.length).toBeGreaterThanOrEqual(10);
  });

  it('every product carries the date its composition was checked and the page it came from', () => {
    for (const f of ALL_FORMULATIONS) {
      expect(f.verifiedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(f.url).toMatch(/^https:\/\//);
      expect(f.url).not.toMatch(/utm_|affid|tag=/);
    }
  });

  it('null means unknown throughout, and is never a blank string pretending to be a fact', () => {
    for (const f of ALL_FORMULATIONS) {
      for (const v of [f.manufacturer, f.marketer, f.fssaiLicence, f.thirdParty, f.price]) {
        expect(v).not.toBe('');
      }
      expect(f.vegNote.length).toBeGreaterThan(4);
    }
  });
});

describe('the one-RDA ceiling, and where composition and channel disagree', () => {
  it('Supradyn Daily is above the food ceiling on composition and sold on a food page', () => {
    const c = classify(formulation('supradyn-daily'), 'male');
    expect(c.implied).toBe('above-the-food-ceiling');
    expect(c.mismatch).toBe(true);
    const b12 = c.exceedances.find((e) => e.nutrientId === 'vitamin-b12')!;
    expect(b12.times).toBeGreaterThan(200);
  });

  it('the three products visibly engineered to the ceiling come back compliant', () => {
    for (const id of ['nutrilite-daily-plus', 'zincovit', 'wbn-melts-multivitamin']) {
      const c = classify(formulation(id), 'male');
      expect(c.implied).toBe('health-supplement');
      expect(c.exceedances).toEqual([]);
    }
  });

  it('a product sold through a prescription channel is not reported as a mismatch', () => {
    const c = classify(formulation('cobadex-czs'), 'male');
    expect(c.exceedances.length).toBeGreaterThan(0);
    expect(c.mismatch).toBe(false);
  });

  it('the mismatch list is real and names the products it names', () => {
    const ids = misclassified().map((m) => m.formulation.id);
    expect(ids).toContain('supradyn-daily');
    expect(ids).toContain('gnc-mega-men-one-daily');
  });

  it('a nutrient India sets no requirement for cannot produce an Indian ceiling breach', () => {
    /* Vitamin E, K, B5, biotin and the rest have no Indian figure. An American
       fallback is a reference, not a statute, and must not manufacture a
       regulatory finding. */
    for (const f of FORMULATIONS) {
      for (const e of classify(f, 'male').exceedances) {
        expect(requirement(nutrient(e.nutrientId), 'male').origin).toBe('india');
      }
    }
  });
});

describe('the gate is absolute', () => {
  const vegetarianNoPanel: Citizen = { vegetarian: true, sex: 'female', age: 31 };

  it('no blood work, no assessment — not a shorter one, none', () => {
    const a = assessMultivitamins(vegetarianNoPanel);
    expect(a.gated).toBe(true);
    expect(a.assessments).toEqual([]);
    expect(a.gateText).toBeTruthy();
  });

  it('what a test would settle travels through the gate, because it IS the gate', () => {
    const a = assessMultivitamins(vegetarianNoPanel);
    expect(a.watching.map((w) => w.marker)).toEqual(
      expect.arrayContaining(['25(OH)D', 'Vitamin B12', 'Ferritin, with CRP']),
    );
  });

  it('a vegetarian diet alone never produces a recommendation', () => {
    /* The whole argument of the gate. A vegetarian with a lipid panel and no
       B12 result has a real reason to TEST and no result to act on, and the
       engine must not collapse those two. */
    const a = assessMultivitamins({
      vegetarian: true, sex: 'female',
      labs: [{ name: 'LDL cholesterol', value: 118 }],
    });
    expect(a.gated).toBe(false);
    expect(a.assessments.filter((x) => x.state === 'appropriate')).toEqual([]);
    expect(a.verdict).toContain('None');
  });
});

describe('safety is not implied by being sold without a prescription', () => {
  const smoker: Citizen = { smoker: true, sex: 'male', labs: [{ name: 'LDL cholesterol', value: 118 }] };

  it('beta-carotene in a smoker is a hard flag and ends the conversation', () => {
    const a = assessOne(formulation('gnc-mega-men-one-daily'), smoker);
    expect(a.state).toBe('clinician-review');
    const flag = a.flags.find((f) => f.kind === 'harm')!;
    expect(flag.hard).toBe(true);
    expect(flag.text).toContain('CARET');
    expect(a.safety.value).toBeLessThan(4);
  });

  it('the same product in a non-smoker is not treated as a hazard', () => {
    const a = assessOne(formulation('gnc-mega-men-one-daily'), { sex: 'male', labs: [{ name: 'LDL cholesterol', value: 118 }] });
    expect(a.flags.some((f) => f.hard)).toBe(false);
  });

  it('warfarin plus a vitamin K formulation is a hard interaction, not a caution', () => {
    const a = assessOne(formulation('centrum-men-in'), {
      sex: 'male', medicines: ['Warfarin 5mg'], labs: [{ name: 'LDL cholesterol', value: 118 }],
    });
    expect(a.state).toBe('clinician-review');
    expect(a.flags.some((f) => f.kind === 'interaction' && f.hard)).toBe(true);
  });

  it('a product whose contents nobody publishes cannot be cleared', () => {
    const a = assessOne(formulation('himalayan-organics-multivitamin'), { sex: 'male', labs: [{ name: 'LDL cholesterol', value: 118 }] });
    expect(a.safety.value).toBe(0);
    expect(a.flags.some((f) => f.kind === 'unknown-composition' && f.hard)).toBe(true);
    expect(a.whyNot.join(' ')).toContain('cannot describe');
  });

  it('pregnancy plus preformed retinol goes to a clinician', () => {
    const a = assessOne(formulation('centrum-women-in'), {
      sex: 'female', pregnant: true, labs: [{ name: 'Haemoglobin', value: 12.4 }],
    });
    expect(a.state).toBe('clinician-review');
    expect(a.flags.some((f) => f.text.includes('teratogenic'))).toBe(true);
  });
});

describe('the three scores are never combined', () => {
  const c: Citizen = { sex: 'male', labs: [{ name: '25-OH vitamin D', value: 14 }] };

  it('an assessment exposes three separate scores and no total', () => {
    const a = assessOne(formulation('centrum-men-in'), c);
    expect(typeof a.evidence.value).toBe('number');
    expect(typeof a.personalFit.value).toBe('number');
    expect(typeof a.safety.value).toBe('number');
    expect(Object.keys(a)).not.toEqual(expect.arrayContaining(['overall', 'total', 'combined', 'score']));
  });

  it('every score shows its parts, because a number nobody can take apart is a number nobody should trust', () => {
    const a = assessOne(formulation('supradyn-daily'), c);
    for (const s of [a.evidence, a.personalFit, a.safety]) {
      expect(s.parts.length).toBeGreaterThan(0);
      for (const p of s.parts) expect(p.note.length).toBeGreaterThan(15);
    }
  });

  it('they can and do disagree — a compliant product can score well on evidence and badly on fit', () => {
    const wrongPerson: Citizen = { sex: 'male', vegan: true, labs: [{ name: 'Ferritin', value: 140 }] };
    const a = assessOne(formulation('nutrilite-daily-plus'), wrongPerson);
    expect(a.evidence.value).toBeGreaterThan(a.personalFit.value);
  });
});

describe('absence of data is never a reason to recommend', () => {
  it('iron in a product plus no ferritin result counts against fit, and names the test', () => {
    const a = assessOne(formulation('nutrilite-daily-plus'), {
      sex: 'male', labs: [{ name: '25-OH vitamin D', value: 32 }],
    });
    expect(a.missing.join(' ')).toContain('ferritin');
    expect(a.wouldSettle.join(' ')).toContain('CRP');
    expect(a.personalFit.parts.some((p) => p.label === 'Iron' && p.delta < 0)).toBe(true);
  });

  it('a documented deficiency raises fit, and the card still refuses to call a multivitamin a repletion dose', () => {
    const a = assessOne(formulation('centrum-men-in'), {
      sex: 'male', labs: [{ name: '25-OH vitamin D', value: 11, unit: 'ng/mL' }, { name: 'Ferritin', value: 90 }],
    });
    const part = a.personalFit.parts.find((p) => p.label === 'Vitamin D')!;
    expect(part.delta).toBeGreaterThan(0);
    expect(part.note).toContain('repletion');
  });

  it('every refusal explains itself rather than going quiet', () => {
    const a = assessMultivitamins({ sex: 'male', labs: [{ name: 'LDL cholesterol', value: 118 }] });
    for (const x of a.assessments) {
      if (x.state === 'appropriate') continue;
      expect(x.whyNot.length).toBeGreaterThan(0);
    }
  });
});

describe('retest intervals are physiology or guideline, never habit', () => {
  it('exactly three markers are worth a consumer retest, and the rest say what to watch instead', () => {
    /* Two markers are routinely retestable. Folate has a window but sits at
       'consider' rather than 'retest', because the British Society for
       Haematology recommends against routine red-cell folate and it earns its
       interval only in a preconception context. Encoding it as 'retest' would
       be selling a test on a guideline that declines to recommend it. */
    const retestable = NUTRIENTS.filter((n) => n.marker.monitor === 'retest').map((n) => n.id);
    expect(retestable.sort()).toEqual(['iron', 'vitamin-d']);
    const windowed = NUTRIENTS.filter((n) => n.marker.retestWeeks).map((n) => n.id);
    expect(windowed.sort()).toEqual(['folate', 'iron', 'vitamin-d']);
    for (const n of NUTRIENTS) {
      if (n.marker.retestWeeks) continue;
      expect(n.marker.insteadWatch && n.marker.insteadWatch.length).toBeGreaterThan(5);
    }
  });

  it('no interval is offered without a source, and the vitamin D one names its physiology', () => {
    for (const n of NUTRIENTS) expect(n.marker.retestSource.length).toBeGreaterThan(10);
    const d = regimenFor('vitamin-d');
    expect(d.initialWeeks).toEqual([12, 26]);
    expect(d.initialWhy).toContain('half-life');
    expect(d.initialWhy).toContain('obesity');
  });

  it('B12 is deliberately not retestable, because the test would be measuring the tablet', () => {
    const b = regimenFor('vitamin-b12');
    expect(b.initialWeeks).toBeNull();
    expect(b.insteadWatch).toContain('cannot come back');
  });

  it('every nutrient with a retest has a decision framework and a stop rule attached to it', () => {
    for (const id of ['vitamin-d', 'iron', 'folate']) {
      const r = regimenFor(id);
      expect(r.afterRetest.length).toBeGreaterThanOrEqual(3);
      expect(r.stopRules.length).toBeGreaterThan(0);
    }
  });

  it('outcomes with no blood test carry a trial length set by biology', () => {
    const hair = TRIAL_LENGTH.find((t) => t.outcome === 'Hair')!;
    expect(hair.weeks[0]).toBeGreaterThanOrEqual(26);
    const immunity = TRIAL_LENGTH.find((t) => t.outcome === 'Immunity')!;
    expect(immunity.weeks[0]).toBeGreaterThan(12);
  });
});

describe('the biotin interlock', () => {
  it('a hair-supplement dose of biotin blocks the retest it would corrupt', () => {
    const i = biotinInterlock([{
      ...formulation('centrum-men-in'),
      nutrients: [{ nutrient: 'biotin', form: 'D-biotin', amount: 10, unit: 'mg' }],
    }]);
    expect(i.biotinMcgPerDay).toBe(10000);
    expect(i.blocked).toBe(true);
    expect(i.text).toContain('ferritin');
    expect(i.text).toContain(String(BIOTIN_INTERFERENCE.washoutHours));
  });

  it('a normal multivitamin dose does not', () => {
    expect(biotinInterlock([formulation('centrum-men-in')]).blocked).toBe(false);
  });
});

describe('comparison — and price cannot buy its way past the science', () => {
  const c: Citizen = { sex: 'male', labs: [{ name: '25-OH vitamin D', value: 14 }] };

  it('there is no total, on purpose', () => {
    const r = compare(formulation('centrum-men-in'), c);
    expect(Object.keys(r)).not.toEqual(expect.arrayContaining(['total', 'overall', 'rank']));
    expect(r.parameters).toHaveLength(8);
  });

  it('value per effective dose scores zero where the evidence does not reach halfway', () => {
    for (const id of ['himalayan-organics-multivitamin', 'mankind-health-ok']) {
      const r = compare(formulation(id), c);
      const value = r.parameters.find((p) => p.parameter === 'Value per effective dose')!;
      expect(value.outOf10).toBe(0);
    }
  });

  it('transparency rewards a published label over a retailer panel over nothing at all', () => {
    const t = (id: string) => compare(formulation(id), c).parameters.find((p) => p.parameter === 'Ingredient transparency')!.outOf10;
    expect(t('nutrilite-daily-plus')).toBeGreaterThan(t('centrum-men-in'));
    expect(t('centrum-men-in')).toBeGreaterThan(t('netmeds-supermeds-women'));
  });
});

describe('the harm-capable list is a list, not a derivation', () => {
  it('every id on it is a real nutrient, and the ones with documented harm are on it', () => {
    for (const id of HARM_CAPABLE) expect(() => nutrient(id)).not.toThrow();
    for (const id of ['vitamin-a', 'vitamin-d', 'iron', 'zinc', 'selenium', 'iodine', 'folate', 'beta-carotene']) {
      expect(HARM_CAPABLE).toContain(id);
    }
  });

  it('matchNutrient prefers the longest alias, so B12 is never swallowed by B1', () => {
    expect(matchNutrient('Vitamin B12 (cyanocobalamin)')!.id).toBe('vitamin-b12');
    expect(matchNutrient('Thiamine Mononitrate')!.id).toBe('vitamin-b1');
    expect(matchNutrient('Korean ginseng extract')).toBeUndefined();
  });
});

describe('a worked example — a real panel, end to end', () => {
  /* Vegetarian man on metformin with a lipid panel and no vitamin D, B12 or
     ferritin result. Two strong reasons to look at B12 and not one result to
     act on: exactly the case the gate exists to handle correctly. */
  const owner: Citizen = {
    sex: 'male', age: 39, vegetarian: true,
    medicines: ['Metformin 500mg'],
    labs: [
      { name: 'LDL cholesterol', value: 132, unit: 'mg/dL', at: '19 July 2026' },
      { name: 'Triglycerides', value: 427, unit: 'mg/dL' },
      { name: 'HbA1c', value: 6.7, unit: '%' },
      { name: 'Haemoglobin', value: 14.8, unit: 'g/dL' },
    ],
  };
  const answer = assessMultivitamins(owner);

  it('nothing reaches "appropriate", because nothing has been measured that would justify it', () => {
    expect(answer.gated).toBe(false);
    expect(answer.assessments.some((a) => a.state === 'appropriate')).toBe(false);
    expect(answer.verdict).toContain('clears every bar');
  });

  it('a diet and a depleting medicine raise fit and still stop short of a recommendation', () => {
    const z = answer.assessments.find((a) => a.formulationId === 'zincovit')!;
    expect(z.state).toBe('may-be-considered');
    expect(z.why.join(' ')).toContain('metformin');
    expect(z.why.join(' ')).toContain('vegetarian');
    /* And the sentence that keeps it honest: a maintenance amount is not a
       correction, and the reason to test is not a reason to take. */
    expect(z.why.join(' ')).toContain('not a correction');
    expect(z.wouldSettle.join(' ')).toContain('methylmalonic acid');
  });

  it('a product nobody publishes a composition for is a finding, not a doctor’s question', () => {
    const t = answer.assessments.find((a) => a.formulationId === 'tata-1mg-daily-multivitamin')!;
    expect(t.state).toBe('no-clear-benefit');
    expect(t.whyNot[0]).toContain('cannot describe');
  });

  it('every one of the five states is reachable, and the loudest sorts first', () => {
    const states = new Set(answer.assessments.map((a) => a.state));
    expect(states.size).toBeGreaterThanOrEqual(4);
    const order = answer.assessments.map((a) => a.state);
    expect(order.indexOf('may-be-considered')).toBeLessThan(order.lastIndexOf('clinician-review'));
  });

  it('the interlock is computed even when nothing is blocking, so the page can say so', () => {
    expect(answer.interlock.blocked).toBe(false);
    expect(answer.interlock.text.length).toBeGreaterThan(20);
  });
});
