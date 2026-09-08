/**
 * ── HOW OLD IS THE CHILD, AND WHAT DOES THAT MEAN FOR A SHELF ───────────────
 *
 * The age is DERIVED FROM THE BIRTHDAY EVERY TIME IT IS ASKED FOR and is never
 * stored. A stored age or a stored band is wrong the morning after it is
 * written, and the one thing this hub promises is a shelf that keeps up with a
 * child who is changing every month.
 *
 * WHOLE MONTHS, COUNTED THE WAY A PARENT COUNTS THEM: a baby born on the 14th
 * is "three months" on the 14th of the third month after, not on the 13th. The
 * arithmetic is calendar months plus a day comparison rather than a division by
 * 30.44 — a child born on 31 January is one month old on 28 February, and only
 * the calendar knows that.
 */

import type { AgeBand } from './types';

/** The bands, in the order a child passes through them. */
export const BANDS: readonly AgeBand[] = ['0-6m', '6-12m', '1-2y', '2-4y', '4-7y', '7-10y'];

/** The lower edge of each band, in whole months. */
const FLOOR: Record<AgeBand, number> = {
  '0-6m': 0, '6-12m': 6, '1-2y': 12, '2-4y': 24, '4-7y': 48, '7-10y': 84,
};

/** What a band is called where a parent reads it. */
export const BAND_LABEL: Record<AgeBand, string> = {
  '0-6m': 'Newborn · 0-6 months',
  '6-12m': '6-12 months',
  '1-2y': '1-2 years',
  '2-4y': '2-4 years',
  '4-7y': '4-7 years',
  '7-10y': '7-10 years',
};

/**
 * WHOLE MONTHS BETWEEN A BIRTHDAY AND A DAY.
 *
 * `null` for a date that is not a date, or one in the future. A future birthday
 * is a real thing a parent types — an expected baby — and answering "minus two
 * months old" would put that child on a shelf. The hub says "not yet born"
 * instead and shows the newborn band without pretending it is personalised.
 */
export function monthsOld(dob: string | null, on: Date = new Date()): number | null {
  if (!dob || !/^\d{4}-\d{2}-\d{2}$/.test(dob)) return null;
  const [y, m, d] = dob.split('-').map(Number);
  const born = new Date(Date.UTC(y, m - 1, d));
  if (born.getUTCFullYear() !== y || born.getUTCMonth() !== m - 1 || born.getUTCDate() !== d) return null;
  const today = new Date(Date.UTC(on.getUTCFullYear(), on.getUTCMonth(), on.getUTCDate()));
  if (born.getTime() > today.getTime()) return null;
  let months = (today.getUTCFullYear() - y) * 12 + (today.getUTCMonth() - (m - 1));
  if (today.getUTCDate() < d) months -= 1;
  return months;
}

/** The band a number of months falls in. Above 10 years there is no band, and
 *  the hub says the child has walked out of this district rather than pinning
 *  them to its last shelf. */
export function bandForMonths(months: number): AgeBand | null {
  if (months < 0 || months >= 120) return null;
  let found: AgeBand = '0-6m';
  for (const b of BANDS) if (months >= FLOOR[b]) found = b;
  return found;
}

/** The band a birthday puts a child in today. */
export function bandForDob(dob: string | null, on: Date = new Date()): AgeBand | null {
  const m = monthsOld(dob, on);
  return m === null ? null : bandForMonths(m);
}

/**
 * THE CHILD'S AGE, SAID THE WAY A PARENT SAYS IT.
 *
 * Under two years it is months, because "14 months" is how a parent answers and
 * "1 year" throws away the half that matters when you are buying for it. After
 * two it is years, for the same reason in reverse.
 */
export function ageWords(dob: string | null, on: Date = new Date()): string | null {
  const m = monthsOld(dob, on);
  if (m === null) return null;
  if (m < 24) return m === 1 ? '1 month' : `${m} months`;
  const years = Math.floor(m / 12);
  const rest = m % 12;
  if (rest === 0) return years === 1 ? '1 year' : `${years} years`;
  return `${years}y ${rest}m`;
}

/**
 * THE BAND THE NEXT BIRTHDAY-ISH MOMENT MOVES THEM INTO, and how far away it
 * is. Used by the essentials room to say "in six weeks this changes" — the one
 * thing a shelf built on an age can usefully tell a parent that a catalogue
 * cannot. Null once the child is past the last band.
 */
export function nextBand(dob: string | null, on: Date = new Date()): { band: AgeBand; inMonths: number } | null {
  const m = monthsOld(dob, on);
  if (m === null) return null;
  const here = bandForMonths(m);
  if (!here) return null;
  const i = BANDS.indexOf(here);
  const next = BANDS[i + 1];
  if (!next) return null;
  return { band: next, inMonths: FLOOR[next] - m };
}
