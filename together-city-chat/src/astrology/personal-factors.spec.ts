import { reduceDigits, computeNumerology, vimshottariDasha, DASHA_LORDS } from './personal-factors';

describe('numerology', () => {
  it('reduces digits, preserving master numbers when asked', () => {
    expect(reduceDigits(38)).toBe(11);        // 3+8 = 11, kept
    expect(reduceDigits(38, false)).toBe(2);  // 11 → 2 when masters not kept
    expect(reduceDigits(1991)).toBe(2);       // 1+9+9+1=20 → 2
    expect(reduceDigits(29)).toBe(11);
  });

  it('computes a stable Life Path from the birth date', () => {
    // 21-08-1991 → month 8, day 3(=2+1), year 1991→2 ⇒ 8+3+2 = 13 → 4
    const n = computeNumerology(new Date(Date.UTC(1991, 7, 21)), new Date(Date.UTC(2026, 6, 24)));
    expect(n.lifePath).toBe(4);
    expect(n.personalYear).toBeGreaterThanOrEqual(1);
    expect(n.personalYear).toBeLessThanOrEqual(9);
    expect(n.personalDay).toBeGreaterThanOrEqual(1);
    expect(n.personalDay).toBeLessThanOrEqual(9);
    expect(n.dayFocus.length).toBeGreaterThan(0);
  });

  it('personal day rolls within 1..9', () => {
    for (let d = 1; d <= 28; d++) {
      const n = computeNumerology(new Date(Date.UTC(1990, 0, 1)), new Date(Date.UTC(2026, 0, d)));
      expect(n.personalDay).toBeGreaterThanOrEqual(1);
      expect(n.personalDay).toBeLessThanOrEqual(9);
    }
  });
});

describe('vimshottari dasha', () => {
  it('returns a valid maha + antar lord and advances over time', () => {
    const birth = new Date(Date.UTC(1991, 7, 21, 6, 30));
    const early = vimshottariDasha(200, birth, new Date(Date.UTC(1993, 0, 1)));
    const later = vimshottariDasha(200, birth, new Date(Date.UTC(2026, 0, 1)));
    expect(DASHA_LORDS).toContain(early.maha);
    expect(DASHA_LORDS).toContain(early.antar);
    expect(DASHA_LORDS).toContain(later.maha);
    expect(later.theme.length).toBeGreaterThan(0);
  });

  it('at birth, the maha is the nakshatra lord of the Moon', () => {
    const birth = new Date(Date.UTC(2000, 0, 1));
    // Moon at 5° (nakshatra 0 = Ashwini → Ketu)
    expect(vimshottariDasha(5, birth, birth).maha).toBe('Ketu');
    // Moon at 15° (nakshatra 1 = Bharani → Venus)
    expect(vimshottariDasha(15, birth, birth).maha).toBe('Venus');
  });
});
