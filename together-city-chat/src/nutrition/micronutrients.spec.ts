import {
  COVERAGE, PROTEIN_EAR_G_PER_KG, REFERENCE_BODY_KG, REFERENCE_INTAKES,
  proteinEarFor, referenceIntakes,
} from './micronutrients';

describe('every figure can say where it came from', () => {
  it('carries a source, a reference and a version on every row', () => {
    // The ticket's words: "data, not code, with a source and version column per
    // row". A nutrient target a citizen might buy a supplement over is worth
    // nothing if the app cannot say who says so.
    for (const r of REFERENCE_INTAKES) {
      expect([r.nutrient, r.source.length > 10]).toEqual([r.nutrient, true]);
      expect([r.nutrient, r.version]).toEqual([r.nutrient, '2020']);
      expect([r.nutrient, r.sourceRef.startsWith('https://')]).toEqual([r.nutrient, true]);
    }
  });

  it('says whether a figure is an RDA or an EAR, which are not interchangeable', () => {
    for (const r of REFERENCE_INTAKES) expect(['RDA', 'EAR']).toContain(r.kind);
  });

  it('has no duplicate nutrient within a life stage', () => {
    for (const stage of ['adultMan', 'adultWoman']) {
      const keys = REFERENCE_INTAKES.filter((r) => r.lifeStage === stage).map((r) => r.nutrient);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});

describe('the published values', () => {
  const val = (stage: string, nutrient: string) =>
    REFERENCE_INTAKES.find((r) => r.lifeStage === stage && r.nutrient === nutrient)?.amount;

  it('holds the ICMR-NIN 2020 adult figures', () => {
    expect(val('adultMan', 'protein')).toBe(54);
    expect(val('adultWoman', 'protein')).toBe(45.7);
    expect(val('adultMan', 'calcium')).toBe(1000);
    expect(val('adultWoman', 'calcium')).toBe(1000);
    expect(val('adultMan', 'zinc')).toBe(17);
    expect(val('adultWoman', 'zinc')).toBe(13);
  });

  it("keeps women's iron ABOVE men's, which reads like a typo and is not", () => {
    // Menstrual losses. Anyone 'correcting' this should have to change a test.
    expect(val('adultWoman', 'iron')).toBe(29);
    expect(val('adultMan', 'iron')).toBe(19);
    expect(val('adultWoman', 'iron')).toBeGreaterThan(val('adultMan', 'iron') ?? 0);
  });

  it('names the reference bodies the amounts were set for', () => {
    expect(REFERENCE_BODY_KG).toEqual({ adultMan: 65, adultWoman: 55 });
  });
});

describe('protein: the amount versus the rate', () => {
  it('scales to a real body from the EAR, not from the reference amount', () => {
    // 54 g is what a 65 kg reference man needs. Handing it to a 95 kg man
    // because he is a man is a misreading of the table.
    expect(PROTEIN_EAR_G_PER_KG).toBe(0.66);
    expect(proteinEarFor(65)).toBeCloseTo(42.9, 1);
    expect(proteinEarFor(95)).toBeCloseTo(62.7, 1);
    expect(proteinEarFor(48)).toBeCloseTo(31.7, 1);
  });
});

describe('who the table can answer for', () => {
  it('answers for adults', () => {
    const r = referenceIntakes({ sex: 'female', age: 34 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.lifeStage).toBe('adultWoman');
    expect(r.referenceWeightKg).toBe(55);
    expect(r.rows.length).toBeGreaterThan(8);
    expect(r.rows.every((x) => x.lifeStage === 'adultWoman')).toBe(true);
  });
});

/**
 * The refusals are the point of this module, not an edge case in it. These are
 * the groups whose requirements differ most from an adult's, which is exactly
 * why serving them an adult figure would be the most harmful thing it could do.
 */
describe('who it refuses to answer for, and says so', () => {
  it('refuses in pregnancy rather than serving an adult figure', () => {
    const r = referenceIntakes({ sex: 'female', age: 30, pregnant: true });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/iron and folate/);
    // A target set too low is not a smaller error than one set too high — it
    // reads as reassurance.
    expect(r.reason).toMatch(/doing fine/);
  });

  it('refuses while breastfeeding', () => {
    const r = referenceIntakes({ sex: 'female', age: 31, lactating: true });
    expect(r.ok).toBe(false);
  });

  it('refuses for under-18s', () => {
    expect(referenceIntakes({ sex: 'male', age: 14 }).ok).toBe(false);
    expect(referenceIntakes({ sex: 'male', age: 17 }).ok).toBe(false);
    expect(referenceIntakes({ sex: 'male', age: 18 }).ok).toBe(true);
  });

  it('refuses when the table has no set for this answer, without blaming the citizen', () => {
    const r = referenceIntakes({ sex: 'intersex', age: 40 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    // The table's limitation, stated as the table's — and what still works.
    expect(r.reason).toMatch(/published for men and women only/);
    expect(r.reason).toMatch(/energy and macro targets are unaffected/);
  });

  it('refuses a missing sex without pretending', () => {
    expect(referenceIntakes({ sex: null, age: 40 }).ok).toBe(false);
  });
});

describe('coverage is stated rather than implied', () => {
  it('admits which life stages the table does not hold', () => {
    expect(COVERAGE.adultMan).toBe(true);
    expect(COVERAGE.adultWoman).toBe(true);
    expect(COVERAGE.pregnant).toBe(false);
    expect(COVERAGE.lactating).toBe(false);
    expect(COVERAGE.child).toBe(false);
  });

  it('matches what the table actually contains', () => {
    // The map cannot drift into claiming coverage that is not there.
    for (const [stage, claimed] of Object.entries(COVERAGE)) {
      const present = REFERENCE_INTAKES.some((r) => r.lifeStage === stage);
      expect([stage, present]).toEqual([stage, claimed]);
    }
  });
});
