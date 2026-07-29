/**
 * The summary figure for one blood panel.
 *
 * Pulled out of MedicalService so it can be tested without a database. It was
 * four lines buried inside a 200-line method, which is part of why it went so
 * long without anyone noticing what it did.
 *
 * WHAT THIS IS: the weighted share of the markers on THIS panel that came back
 * within their reference range, less a deduction for critical results.
 *
 * WHAT THIS IS NOT: a clinical index. There is no standard 0–100 score for a
 * blood panel, and this one should never be read as a measure of a person's
 * health. `panelScoreBasis()` states that to the citizen, and every surface
 * that shows the number is expected to show the basis with it.
 *
 * The previous formula was `100 − (abnormal × 8)`, which failed in two ways.
 * It counted abnormalities rather than measuring a proportion, so a thorough
 * panel could only score worse than a sparse one — twenty markers with three
 * out of range scored 76, three markers with one out of range scored 92. The
 * more carefully someone investigated their health, the worse the app told them
 * it was, which is exactly the wrong incentive to put next to real blood
 * results. And every marker cost the same 8 points, so marginally low vitamin D
 * weighed as heavily as dangerous HbA1c.
 */

/** Clinical significance per marker — the same weights that order the priority
 *  list, which the score previously ignored. Unlisted markers get 3. */
export const MARKER_WEIGHT: Record<string, number> = {
  hb: 9, hba1c: 9, trig: 8, ldl: 7, crp: 7, ferritin: 6, b12: 5, folate: 5, vitd: 4,
};
export const DEFAULT_MARKER_WEIGHT = 3;

/** Deduction per critical result. A red flag is a fact about the person, not a
 *  proportion — a panel can be mostly in range and still hold one value that
 *  needs a doctor today. */
const URGENT_PENALTY = 18;
const ALERT_PENALTY = 12;

/** Floor, so a difficult panel never reads as zero and nothing else. */
const MIN_SCORE = 5;

export interface ScorableMarker { key: string; status: string }
export interface ScorableAlert { urgent: boolean }

export const weightOf = (key: string): number => MARKER_WEIGHT[key] ?? DEFAULT_MARKER_WEIGHT;

export function panelScore(markers: ScorableMarker[], alerts: ScorableAlert[] = []): number {
  const totalWeight = markers.reduce((sum, m) => sum + weightOf(m.key), 0);
  // Nothing measured → nothing to summarise. Reporting 100/100 for a panel we
  // could not read would be the most misleading answer available.
  if (totalWeight === 0) return 0;

  const inRangeWeight = markers
    .filter((m) => m.status === 'normal')
    .reduce((sum, m) => sum + weightOf(m.key), 0);

  let score = (inRangeWeight / totalWeight) * 100;
  for (const a of alerts) score -= a.urgent ? URGENT_PENALTY : ALERT_PENALTY;
  return Math.max(MIN_SCORE, Math.min(100, Math.round(score)));
}

export function panelBand(score: number): string {
  return score >= 85 ? 'Excellent' : score >= 70 ? 'Good' : score >= 55 ? 'Fair' : 'Needs attention';
}

/** Plain-English statement of what the number counted. Never optional. */
export function panelScoreBasis(markers: ScorableMarker[], alerts: ScorableAlert[] = []): string {
  if (!markers.length) return 'No markers could be read from this report, so there is nothing to summarise.';
  const n = markers.length;
  return `Share of the ${n} marker${n === 1 ? '' : 's'} on this panel that came back within their reference range, `
    + 'weighted by clinical significance'
    + (alerts.length ? `, less a deduction for ${alerts.length} critical result${alerts.length === 1 ? '' : 's'}` : '')
    + '. It summarises this report only — it is not a clinical index or a measure of overall health.';
}
