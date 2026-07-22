import { activeMntRules, mntRecipeBias, mntAvoidKeywords, MNT_RULES } from './clinical-mnt';

describe('clinical MNT layer (Krause/ESPEN-derived)', () => {
  it('stages kidney disease from condition text', () => {
    expect(activeMntRules({ conditions: ['Kidney Disease'], flags: {}, age: 40, sex: 'male' })[0].key).toBe('ckdEarly');
    expect(activeMntRules({ conditions: ['CKD stage 4'], flags: {}, age: 40, sex: 'male' })[0].key).toBe('ckdLate');
    expect(activeMntRules({ conditions: ['kidney disease, on dialysis'], flags: {}, age: 40, sex: 'male' })[0].key).toBe('dialysis');
  });

  it('activates rules from blood flags without a condition chip', () => {
    const rules = activeMntRules({ conditions: [], flags: { ldl: 'high', hba1c: 'high' }, age: 40, sex: 'female' });
    expect(rules.map((r) => r.key).sort()).toEqual(['diabetes', 'dyslipidemia']);
  });

  it('adds the geriatric rule at 65+', () => {
    const rules = activeMntRules({ conditions: [], flags: {}, age: 70, sex: 'female' });
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
