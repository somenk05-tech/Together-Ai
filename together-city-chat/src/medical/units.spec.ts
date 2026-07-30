import { BIOMARKER_SECTIONS, biomarkerDef } from './biomarker-catalog';
import {
  ANALYTE_UNITS, MOLAR_MASS, acceptedUnits, fromCanonical, normaliseUnit, toCanonical, unitChoices,
} from './units';

/**
 * The scenarios first, because they are the reason this file exists. Each one
 * is a real report in a unit a real lab prints, and each one is a value that
 * would be read as the wrong side of a clinical threshold if the unit were
 * ignored — which is what the app did before.
 */
describe('the values that would otherwise be misread', () => {
  const val = (key: string, v: number, unit: string): number => {
    const r = toCanonical(key, v, unit);
    if (!r.ok) throw new Error(r.reason);
    return r.value;
  };
  const flag = (key: string, v: number): string => {
    const d = biomarkerDef(key);
    if (!d) throw new Error(`no catalog entry for ${key}`);
    return v < d.min ? 'low' : v > d.max ? 'high' : 'normal';
  };

  it('vitamin D of 30 nmol/L is deficient, not normal', () => {
    // Read bare against a 20–100 ng/mL range it passes. It is 12 ng/mL.
    expect(flag('vitd', 30)).toBe('normal');
    const v = val('vitd', 30, 'nmol/L');
    expect(v).toBeCloseTo(12.02, 2);
    expect(flag('vitd', v)).toBe('low');
  });

  it('fasting glucose of 7 mmol/L is diabetic, not low', () => {
    expect(flag('fbs', 7)).toBe('low');
    const v = val('fbs', 7, 'mmol/L');
    expect(v).toBeCloseTo(126.1, 1);
    expect(flag('fbs', v)).toBe('high');
  });

  it('HbA1c of 48 mmol/mol is 6.5% — the diagnostic threshold, not 4.4%', () => {
    // The affine transform is the point. 48 x 0.09148 alone is 4.39, which
    // reads as an excellent result rather than a diagnosis.
    expect(val('hba1c', 48, 'mmol/mol')).toBeCloseTo(6.5, 1);
    expect(val('hba1c', 42, 'mmol/mol')).toBeCloseTo(6.0, 1);
    expect(val('hba1c', 31, 'mmol/mol')).toBeCloseTo(5.0, 1);
  });

  it('CRP of 0.8 mg/dL is raised at 8 mg/L', () => {
    expect(flag('crp', 0.8)).toBe('normal');
    const v = val('crp', 0.8, 'mg/dL');
    expect(v).toBe(8);
    expect(flag('crp', v)).toBe('high');
  });

  it('B12 of 148 pmol/L sits at the bottom of the range, not far below it', () => {
    expect(flag('b12', 148)).toBe('low');
    expect(val('b12', 148, 'pmol/L')).toBeCloseTo(200.6, 1);
  });

  it('a BUN result is not a urea result', () => {
    // 15 mg/dL BUN is mid-range. Pasted in as urea it is the floor of the
    // range, and the difference is a 2.14x factor nobody would see.
    expect(flag('urea', 15)).toBe('normal'); // ...but only just
    const v = val('urea', 15, 'mg/dL (BUN)');
    expect(v).toBeCloseTo(32.2, 1);
    expect(v / 15).toBeCloseTo(MOLAR_MASS.urea / MOLAR_MASS.ureaNitrogen, 3);
  });

  it('magnesium in mEq/L is half of mmol/L, because magnesium is divalent', () => {
    expect(val('magnesium', 2.0, 'mEq/L')).toBeCloseTo(val('magnesium', 1.0, 'mmol/L'), 3);
  });

  it('sodium in mEq/L is not, because sodium is monovalent', () => {
    expect(val('sodium', 140, 'mEq/L')).toBe(140);
  });

  it('triglycerides and cholesterol do not share a factor', () => {
    // Both print in mg/dL and mmol/L, and the molecules are a different size.
    // 1.7 mmol/L is the 150 mg/dL threshold; the cholesterol factor gives 66.
    expect(val('trig', 1.7, 'mmol/L')).toBeCloseTo(150.5, 1);
    expect(val('ldl', 3.0, 'mmol/L')).toBeCloseTo(116.0, 1);
  });
});

/**
 * The factors are derived rather than copied, so the table cannot drift from
 * the chemistry it claims. Each published cross-check is named in units.ts.
 */
describe('every molar factor follows from the stated molar mass', () => {
  const factor = (key: string, unit: string): number => {
    const opt = ANALYTE_UNITS.find((a) => a.key === key)?.alternates.find((u) => u.unit === unit);
    if (!opt) throw new Error(`no ${unit} option for ${key}`);
    return opt.factor;
  };

  // mmol/L -> mg/dL is MW / 10.
  it.each([
    ['fbs', 'mmol/L', 'glucose'], ['ppbs', 'mmol/L', 'glucose'],
    ['ldl', 'mmol/L', 'cholesterol'], ['hdl', 'mmol/L', 'cholesterol'],
    ['totalChol', 'mmol/L', 'cholesterol'], ['nonHdl', 'mmol/L', 'cholesterol'],
    ['vldl', 'mmol/L', 'cholesterol'], ['trig', 'mmol/L', 'triglyceride'],
    ['urea', 'mmol/L', 'urea'], ['magnesium', 'mmol/L', 'magnesium'],
  ])('%s %s', (key, unit, mass) => {
    expect(factor(key, unit)).toBeCloseTo(MOLAR_MASS[mass] / 10, 4);
  });

  // umol/L -> mg/dL is MW / 10000.
  it.each([
    ['creatinine', 'creatinine'], ['uricAcid', 'uricAcid'], ['bilirubin', 'bilirubin'],
  ])('%s umol/L', (key, mass) => {
    expect(factor(key, 'µmol/L')).toBeCloseTo(MOLAR_MASS[mass] / 10000, 6);
  });

  // umol/L -> ug/dL is MW / 10.
  it.each([['serumIron', 'iron'], ['tibc', 'iron'], ['uibc', 'iron'], ['zinc', 'zinc']])(
    '%s umol/L', (key, mass) => {
      expect(factor(key, 'µmol/L')).toBeCloseTo(MOLAR_MASS[mass] / 10, 4);
    });

  // nmol/L -> ng/mL is MW / 1000.
  it.each([['vitd', 'vitaminD3_25OH'], ['folate', 'folate']])('%s nmol/L', (key, mass) => {
    expect(factor(key, 'nmol/L')).toBeCloseTo(MOLAR_MASS[mass] / 1000, 5);
  });

  it('B12 pmol/L follows cyanocobalamin, and agrees with the published 738', () => {
    expect(factor('b12', 'pmol/L')).toBeCloseTo(MOLAR_MASS.cyanocobalamin / 1000, 4);
    expect(1000 / factor('b12', 'pmol/L')).toBeCloseTo(738, 0);
  });

  it('free T3 and free T4', () => {
    expect(factor('ft3', 'pmol/L')).toBeCloseTo(MOLAR_MASS.freeT3 / 1000, 5);
    expect(factor('ft4', 'pmol/L')).toBeCloseTo(MOLAR_MASS.freeT4 / 10000, 6);
  });
});

/**
 * The guard that matters most over time. Reference ranges live in the catalog;
 * if somebody restates a range in different units there and this table is not
 * updated with it, every conversion silently lands in the wrong scale. The
 * build should stop rather than let those two files disagree.
 */
describe('the table and the catalog agree', () => {
  it('every canonical unit matches the catalog exactly', () => {
    for (const a of ANALYTE_UNITS) {
      const def = biomarkerDef(a.key);
      expect(def).toBeDefined();
      expect(`${a.key}: ${a.canonical}`).toBe(`${a.key}: ${def?.unit ?? '(missing)'}`);
    }
  });

  it('names no marker the catalog does not have', () => {
    const known = new Set(BIOMARKER_SECTIONS.flatMap((s) => s.markers.map((m) => m.key)));
    expect(ANALYTE_UNITS.filter((a) => !known.has(a.key)).map((a) => a.key)).toEqual([]);
  });

  it('lists no marker twice, and no unit twice within a marker', () => {
    const keys = ANALYTE_UNITS.map((a) => a.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const a of ANALYTE_UNITS) {
      const units = acceptedUnits(a.key).map(normaliseUnit);
      expect(new Set(units).size).toBe(units.length);
    }
  });

  it('offers no factor of zero, which would erase a value', () => {
    for (const a of ANALYTE_UNITS) {
      for (const u of a.alternates) expect(u.factor).not.toBe(0);
    }
  });
});

describe('refusing rather than guessing', () => {
  it('refuses a unit it does not know, and says what it accepts', () => {
    const r = toCanonical('vitd', 30, 'mg/dL');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toContain('mg/dL');
      expect(r.reason).toContain('nmol/L');
    }
  });

  it('refuses haemoglobin in mmol/L rather than pick a factor', () => {
    // Per-monomer and per-tetramer differ fourfold. Named in units.ts.
    expect(toCanonical('hb', 8, 'mmol/L').ok).toBe(false);
  });

  it('refuses a unit for a marker that has only one', () => {
    // eGFR has no alternates. It still has a canonical unit from the catalog,
    // so a value with no unit goes through and a foreign unit does not.
    expect(acceptedUnits('egfr')).toEqual(['mL/min']);
    expect(toCanonical('egfr', 90, 'mL/min/1.73m2').ok).toBe(false);
    expect(toCanonical('egfr', 90)).toEqual({ ok: true, value: 90, unit: 'mL/min', converted: false });
  });

  it('refuses a marker that is not in the catalog at all', () => {
    expect(toCanonical('troponin', 0.01, 'ng/mL').ok).toBe(false);
    expect(acceptedUnits('troponin')).toEqual([]);
    expect(unitChoices('troponin')).toEqual([]);
  });

  it('refuses a value that is not a number', () => {
    expect(toCanonical('fbs', Number.NaN, 'mmol/L').ok).toBe(false);
    expect(toCanonical('fbs', Number.POSITIVE_INFINITY, 'mmol/L').ok).toBe(false);
  });

  it('treats a missing unit as the unit the form is labelled with', () => {
    // Silence means the existing behaviour, which is the canonical unit. It is
    // the only safe reading, and it is flagged as not converted.
    for (const unit of [undefined, null, '']) {
      const r = toCanonical('fbs', 92, unit);
      expect(r).toEqual({ ok: true, value: 92, unit: 'mg/dL', converted: false });
    }
  });
});

describe('the same unit written the way different labs write it', () => {
  it('accepts the micro sign, the Greek mu and a plain u', () => {
    for (const u of ['µg/dL', 'μg/dL', 'ug/dL', 'UG/DL', ' ug / dl ', 'mcg/dL']) {
      const r = toCanonical('serumIron', 100, u);
      expect(r).toEqual({ ok: true, value: 100, unit: 'µg/dL', converted: false });
    }
  });

  it('normalises case and spacing on an alternate too', () => {
    expect(toCanonical('fbs', 5, ' MMOL/L ')).toEqual(
      { ok: true, value: 90.078, unit: 'mg/dL', converted: true });
  });
});

describe('showing a stored value back in the unit it was printed in', () => {
  it('round-trips every alternate', () => {
    for (const a of ANALYTE_UNITS) {
      for (const u of a.alternates) {
        const there = toCanonical(a.key, 10, u.unit);
        expect(there.ok).toBe(true);
        if (!there.ok) continue;
        const back = fromCanonical(a.key, there.value, u.unit);
        expect(back.ok).toBe(true);
        if (!back.ok) continue;
        expect(back.value).toBeCloseTo(10, 2);
      }
    }
  });

  it('handles the affine one in both directions', () => {
    const pct = toCanonical('hba1c', 48, 'mmol/mol');
    expect(pct.ok).toBe(true);
    if (pct.ok) expect(fromCanonical('hba1c', pct.value, 'mmol/mol').ok).toBe(true);
    const back = fromCanonical('hba1c', 6.5, 'mmol/mol');
    if (back.ok) expect(back.value).toBeCloseTo(47.5, 0);
  });

  it('leaves the canonical unit alone', () => {
    expect(fromCanonical('fbs', 92, 'mg/dL')).toEqual(
      { ok: true, value: 92, unit: 'mg/dL', converted: false });
  });
});

describe('what the selector is given', () => {
  it('puts the canonical unit first, because that is the default', () => {
    expect(acceptedUnits('vitd')[0]).toBe('ng/mL');
    expect(acceptedUnits('hba1c')).toEqual(['%', 'mmol/mol']);
  });

  it('covers every marker in the catalog, so no field is left without a unit', () => {
    const missing = BIOMARKER_SECTIONS
      .flatMap((s) => s.markers.map((m) => m.key))
      .filter((k) => unitChoices(k).length === 0);
    expect(missing).toEqual([]);
  });

  /**
   * The client colours each field live against the reference range while
   * somebody types, so it converts too. It is given these factors rather than
   * carrying its own copy — one table, two readers. This asserts the shape it
   * relies on, and that applying it by hand lands where the server lands.
   */
  it('ships a factor and an offset the client can apply directly', () => {
    for (const key of BIOMARKER_SECTIONS.flatMap((s) => s.markers.map((m) => m.key))) {
      const choices = unitChoices(key);
      expect(choices[0].canonical).toBe(true);
      expect(choices[0].factor).toBe(1);
      expect(choices[0].offset).toBe(0);
      for (const c of choices) {
        expect(typeof c.factor).toBe('number');
        expect(typeof c.offset).toBe('number');
      }
    }
  });

  it('a client applying value x factor + offset agrees with the server', () => {
    for (const key of BIOMARKER_SECTIONS.flatMap((s) => s.markers.map((m) => m.key))) {
      for (const c of unitChoices(key)) {
        const server = toCanonical(key, 12.5, c.unit);
        expect(server.ok).toBe(true);
        if (!server.ok) continue;
        const client = 12.5 * c.factor + (c.offset ?? 0);
        expect(server.value).toBeCloseTo(client, 3);
      }
    }
  });

  it('treats a unitless marker as unitless, not as unknown', () => {
    // HOMA-IR is a ratio. Its catalog unit is the empty string, and a
    // truthiness check on that read as "no such marker" and left the field
    // with no unit handling at all.
    expect(unitChoices('homaIr')).toEqual([{ unit: '', factor: 1, offset: 0, canonical: true }]);
    expect(toCanonical('homaIr', 2.4)).toEqual({ ok: true, value: 2.4, unit: '', converted: false });
  });

  it('marks exactly one choice per marker as canonical', () => {
    for (const a of ANALYTE_UNITS) {
      expect(unitChoices(a.key).filter((c) => c.canonical)).toHaveLength(1);
    }
  });
});
