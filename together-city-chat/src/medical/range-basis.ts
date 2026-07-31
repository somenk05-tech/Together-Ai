/**
 * What a blood result's "normal" was measured against (BE-3.2a).
 *
 * The medical hub reports every marker against ONE band per marker, taken from
 * `biomarker-catalog.ts` or `clinical-engine.ts`. Those bands span the whole
 * adult population. The catalogue says so itself, in its own header: "reference
 * ranges (adult, educational — not a lab's exact assay range)".
 *
 * A band that covers two populations is wider than either one, so it under-calls
 * abnormality at one end for everybody in it. Haemoglobin is stated as 12–17.5
 * g/dL. A man at 12.4 is anaemic and clears that band, so `medical.service.ts`
 * marked him `normal`, `Records.tsx` printed "✓ All measured markers are within
 * range", and `panel-score.ts` counted his weight-9 marker as a clean pass and
 * scored the panel high. Creatinine 0.6–1.3 does the same to a woman at 1.25.
 *
 * This module does not fix the bands. It stops the app claiming they are the
 * citizen's. Nothing here asserts a clinical number — the only claim it makes is
 * about PROVENANCE, which is checkable from the codebase: we know where each
 * band came from, and a band we wrote for everybody is not a band matched to
 * anyone.
 *
 * The real fix is BE-3.2b: the report's own printed range. `report-parser.ts`
 * already locates it — `standaloneNumbers()` exists precisely to exclude
 * "13.0 - 17.0" so it isn't mistaken for a value — and then discards it. When
 * that range is captured, `basis` becomes 'own-report' for those markers, this
 * note stops applying to them, and the sex, age and assay are all correct
 * because the lab applied them. That is why this is an enum and not a boolean.
 */

export type RangeBasis =
  /** A single band we apply to every adult. Not matched to this citizen. */
  | 'general-adult'
  /** The range printed on this citizen's own report, by the lab that ran it. */
  | 'own-report';

/**
 * The basis every band we hold today actually has.
 *
 * Not a placeholder — a statement of fact about the codebase. `biomarker-catalog.ts`
 * and `clinical-engine.ts` are the only two sources of a range, and both hold one
 * band per marker covering the whole adult population. BE-3.2b is where this stops
 * being a constant: it becomes per-marker, and a marker whose range was read off
 * the citizen's own report returns 'own-report' instead. One place changes.
 */
export const CURRENT_BASIS: RangeBasis = 'general-adult';

/** Short attribution, shown beside the range on a marker row. */
export function basisLabel(basis: RangeBasis): string {
  return basis === 'own-report' ? 'your report’s range' : 'general adult range';
}

/** Only a range from the citizen's own report is matched to the citizen. */
export function matchedToCitizen(basis: RangeBasis): boolean {
  return basis === 'own-report';
}

/**
 * The note shown once per panel.
 *
 * Null when every band came from the citizen's own report — at that point there
 * is nothing to caveat, and a caveat that never goes away is one nobody reads.
 */
export function panelRangeNote(bases: readonly RangeBasis[]): string | null {
  const general = bases.filter((b) => b === 'general-adult').length;
  if (general === 0) return null;

  const scope = general === bases.length
    ? 'These are general adult ranges'
    : `${general} of these ${bases.length} ranges are general adult ranges`;

  return `${scope} — the same band for everyone. They are not matched to your sex at birth, `
    + 'your age, or the lab that ran your test, and for some markers those make a real '
    + 'difference. Read them alongside the ranges printed on your own report.';
}

export interface InRangeInput {
  /** One entry per marker that was measured on this panel. */
  bases: readonly RangeBasis[];
  /** How many of those came back outside their band. */
  outOfRange: number;
}

/**
 * The line that replaces "All measured markers are within range."
 *
 * Three rules, and the tests hold all three:
 *   1. A panel with nothing on it is not a clear panel. It says so.
 *   2. "Within range" is never stated without naming the range it was within.
 *   3. The out-of-range count is never softened. A caveat about the band is a
 *      reason to look harder at a pass, not to doubt a flag — the bands are
 *      wide, so a value that breaks one has broken the generous version.
 */
export function inRangeSummary({ bases, outOfRange }: InRangeInput): string {
  const total = bases.length;
  if (total === 0) {
    return 'No markers could be read from this report, so there is nothing to say about them yet.';
  }

  const marker = (n: number) => `${n} marker${n === 1 ? '' : 's'}`;

  if (outOfRange > 0) {
    return `${marker(outOfRange)} of ${total} came back outside ${outOfRange === 1 ? 'its' : 'their'} range.`;
  }

  const allOwn = bases.every((b) => b === 'own-report');
  return allOwn
    ? `All ${marker(total)} fell inside the ranges printed on your report.`
    : `All ${marker(total)} fell inside our general adult ranges.`;
}
