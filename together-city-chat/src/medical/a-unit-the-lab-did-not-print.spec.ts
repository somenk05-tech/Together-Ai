import * as fs from 'fs';
import * as path from 'path';
import { parseReportText } from './report-parser';

/**
 * ── A UNIT THE LAB DID NOT PRINT IS NOT A UNIT WE MAY CHOOSE ──
 *
 * `units.ts` opens by naming the failure it exists to prevent, and its example
 * is this one:
 *
 *     Vitamin D of 30 nmol/L is deficient. Entered bare, it is compared against
 *     a 20–100 ng/mL range and comes back NORMAL. The true value is 12 ng/mL.
 *
 * It ends with the rule: "a unit we do not recognise is REFUSED, never assumed.
 * The expensive mistake in this file would be a default." The manual-entry path
 * follows it. The upload path did not.
 *
 * `autoThreshold` converted a bare value ABOVE a cut and took everything below
 * as canonical. For haemoglobin that is safe — nobody has 30 g/dL, so g/L and
 * g/dL cannot be confused. For vitamin D the cut was 150, which sits above the
 * whole of deficiency and most of normal, so the conversion fired only for
 * values that were already high. Measured before the fix:
 *
 *     25-OH Vitamin D  30  nmol/L   →  12 ng/mL   deficient
 *     25-OH Vitamin D  30           →  30 ng/mL   normal
 *
 * The same citizen, the same result, two labs whose PDFs differ only in whether
 * the unit column survived the export.
 */
const report = (line: string) => parseReportText(
  `ACME DIAGNOSTICS\nReport date: 12/08/2026\n${line}\nHaemoglobin 14.2 g/dL 13.0 - 17.0\n`,
);

describe('a printed unit is honoured', () => {
  it('converts the alternate unit', () => {
    expect(report('25-OH Vitamin D 30 nmol/L').values.vitd).toBe(12);
    expect(report('HbA1c 48 mmol/mol').values.hba1c).toBe(6.54);
    expect(report('LDL Cholesterol 3.1 mmol/L').values.ldl).toBe(119.88);
  });

  /**
   * The canonical unit has to be recognised TOO, and `convert` only lists the
   * alternates — so the first draft of this guard could not tell "38 ng/mL"
   * from "38" and refused both. That is why `canonicalUnit` exists.
   */
  it('takes the canonical unit as printed, and does not refuse it', () => {
    expect(report('25-OH Vitamin D 38 ng/mL').values.vitd).toBe(38);
    expect(report('HbA1c 5.4 %').values.hba1c).toBe(5.4);
    expect(report('25-OH Vitamin D 38 ng/mL').needsUnit).toBeUndefined();
  });
});

describe('a bare number in the ambiguous band is refused, not guessed', () => {
  it('stores nothing for the value that used to come back normal', () => {
    const out = report('25-OH Vitamin D 30');
    expect(out.values.vitd).toBeUndefined();
    expect(out.needsUnit).toEqual(['vitd']);
  });

  it('and for the rest of the band, including sufficiency', () => {
    for (const v of [10, 30, 75, 120, 150]) {
      expect(report(`25-OH Vitamin D ${v}`).values.vitd).toBeUndefined();
    }
  });

  it('still converts above the band, where only one unit is possible', () => {
    // 200 cannot be ng/mL — the physiological ceiling is 200 and nmol/L is the
    // only reading that leaves a plausible result.
    expect(report('25-OH Vitamin D 200').values.vitd).toBe(80);
  });

  it('does the same for the narrow HbA1c overlap', () => {
    expect(report('HbA1c 18').values.hba1c).toBeUndefined();
    expect(report('HbA1c 18').needsUnit).toEqual(['hba1c']);
  });

  /**
   * Haemoglobin is the case the old mechanism got right, and it must keep
   * working: g/L and g/dL do not overlap in any living person, so a bare value
   * is never ambiguous and never withheld.
   */
  it('leaves haemoglobin alone — its two units cannot be confused', () => {
    expect(report('Haemoglobin 14.2').values.hb).toBe(14.2);
    expect(report('Haemoglobin 142').values.hb).toBe(14.2);
    expect(report('Haemoglobin 142').needsUnit).toBeUndefined();
  });
});

describe('the citizen is told', () => {
  /**
   * A value quietly missing from a pre-filled form is its own way of being
   * wrong: eight fields filled, the ninth blank, and the reasonable conclusion
   * is that the ninth was not on the report.
   */
  it('names what it refused, so the note can say so', () => {
    const out = parseReportText('25-OH Vitamin D 30\nHbA1c 18\nFerritin 85 ng/mL\n');
    expect(out.needsUnit?.sort()).toEqual(['hba1c', 'vitd']);
    expect(out.values.ferritin).toBe(85);
  });

  it('resolves from a later row that does print the unit', () => {
    // Reports repeat markers across a summary and a detail table; one bare row
    // must not veto a labelled one further down.
    const out = parseReportText('Vitamin D 30\n25-OH Vitamin D 30 nmol/L\n');
    expect(out.values.vitd).toBe(12);
    expect(out.needsUnit).toBeUndefined();
  });

  it('is wired into the note the upload already prints', () => {
    const svc = fs.readFileSync(path.join(__dirname, 'medical.service.ts'), 'utf8');
    expect(svc).toMatch(/needsUnitNote\(read\.needsUnit\)/);
    expect(svc).toMatch(/needsUnitNote\(extracted\.needsUnit\)/);
    expect(svc).toMatch(/without the unit/);
  });

  /** The AI extractor reads first and the parser is the fallback, so the rule
   *  has to be stated in both places or it holds in neither. */
  it('and the AI extractor is told the same rule', () => {
    const ai = fs.readFileSync(path.join(__dirname, '..', 'ai', 'ai.service.ts'), 'utf8');
    expect(ai).toMatch(/OMIT that marker rather than assuming a unit/);
  });
});
