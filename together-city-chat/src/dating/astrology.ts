/**
 * Astrology-first compatibility (Relationship AI v1) — deterministic, explainable.
 * Sign → element → elemental affinity, blended with interest overlap. Produces a
 * stable 0–100 score for a pair, so "curated matches" never flicker between reloads.
 */

import { SIGNS as SIGNS12, siderealLon, sunLongitude } from '../astrology/astro-engine';

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

/** Capricorn is the sign that wraps the year end — 22 December to 19 January. */
const CAPRICORN = SIGNS[0];

/**
 * The same boundaries, in the order the calendar reaches them.
 *
 * `SIGNS` is written Capricorn-first because Capricorn opens the zodiac, but its
 * boundary (12, 22) is the LAST one of the year. The previous version walked
 * `SIGNS` in that order taking any sign whose boundary was not after the
 * birthday, with no break — so for a December date, Sagittarius (11, 22) at the
 * end of the array satisfied `m > 11` and overwrote the correct answer. Ten
 * days, 22 to 31 December, came back Sagittarius.
 *
 * That is not a cosmetic mislabel. Capricorn is EARTH, Sagittarius is FIRE, the
 * element is the whole of what `AFFINITY` scores, and astrology carries 50% of
 * the match weight. Everyone born in the last ten days of December had every
 * compatibility score computed from the wrong element — theirs, and everyone
 * else's score for them. 1–19 January was right only by accident, by matching
 * nothing and falling through to the initial value.
 */
const CALENDAR = [...SIGNS.slice(1), CAPRICORN];

export function tropicalSign(birthDate: Date): { name: string; element: Element } {
  const m = birthDate.getUTCMonth() + 1;
  const d = birthDate.getUTCDate();
  // The latest boundary the calendar has reached by this date. Capricorn is the
  // answer at both ends of the year: explicitly from its own boundary on 22
  // December, and by falling through for 1–19 January, which is before the
  // year's first boundary. That wrap is the case the old walk could not express.
  let match = CAPRICORN;
  for (const s of CALENDAR) {
    const [sm, sd] = s.from;
    if (m > sm || (m === sm && d >= sd)) match = s;
  }
  return { name: match.name, element: match.element };
}

/**
 * THE CITY HAD TWO ZODIACS AND DATING WAS USING THE OTHER ONE.
 *
 * The Astrology Zone computes SIDEREAL (Vedic) placements — `astro-engine.ts`
 * subtracts the Lahiri ayanamsa, and its header says so: "authentic Vedic
 * astrology (Jyotish): every sign placement is SIDEREAL". Dating computed a
 * tropical Western sun sign from the fixed calendar boundaries above.
 *
 * Checked date by date against the app's own engine over 1,344 birth dates, the
 * two agree on 21.5%. Adjacent signs are always different ELEMENTS, and the
 * element is the whole of what `AFFINITY` reads — so 78.5% of citizens were
 * matched on an element the same product tells them is not theirs, on the factor
 * carrying most of the weight. At astrology 0.90 that is not a detail.
 *
 * So Dating now asks the same engine the Astrology Zone asks. Two consequences
 * worth knowing before this ships: every citizen's sign on their card changes,
 * and every cached pair score is recomputed. `DATING_ZODIAC=tropical` restores
 * the Western reading in one env var, and `tropicalSign` above is kept whole
 * (and still tested) so that reversal is a setting rather than a rewrite.
 *
 * Memoised on the birth date, because this is now an ephemeris call on a path
 * that runs once per candidate per request.
 */
const SIGN_ELEMENTS: Element[] = ['fire', 'earth', 'air', 'water'];
const vedicCache = new Map<number, { name: string; element: Element }>();

export function vedicSign(birthDate: Date): { name: string; element: Element } {
  const key = birthDate.getTime();
  const hit = vedicCache.get(key);
  if (hit) return hit;
  const jd = key / 86400000 + 2440587.5;
  const lon = siderealLon(sunLongitude(jd), jd);
  const idx = Math.floor(((lon % 360) + 360) % 360 / 30);
  const out = { name: SIGNS12[idx], element: SIGN_ELEMENTS[idx % 4] };
  // Unbounded growth is not a risk here: the key space is one entry per distinct
  // birth date, and the population that shares this process is finite and small.
  vedicCache.set(key, out);
  return out;
}

export function zodiacSign(birthDate: Date): { name: string; element: Element } {
  return process.env.DATING_ZODIAC === 'tropical' ? tropicalSign(birthDate) : vedicSign(birthDate);
}

/** Classical elemental affinity: same element ≥ complementary ≥ neutral ≥ clashing. */
const AFFINITY: Record<Element, Record<Element, number>> = {
  fire: { fire: 88, air: 92, earth: 62, water: 58 },
  air: { air: 86, fire: 92, water: 64, earth: 60 },
  earth: { earth: 88, water: 92, fire: 62, air: 60 },
  water: { water: 86, earth: 92, air: 64, fire: 58 },
};

/**
 * ── THE CHART, NOT JUST THE SUN, AND NO DICE (owner, 5 Sep) ──────────────────
 *
 * Two things were wrong with the number under every card. It was the Sun
 * sign alone, though the city collects birth time and place and the Astrology
 * Zone already casts the whole chart from them. And it carried a per-pair
 * hash — `-4 + (0..8)` — a stable random nudge so two pairs with the same
 * signs did not read the same, which is to say the compatibility figure was
 * partly dice, inside the factor that weighs 0.90 of the score.
 *
 * Now: the Sun sign's elemental affinity, the MOON sign's when both have one
 * (every citizen with a birth date does — the Moon needs no time), and the
 * ASCENDANT's when both have a birth time and place. Vedic practice puts the
 * Moon at the centre of a match, so it carries as much as the Sun; the
 * ascendant, being the most time-sensitive, carries less and only when it is
 * actually known. No jitter: two pairs with the same charts read the same,
 * and a number a citizen decides on is a number the same inputs reproduce.
 */
export interface NatalSigns { moon?: string | null; ascendant?: string | null }

const ELEMENT_OF: Record<string, Element> = Object.fromEntries(
  SIGNS12.map((name, i) => [name, (['fire', 'earth', 'air', 'water'] as Element[])[i % 4]]),
);
const elementOf = (sign: string | null | undefined): Element | null => (sign ? ELEMENT_OF[sign] ?? null : null);

/** The three affinities, weighted over what is actually known. */
export function chartAffinity(
  sunA: Element, sunB: Element, natalA: NatalSigns = {}, natalB: NatalSigns = {},
): { base: number; layers: Array<'sun' | 'moon' | 'ascendant'> } {
  const parts: Array<{ w: number; v: number; layer: 'sun' | 'moon' | 'ascendant' }> = [
    { w: 0.4, v: AFFINITY[sunA][sunB], layer: 'sun' },
  ];
  const moonA = elementOf(natalA.moon); const moonB = elementOf(natalB.moon);
  if (moonA && moonB) parts.push({ w: 0.4, v: AFFINITY[moonA][moonB], layer: 'moon' });
  const ascA = elementOf(natalA.ascendant); const ascB = elementOf(natalB.ascendant);
  if (ascA && ascB) parts.push({ w: 0.2, v: AFFINITY[ascA][ascB], layer: 'ascendant' });
  const total = parts.reduce((s, p) => s + p.w, 0);
  const base = Math.round(parts.reduce((s, p) => s + p.w * p.v, 0) / total);
  return { base, layers: parts.map((p) => p.layer) };
}

export function compatibilityScore(
  a: { userId: string; birthDate: Date; interests: string[]; natal?: NatalSigns },
  b: { userId: string; birthDate: Date; interests: string[]; natal?: NatalSigns },
): { score: number; signA: string; signB: string; layers: Array<'sun' | 'moon' | 'ascendant'> } {
  const sa = zodiacSign(a.birthDate);
  const sb = zodiacSign(b.birthDate);
  const { base, layers } = chartAffinity(sa.element, sb.element, a.natal, b.natal);

  // ANTI-GAMING (1M run, §13). This was `min(8, shared x 2)` — a RAW COUNT, so
  // a profile that ticked every interest the form offers collected the full +8
  // against everybody, permanently. It is an overlap ratio now, exactly like
  // `overlapPct` in matching.ts: two people who listed the same three interests
  // still get 8; somebody who listed all fourteen against those three gets 2.
  const setA = new Set(a.interests.map((i) => i.toLowerCase()));
  const setB = new Set(b.interests.map((i) => i.toLowerCase()));
  const shared = [...setB].filter((i) => setA.has(i)).length;
  const union = new Set([...setA, ...setB]).size;
  const interestBonus = union ? Math.round(8 * (shared / union)) : 0;

  const score = Math.min(99, base + interestBonus);
  return { score, signA: sa.name, signB: sb.name, layers };
}
