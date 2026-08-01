import { readFileSync } from 'fs';
import { join } from 'path';
import { activeMntRules, mntRecipeBias, mntAvoidKeywords, MNT_RULES } from './clinical-mnt';

describe('clinical MNT layer (Krause/ESPEN-derived)', () => {
  it('stages kidney disease from condition text', () => {
    expect(activeMntRules({ conditions: ['Kidney Disease'], flags: {}, age: 40 })[0].key).toBe('ckdEarly');
    expect(activeMntRules({ conditions: ['CKD stage 4'], flags: {}, age: 40 })[0].key).toBe('ckdLate');
    expect(activeMntRules({ conditions: ['kidney disease, on dialysis'], flags: {}, age: 40 })[0].key).toBe('dialysis');
  });

  it('activates rules from blood flags without a condition chip', () => {
    const rules = activeMntRules({ conditions: [], flags: { ldl: 'high', hba1c: 'high' }, age: 40 });
    expect(rules.map((r) => r.key).sort()).toEqual(['diabetes', 'dyslipidemia']);
  });

  it('adds the geriatric rule at 65+', () => {
    const rules = activeMntRules({ conditions: [], flags: {}, age: 70 });
    expect(rules.some((r) => r.key === 'elderly')).toBe(true);
    expect(MNT_RULES.elderly.proteinGPerKg?.use).toBe(1.1);
  });

  it('biases recipes: renal emphasizes light dishes, limits potassium-rich', () => {
    const rules = [MNT_RULES.ckdLate];
    const light = { name: 'Lemon Rice Sevai', ingredients: [{ name: 'rice vermicelli' }] };
    const heavy = { name: 'Palak Paneer', ingredients: [{ name: 'spinach' }, { name: 'paneer' }] };
    expect(mntRecipeBias(rules, light)).toBeLessThan(0);
    expect(mntRecipeBias(rules, heavy)).toBeGreaterThan(0);
  });

  it('produces hard-avoid keywords for gout per Krause Box 39-3', () => {
    const kws = mntAvoidKeywords([MNT_RULES.gout]);
    for (const k of ['organ meat', 'anchovy', 'sardine', 'herring']) expect(kws).toContain(k);
  });
});

/**
 * An age we do not hold is not an age of thirty.
 *
 * Both callers passed `age ?? 30` into `activeMntRules`, and thirty is not a
 * neutral filler: it is the one value at which the only age-dependent rule
 * reliably does not fire. A citizen of 66 whose age was not on file was handed
 * the guidance for a 30-year-old and silently lost MNT_RULES.elderly.
 *
 * The master-list entry for this said "a woman gets male-selected clinical
 * guidance". That was WRONG, and worth recording as wrong: `sex` was declared on
 * MntContext and never read by anything. No rule branched on it. The `?? 'male'`
 * default asserted a clinical decision that was not being made — bad, but bad in
 * a different way than advertised, and the field is gone rather than defaulted.
 */
describe('MNT rules and an unknown age', () => {
  const ctx = (age?: number) => ({ conditions: ['diabetes'], flags: {}, ...(age === undefined ? {} : { age }) });

  it('applies the elderly rule when the citizen is known to be over 65', () => {
    expect(activeMntRules(ctx(66)).map((r) => r.key)).toContain('elderly');
  });

  it('does not apply it when the age is not on file', () => {
    // The bug: `?? 30` made this pass as "under 65" rather than "unknown".
    expect(activeMntRules(ctx(undefined)).map((r) => r.key)).not.toContain('elderly');
  });

  it('still gives the rules that do not depend on age', () => {
    // Refusing to guess an age must not cost the citizen their diabetes rules.
    expect(activeMntRules(ctx(undefined)).map((r) => r.key)).toContain('diabetes');
  });

  it('does not take a sex, so nothing can default one', () => {
    // Structural: the field is gone from the type, not merely unused.
    const src = readFileSync(join(__dirname, 'clinical-mnt.ts'), 'utf8');
    const iface = src.slice(src.indexOf('export interface MntContext'), src.indexOf('export function activeMntRules'));
    expect(iface).not.toMatch(/\bsex\b/);
  });
});
