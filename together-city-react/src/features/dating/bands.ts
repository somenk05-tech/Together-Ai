/**
 * THE ONE TABLE EVERY DATING SCREEN READS A SCORE FROM.
 *
 * Bands, their names, their inks, and the sentence that says how much of a
 * number is an answer. Moved out of `components/MatchCards.tsx` because that
 * file also exports components, and react-refresh refuses to hot-reload a file
 * that exports both — and because the match detail page, the browse page and
 * the card all need these without needing each other.
 */
import type { CompatibilityBand, CuratedMatch } from './api';

/** A compatibility score's category (band + friendly name).
 *
 *  These are the categories the pool is counted in and the list is grouped by,
 *  so there has to be one for every score a card can carry. The 0–20 row is new:
 *  §15.2 removed the floor that used to drop those people before they reached
 *  the page, and a card with no category would have fallen through to a nameless
 *  "Match" while the histogram counted it somewhere the list did not.
 *
 *  THE INK IS PART OF THE BAND, and it is exported for the same reason the name
 *  is: the match detail page had its own three-row table with no floor, so a 9%
 *  opened as a green "Good Match" there and as "Little in common" here. One
 *  table, one vocabulary, one colour per band — a page that draws the name from
 *  this list and the colour from somewhere else is the same disagreement in a
 *  quieter form. */
const BAND_NAMES: [number, number, string, string][] = [
  [90, 100, 'Excellent match', 'var(--ok-ink)'], [80, 90, 'Great match', 'var(--ok-ink)'],
  [70, 80, 'Strong match', 'var(--ok-ink)'], [60, 70, 'Good match', 'var(--ok-ink)'],
  [50, 60, 'Fair match', 'var(--warn-ink)'], [40, 50, 'Modest match', 'var(--warn-ink)'],
  [30, 40, 'Low match', 'var(--danger-ink)'], [20, 30, 'Faint match', 'var(--danger-ink)'],
  [0, 20, 'Little in common', 'var(--danger-ink)'],
];
const inBand = (score: number, lo: number, hi: number) => score >= lo && (score < hi || (hi === 100 && score <= 100));

export function bandFor(score: number): { label: string; name: string; ink: string } {
  for (const [lo, hi, name, ink] of BAND_NAMES) {
    if (inBand(score, lo, hi)) return { label: `${lo}–${hi}%`, name, ink };
  }
  return { label: `${score}%`, name: 'Match', ink: 'var(--muted)' };
}

/**
 * HOW MUCH OF THE READING IS AN ANSWER, in one sentence.
 *
 * The server multiplies the score by a confidence factor and sends the number
 * with the reasoning folded in, so "51% because you are incompatible" and "51%
 * because we know almost nothing about either of you" arrive looking identical.
 * `coverage` is the share of the six answerable factors both people filled in;
 * saying how many of the six were answered gives the reason back in words a
 * citizen can act on — one of them can go and answer them.
 *
 * A percentage of a percentage would be the same opacity in a new coat, so this
 * counts questions. At coverage 1 there is nothing to say, and an absent field
 * says nothing rather than drawing an empty line.
 */
/**
 * THE SAME DISCLOSURE, SHORT ENOUGH FOR A CARD.
 *
 * `coverageNote` is a sentence, and it belongs where there is room for one — a
 * match detail, a compatibility sheet. It was rendered in exactly those two
 * places, and nowhere on the deck card or the matches list, which are the two
 * screens where a citizen READS THE NUMBER FIRST. "69% Compatible · Good match"
 * with nothing beside it is the whole finding.
 *
 * So: the same fact, in four words, in the line under the score. It counts
 * questions rather than showing a percentage of a percentage, for the reason
 * written above the sentence version — a citizen can go and answer a question,
 * and cannot do anything with a confidence multiplier.
 */
export function coverageShort(coverage?: number): string | null {
  if (typeof coverage !== 'number' || !Number.isFinite(coverage) || coverage >= 1) return null;
  const answered = Math.max(0, Math.min(6, Math.round(coverage * 6)));
  return answered === 0 ? 'From your birth dates alone' : `From ${answered} of 6 answers`;
}

export function coverageNote(coverage?: number): string | null {
  if (typeof coverage !== 'number' || !Number.isFinite(coverage) || coverage >= 1) return null;
  const answered = Math.max(0, Math.min(6, Math.round(coverage * 6)));
  if (answered === 0) {
    return 'Neither of you has answered any of the six questions behind this number — it is read from your birth dates alone.';
  }
  return `Only ${answered} of the six questions behind this number ${answered === 1 ? 'is' : 'are'} answered by you both — the rest is read from your birth dates.`;
}

/** The candidates grouped into those categories, best first, empty ones dropped.
 *  One pass over BAND_NAMES so the group headers, the counts in them and the
 *  histogram can never disagree about which category somebody is in. */
export function byCategory(matches: CuratedMatch[]): { name: string; label: string; matches: CuratedMatch[] }[] {
  return BAND_NAMES
    .map(([lo, hi, name]) => ({
      name,
      label: `${lo}–${hi}%`,
      matches: matches
        .filter((m) => inBand(m.score, lo, hi))
        .sort((a, b) => b.score - a.score),
    }))
    .filter((g) => g.matches.length > 0);
}

/**
 * The same histogram the server used to send, counted off the list on screen.
 *
 * `/dating/stack` computes a `distribution`; `/dating/discover` does not, and
 * Potential Matches is built on discover because discover is the endpoint that
 * returns EVERYONE. Counting the bands from the very array being rendered is
 * better than either: the summary cannot disagree with the list beneath it,
 * because it is made of it.
 */
export function bandsOf(matches: CuratedMatch[]): CompatibilityBand[] {
  return BAND_NAMES.map(([lo, hi]) => ({
    label: `${lo}–${hi}`,
    min: lo,
    max: hi,
    count: matches.filter((m) => inBand(m.score, lo, hi)).length,
  }));
}
