/**
 * Personal factors that make guidance genuinely personal — beyond the Sun sign.
 * All symbolic INPUTS to guidance, never presented as guaranteed outcomes.
 *
 *  - Numerology (Pythagorean): Life Path + Personal Year / Month / Day cycles.
 *  - Vimshottari Dasha: the currently-running Mahadasha (+ approx Antardasha)
 *    from the sidereal Moon longitude at birth.
 */

/** Reduce to a single digit, preserving master numbers 11/22/33 when asked. */
export function reduceDigits(n: number, keepMasters = true): number {
  let x = Math.abs(Math.trunc(n));
  while (x > 9 && !(keepMasters && (x === 11 || x === 22 || x === 33))) {
    x = String(x).split('').reduce((s, d) => s + Number(d), 0);
  }
  return x;
}

export interface Numerology {
  lifePath: number;
  personalYear: number;
  personalMonth: number;
  personalDay: number;
  lifePathMeaning: string;
  yearTheme: string;
  dayFocus: string;
}

const MEANING: Record<number, string> = {
  1: 'new beginnings, initiative and self-belief',
  2: 'partnership, patience and gentle diplomacy',
  3: 'expression, creativity and connection',
  4: 'structure, effort and steady foundations',
  5: 'change, freedom and adaptability',
  6: 'responsibility, care and home',
  7: 'reflection, learning and inner work',
  8: 'ambition, resources and tangible results',
  9: 'completion, release and compassion',
  11: 'intuition, inspiration and a wider vision',
  22: 'building something lasting, step by step',
  33: 'service, teaching and warmth toward others',
};

const DAY_FOCUS: Record<number, string> = {
  1: 'starting something and backing yourself',
  2: 'cooperation and unhurried progress',
  3: 'communicating, creating and staying light',
  4: 'getting organised and doing the real work',
  5: 'staying flexible as plans shift',
  6: 'caring for people and your space',
  7: 'stepping back to think and recharge',
  8: 'money, work and practical decisions',
  9: 'finishing and releasing what is already done',
};

/** Compute numerology for a birth date, relative to `today`. */
export function computeNumerology(birth: Date, today: Date): Numerology {
  const bMonth = birth.getUTCMonth() + 1;
  const bDay = birth.getUTCDate();
  const bYear = birth.getUTCFullYear();
  const lifePath = reduceDigits(reduceDigits(bMonth) + reduceDigits(bDay) + reduceDigits(bYear));
  const personalYear = reduceDigits(reduceDigits(bMonth) + reduceDigits(bDay) + reduceDigits(today.getUTCFullYear()), false);
  const personalMonth = reduceDigits(personalYear + (today.getUTCMonth() + 1), false);
  const personalDay = reduceDigits(personalMonth + today.getUTCDate(), false);
  return {
    lifePath, personalYear, personalMonth, personalDay,
    lifePathMeaning: MEANING[lifePath] ?? MEANING[reduceDigits(lifePath, false)] ?? '',
    yearTheme: MEANING[personalYear] ?? '',
    dayFocus: DAY_FOCUS[personalDay] ?? 'a balanced, ordinary day',
  };
}

// ───────────────────────── Vimshottari Dasha ─────────────────────────

export const DASHA_LORDS = ['Ketu', 'Venus', 'Sun', 'Moon', 'Mars', 'Rahu', 'Jupiter', 'Saturn', 'Mercury'] as const;
export type DashaLord = typeof DASHA_LORDS[number];
const DASHA_YEARS: Record<DashaLord, number> = { Ketu: 7, Venus: 20, Sun: 6, Moon: 10, Mars: 7, Rahu: 18, Jupiter: 16, Saturn: 19, Mercury: 17 };
const TOTAL_YEARS = 120; // sum of the nine periods
const YEAR_MS = 365.2425 * 24 * 3600 * 1000;

export const DASHA_THEME: Record<DashaLord, string> = {
  Ketu: 'letting go, simplifying and inner focus',
  Venus: 'relationships, comfort, art and enjoyment',
  Sun: 'confidence, recognition and leadership',
  Moon: 'emotions, home, care and belonging',
  Mars: 'drive, courage, effort and action',
  Rahu: 'ambition, the new and worldly growth',
  Jupiter: 'wisdom, learning, expansion and good counsel',
  Saturn: 'discipline, patience and long, honest work',
  Mercury: 'communication, learning, skill and business',
};

export interface Dasha { maha: DashaLord; antar: DashaLord; theme: string }

/**
 * The currently-running Mahadasha + Antardasha from the sidereal Moon longitude
 * at birth (degrees, 0–360). The Mahadasha is exact; the Antardasha is a close
 * proportional approximation (good enough for symbolic guidance).
 */
export function vimshottariDasha(moonSiderealLon: number, birth: Date, today: Date): Dasha {
  const nakSize = 360 / 27; // 13°20′ per nakshatra
  const pos = ((moonSiderealLon % 360) + 360) % 360;
  const nak = Math.floor(pos / nakSize); // 0..26
  const fraction = (pos - nak * nakSize) / nakSize; // portion of the nakshatra already traversed
  let idx = nak % 9; // starting Mahadasha lord index
  let segYears = (1 - fraction) * DASHA_YEARS[DASHA_LORDS[idx]]; // balance at birth

  let elapsed = Math.max(0, (today.getTime() - birth.getTime()) / YEAR_MS);
  while (elapsed > segYears) {
    elapsed -= segYears;
    idx = (idx + 1) % 9;
    segYears = DASHA_YEARS[DASHA_LORDS[idx]];
  }
  const maha = DASHA_LORDS[idx];

  // Antardasha: sub-periods within the Mahadasha, proportional to each lord's
  // years, starting from the Mahadasha lord.
  const mahaYears = DASHA_YEARS[maha];
  let acc = 0;
  let antar: DashaLord = maha;
  for (let k = 0; k < 9; k++) {
    const sub = DASHA_LORDS[(idx + k) % 9];
    const subYears = (mahaYears * DASHA_YEARS[sub]) / TOTAL_YEARS;
    if (elapsed < acc + subYears) { antar = sub; break; }
    acc += subYears;
  }
  return { maha, antar, theme: DASHA_THEME[maha] };
}
