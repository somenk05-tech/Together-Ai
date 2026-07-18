/**
 * Astrology-first compatibility (Relationship AI v1) — deterministic, explainable.
 * Sign → element → elemental affinity, blended with interest overlap. Produces a
 * stable 0–100 score for a pair, so "curated matches" never flicker between reloads.
 */

export type Element = 'fire' | 'earth' | 'air' | 'water';

const SIGNS: { name: string; element: Element; from: [number, number] }[] = [
  { name: 'Capricorn', element: 'earth', from: [12, 22] },
  { name: 'Aquarius', element: 'air', from: [1, 20] },
  { name: 'Pisces', element: 'water', from: [2, 19] },
  { name: 'Aries', element: 'fire', from: [3, 21] },
  { name: 'Taurus', element: 'earth', from: [4, 20] },
  { name: 'Gemini', element: 'air', from: [5, 21] },
  { name: 'Cancer', element: 'water', from: [6, 21] },
  { name: 'Leo', element: 'fire', from: [7, 23] },
  { name: 'Virgo', element: 'earth', from: [8, 23] },
  { name: 'Libra', element: 'air', from: [9, 23] },
  { name: 'Scorpio', element: 'water', from: [10, 23] },
  { name: 'Sagittarius', element: 'fire', from: [11, 22] },
];

export function zodiacSign(birthDate: Date): { name: string; element: Element } {
  const m = birthDate.getUTCMonth() + 1;
  const d = birthDate.getUTCDate();
  // Walk backwards through the year: last boundary that is <= (m, d).
  let match = SIGNS[0];
  for (const s of SIGNS) {
    const [sm, sd] = s.from;
    if (m > sm || (m === sm && d >= sd)) match = s;
  }
  return { name: match.name, element: match.element };
}

/** Classical elemental affinity: same element ≥ complementary ≥ neutral ≥ clashing. */
const AFFINITY: Record<Element, Record<Element, number>> = {
  fire: { fire: 88, air: 92, earth: 62, water: 58 },
  air: { air: 86, fire: 92, water: 64, earth: 60 },
  earth: { earth: 88, water: 92, fire: 62, air: 60 },
  water: { water: 86, earth: 92, air: 64, fire: 58 },
};

/** Stable pseudo-random jitter from the two user ids, so a pair's score is fixed. */
function pairJitter(a: string, b: string): number {
  const s = [a, b].sort().join(':');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h) % 9; // 0..8
}

export function compatibilityScore(
  a: { userId: string; birthDate: Date; interests: string[] },
  b: { userId: string; birthDate: Date; interests: string[] },
): { score: number; signA: string; signB: string } {
  const sa = zodiacSign(a.birthDate);
  const sb = zodiacSign(b.birthDate);
  const base = AFFINITY[sa.element][sb.element];

  const setA = new Set(a.interests.map((i) => i.toLowerCase()));
  const shared = b.interests.filter((i) => setA.has(i.toLowerCase())).length;
  const interestBonus = Math.min(8, shared * 2);

  const score = Math.min(99, base + interestBonus - 4 + pairJitter(a.userId, b.userId));
  return { score, signA: sa.name, signB: sb.name };
}
