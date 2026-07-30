import type { HealthScoreResult } from './health-score';

/**
 * When to offer the Optimal Health plan (FE-8.1, p9).
 *
 * The review's note is that the Optimal Health section should appear only when
 * there is something for it to improve; above the threshold it collapses to a
 * one-line confirmation instead of presenting a second plan to somebody whose
 * numbers are already fine.
 *
 * The ticket's engineering requirement is the part worth being careful about:
 * "Threshold comes from config, not a magic number in the component." A number
 * living in a component is a number nobody can find, and this one decides
 * whether a citizen is shown clinical guidance at all.
 */

/**
 * Gating is on the OVERALL score, decided by the product owner rather than
 * inferred. Per-dimension gating was the alternative and would surface a single
 * weak dimension inside an otherwise good score; that trade is theirs to make,
 * and this file is where it changes if they change their mind.
 */
export const OPTIMAL_HEALTH_THRESHOLD = 80;

export interface OptimalHealthGate {
  /** Whether to offer the Optimal Health plan as a real alternative. */
  show: boolean;
  threshold: number;
  score: number | null;
  /** One line, for when it is collapsed. Empty when the section is shown. */
  confirmation: string;
  /** Why the gate landed where it did — for a support conversation, not the UI. */
  because: 'below-threshold' | 'at-or-above-threshold' | 'score-unknown';
}

/**
 * An UNKNOWN score shows the section.
 *
 * This is the decision in this file that could quietly do harm. A null score
 * means the citizen has not recorded enough for the app to judge — no blood
 * panel, no weight — and the tempting reading is "nothing to fix, collapse it".
 * That is absence of evidence being treated as evidence of health, and it would
 * hide clinical guidance from precisely the people the app knows least about.
 *
 * So the gate fails OPEN. Offering a plan to somebody who turns out not to need
 * it costs them a tab; hiding one from somebody who does costs more.
 */
export function optimalHealthGate(result: Pick<HealthScoreResult, 'score'>): OptimalHealthGate {
  const score = result.score;

  if (score === null || !Number.isFinite(score)) {
    return {
      show: true, threshold: OPTIMAL_HEALTH_THRESHOLD, score: null,
      confirmation: '', because: 'score-unknown',
    };
  }

  if (score < OPTIMAL_HEALTH_THRESHOLD) {
    return {
      show: true, threshold: OPTIMAL_HEALTH_THRESHOLD, score,
      confirmation: '', because: 'below-threshold',
    };
  }

  return {
    show: false, threshold: OPTIMAL_HEALTH_THRESHOLD, score,
    // Says what was measured and what it means, rather than "you're fine" —
    // this is a score built from what they recorded, not a verdict on them.
    confirmation: `Your recorded markers are in good shape (${score}/100), so your own preferences `
      + 'already make a sound plan. Nothing here needs correcting.',
    because: 'at-or-above-threshold',
  };
}
