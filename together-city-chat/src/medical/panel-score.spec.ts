import { panelBand, panelScore, panelScoreBasis, weightOf } from './panel-score';
import { livabilityBasis, livabilityScore } from '../realestate/realestate.constants';

const marker = (key: string, status: 'normal' | 'high' | 'low') => ({ key, status });

describe('panel score', () => {
  it('is the weighted share of markers in range', () => {
    expect(panelScore([marker('hb', 'normal'), marker('ldl', 'normal')])).toBe(100);
    expect(panelScore([marker('hb', 'high'), marker('ldl', 'high')])).toBe(5); // floored
    // hb(9) in range of hb(9)+vitd(4) = 9/13 ≈ 69
    expect(panelScore([marker('hb', 'normal'), marker('vitd', 'low')])).toBe(69);
  });

  /**
   * The defect that motivated the rewrite.
   *
   * The old formula was `100 - abnormal * 8`, so a thorough panel could only
   * ever score worse than a sparse one at the same underlying health. Someone
   * who ordered twenty markers and had three out of range scored 76; someone
   * who ordered three and had one out of range scored 92. The app rewarded
   * testing less, which is the opposite of what a health product should do.
   */
  it('does not punish a more thorough panel', () => {
    const sparse = [marker('vitd', 'low'), marker('b12', 'normal'), marker('folate', 'normal')];
    // The same person, tested more widely: the extra markers all come back fine.
    const thorough = [...sparse, ...['ldl', 'trig', 'crp', 'ferritin', 'hb', 'hba1c'].map((k) => marker(k, 'normal'))];
    expect(panelScore(thorough)).toBeGreaterThan(panelScore(sparse));
  });

  it('weights a serious marker above a marginal one', () => {
    // One dangerous marker out of range should cost more than one minor one.
    const bigOneBad = [marker('hba1c', 'high'), marker('vitd', 'normal')];
    const smallOneBad = [marker('hba1c', 'normal'), marker('vitd', 'low')];
    expect(panelScore(bigOneBad)).toBeLessThan(panelScore(smallOneBad));
    expect(weightOf('hba1c')).toBeGreaterThan(weightOf('vitd'));
    expect(weightOf('something-unlisted')).toBe(3);
  });

  it('deducts for critical results on top of the proportion', () => {
    const clean = [marker('hb', 'normal'), marker('ldl', 'normal')];
    expect(panelScore(clean)).toBe(100);
    expect(panelScore(clean, [{ urgent: false }])).toBe(88);
    expect(panelScore(clean, [{ urgent: true }])).toBe(82);
  });

  it('reports nothing rather than a perfect score for an unreadable panel', () => {
    // 100/100 for a panel we could not read is the most misleading answer available.
    expect(panelScore([])).toBe(0);
    expect(panelScoreBasis([])).toMatch(/nothing to summarise/i);
  });

  it('never returns a score outside 5–100', () => {
    const allBad = ['hb', 'hba1c', 'trig', 'ldl'].map((k) => marker(k, 'high'));
    expect(panelScore(allBad, [{ urgent: true }, { urgent: true }])).toBe(5);
    expect(panelScore([marker('hb', 'normal')])).toBe(100);
  });

  it('always states what the number counted', () => {
    const basis = panelScoreBasis([marker('hb', 'normal'), marker('ldl', 'high')], [{ urgent: true }]);
    expect(basis).toContain('2 markers');
    expect(basis).toContain('1 critical result');
    // The disclaimer is the point of the string existing at all.
    expect(basis).toMatch(/not a clinical index/i);
  });

  it('bands the score', () => {
    expect(panelBand(90)).toBe('Excellent');
    expect(panelBand(70)).toBe('Good');
    expect(panelBand(55)).toBe('Fair');
    expect(panelBand(54)).toBe('Needs attention');
  });
});

describe('livability score', () => {
  const near = (n: number) => Array.from({ length: n }, () => ({ distanceKm: 1 }));

  it('starts at nothing for a listing with nothing', () => {
    // It used to start at 52/100 for an empty listing — a number with no source,
    // which made "nothing listed" read as "middling".
    expect(livabilityScore('', [])).toBe(0);
  });

  it('rises with what is actually there, and caps at 100', () => {
    expect(livabilityScore('lift,gym', [])).toBe(12);
    expect(livabilityScore('', near(5))).toBe(40);
    expect(livabilityScore('a,b,c,d,e,f,g,h,i,j', near(5))).toBe(100);
    // Beyond the ceilings it stays at 100 rather than overflowing.
    expect(livabilityScore('a,b,c,d,e,f,g,h,i,j,k,l', near(9))).toBe(100);
  });

  it('only counts facilities within the stated radius', () => {
    expect(livabilityScore('', [{ distanceKm: 1.9 }])).toBeGreaterThan(0);
    expect(livabilityScore('', [{ distanceKm: 2.1 }])).toBe(0);
  });

  it('says what it counted, and what it is not', () => {
    const basis = livabilityBasis('lift,gym', near(3));
    expect(basis).toContain('2 listed amenities');
    expect(basis).toContain('3 facilities');
    expect(basis).toMatch(/not a survey/i);
  });
});
