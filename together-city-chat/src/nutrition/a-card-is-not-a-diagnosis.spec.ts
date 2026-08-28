import * as fs from 'fs';
import * as path from 'path';
import { buildMedicalRecs, MED_REC_CAVEAT, type MedPrefs } from './medical-recs';

/**
 * ── A CARD IS NOT A DIAGNOSIS, AND A CHIP IS NOT A LAB RESULT ──
 *
 * `clinical-engine.ts` has said since it was written that its output is
 * "educational guidance and flags — NOT a diagnosis, and not a substitute for
 * a clinician". That sentence was in a source comment. The screen said:
 *
 *     Elevated cholesterol detected
 *     Your blood sugar is above the recommended range
 *     Your uric acid is elevated
 *     Your profile and blood tests suggest your kidneys need extra nutritional support
 *
 * Three of those five cards read no marker at all. Kidney, fatty liver and uric
 * acid fire on a health-profile CHIP and nothing else — so "Your uric acid is
 * elevated" asserted a lab value this app has never seen, on the strength of a
 * checkbox, and the kidney card claimed blood tests it never opened. The other
 * two can fire either way and said "detected" whichever it was.
 *
 * Nothing about the RECOMMENDATIONS was wrong; they are cited and sensible.
 * What was wrong was the sentence above them.
 */
const base: MedPrefs = {
  diet: 'everything',
  proteins: ['Chicken', 'Egg'],
  weekly: { Mon: 'nonveg', Tue: 'nonveg', Wed: 'nonveg', Thu: 'nonveg', Fri: 'nonveg', Sat: 'nonveg', Sun: 'nonveg' },
  healthConditions: [],
  excluded: '',
};
const withCond = (...c: string[]): MedPrefs => ({ ...base, healthConditions: c });
const only = (p: MedPrefs, flags: Record<string, string> = {}) => buildMedicalRecs(p, flags)[0];

describe('what fired the card is what the card says', () => {
  it('a chip says a chip — it does not claim a blood test', () => {
    for (const [cond, said] of [
      ['kidney disease', 'kidney disease'],
      ['fatty liver', 'fatty liver'],
      ['gout', 'high uric acid or gout'],
    ] as const) {
      const card = only(withCond(cond));
      expect(card.basis).toBe(`You have listed ${said} in your health profile.`);
      expect(card.basis).not.toMatch(/blood test|panel|elevated|above the/i);
    }
  });

  it('a marker says the marker, by name', () => {
    expect(only(base, { hba1c: 'high' }).basis)
      .toBe('Your latest blood test shows HbA1c above the reference range.');
    expect(only(base, { ldl: 'high' }).basis)
      .toBe('Your latest blood test shows LDL above the reference range.');
    // "your cholesterol" is not what the report said — both lipids, named.
    expect(only(base, { ldl: 'high', trig: 'high' }).basis)
      .toBe('Your latest blood test shows LDL and triglycerides above the reference range.');
  });

  /**
   * The same card can arrive by either route, and it must not borrow the
   * other one's evidence. This is the case that produced "detected".
   */
  it('does not claim a panel when the same card came from a chip', () => {
    expect(only(withCond('diabetes')).basis).toBe('You have listed diabetes in your health profile.');
    expect(only(withCond('high cholesterol')).basis).toBe('You have listed high cholesterol in your health profile.');
  });

  it('carries the caveat on every card, from one source', () => {
    const cards = buildMedicalRecs(withCond('gout', 'diabetes', 'fatty liver'), { ldl: 'high' });
    expect(cards.length).toBeGreaterThan(2);
    for (const c of cards) expect(c.caveat).toBe(MED_REC_CAVEAT);
    expect(MED_REC_CAVEAT).toMatch(/not a diagnosis/i);
  });

  it('titles the card by what it offers, not by what it found', () => {
    for (const c of buildMedicalRecs(withCond('gout', 'diabetes', 'fatty liver', 'kidney disease'), {})) {
      expect(c.title).toMatch(/changes to your meal plan$/);
    }
  });
});

describe('the sentences that are gone', () => {
  const src = fs.readFileSync(path.join(__dirname, 'medical-recs.ts'), 'utf8')
    .split('\n').map((l) => (/^\s*(\*|\/\/|\/\*)/.test(l) ? '' : l)).join('\n');

  it('no longer detects anything, or tells anybody what their levels are', () => {
    expect(src).not.toMatch(/Elevated cholesterol detected/);
    expect(src).not.toMatch(/Your uric acid is elevated/);
    expect(src).not.toMatch(/Your blood sugar is above the recommended range/);
    expect(src).not.toMatch(/blood tests suggest/);
  });
});

/**
 * And the number beside them. `diabetesScore` starts at 92 and subtracts only
 * for which protein CHIPS are ticked — no marker, no portion, no calorie. The
 * label on the screen decides whether that is an honest meal-plan heuristic or
 * a claim about a person's glucose control.
 */
describe('the score measures preferences', () => {
  it('moves on a checkbox and on nothing else', () => {
    const thin = only(base, { hba1c: 'high' });
    const withLegumes = only({ ...base, proteins: [...base.proteins, 'Lentils & Dal', 'Beans & Legumes'] }, { hba1c: 'high' });
    expect(withLegumes.scoreBefore).toBeGreaterThan(thin.scoreBefore);
    // Same person, same panel. Only the chips changed.
    expect(thin.basis).toBe(withLegumes.basis);
  });

  it('is named for the plan on the screen, never for the person', () => {
    // Comments stripped: the note explaining the rename quotes the names it
    // removed, and an assertion that reads the explanation fails for the wrong
    // reason. Same helper and same reason as a-like-is-anonymous-and-says-so.
    const ui = fs.readFileSync(
      path.join(__dirname, '..', '..', '..', 'together-city-react', 'src', 'features', 'nutrition', 'components', 'MedicalRecs.tsx'),
      'utf8',
    ).replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n').map((l) => (/^\s*\/\//.test(l) ? '' : l)).join('\n');
    expect(ui).not.toMatch(/Glucose-control score|Heart-health score|Liver-health score/);
    expect(ui).toMatch(/How well your food preferences match/);
    expect(ui).toMatch(/Scores your saved preferences, not your health\./);
    // The caveat and the basis both reach the screen.
    expect(ui).toMatch(/\{c\.caveat\}/);
    expect(ui).toMatch(/\{c\.basis\}/);
  });
});
