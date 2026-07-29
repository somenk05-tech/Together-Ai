/**
 * A wellness score from what the citizen has actually measured.
 *
 * The brief's complaint was specific: the score must not default to zero when
 * measurements exist, and somebody without enough data should be told so rather
 * than handed a fabricated number. Both are structural here — a component with
 * no data is `missing` and contributes nothing, and when too little is known the
 * whole thing returns `incomplete` with a null score and the exact fields to
 * fill in.
 *
 * Deliberately NOT a medical assessment. It counts habits and measurements the
 * citizen chose to record; it diagnoses nothing. Following the precedent already
 * set in the medical hub — "a score with no stated basis is a claim" — every
 * response carries the basis in plain English.
 *
 * Pure: no database, no clock, no profile lookup.
 */

export type ComponentState = 'computed' | 'missing';
export type ScoreState = 'computed' | 'incomplete' | 'unavailable';

export interface ScoreComponent {
  key: 'body' | 'activity' | 'markers' | 'sleep';
  label: string;
  weight: number;
  state: ComponentState;
  /** 0–100 when computed, null when missing. */
  value: number | null;
  detail: string;
  /** Field names the citizen would need to fill in for this to compute. */
  missing: string[];
}

export interface HealthScoreResult {
  state: ScoreState;
  score: number | null;
  band: string | null;
  basis: string;
  components: ScoreComponent[];
  missingFields: string[];
  disclaimer: string;
}

export interface HealthInputs {
  heightCm?: number | null;
  weightKg?: number | null;
  /** Sessions and minutes recorded in the last 30 days. */
  workoutsLast30?: number | null;
  workoutMinutesLast30?: number | null;
  /** Weighted share of the latest blood panel that came back in range, 0–1. */
  markersInRange?: number | null;
  /** Not stored anywhere in this codebase today — see the component's detail. */
  sleepHours?: number | null;
}

export const HEALTH_DISCLAIMER =
  'A wellness summary of what you have recorded — not a medical assessment, a diagnosis, or a substitute ' +
  'for advice from a clinician. It reflects only the measurements you have entered.';

/** At least this share of the total weight must be measurable to show a number. */
const MIN_COVERAGE = 0.5;

const WEIGHTS = { body: 30, activity: 35, markers: 25, sleep: 10 } as const;

/**
 * BMI as a band, scored generously and floored well above zero.
 *
 * BMI is a population statistic, not a verdict on a person — it says nothing
 * about muscle, frame or history. So it moves the score rather than deciding it,
 * and the floor is 40: being outside a healthy band is not zero health, and a
 * score that says so would be both wrong and unkind.
 */
function bodyScore(heightCm: number, weightKg: number): { value: number; detail: string } {
  const m = heightCm / 100;
  const bmi = weightKg / (m * m);
  const rounded = Math.round(bmi * 10) / 10;

  if (bmi >= 18.5 && bmi < 25) return { value: 100, detail: `BMI ${rounded} — within the healthy range.` };
  const distance = bmi < 18.5 ? 18.5 - bmi : bmi - 24.9;
  // 8 points per BMI unit outside the band, floored at 40.
  const value = Math.max(40, Math.round(100 - distance * 8));
  const side = bmi < 18.5 ? 'below' : 'above';
  return { value, detail: `BMI ${rounded} — ${side} the healthy range. BMI is a population measure, not an individual diagnosis.` };
}

/**
 * Activity against the widely used 150 minutes a week of moderate movement.
 *
 * Sessions matter as well as minutes: one long workout a month is not the same
 * as moving regularly, so consistency carries a third of this component.
 */
function activityScore(sessions: number, minutes: number): { value: number; detail: string } {
  const minuteTarget = 600; // 150/week over 30 days
  const sessionTarget = 12; // three a week
  const minutePart = Math.min(1, minutes / minuteTarget);
  const sessionPart = Math.min(1, sessions / sessionTarget);
  const value = Math.round((minutePart * 0.67 + sessionPart * 0.33) * 100);
  return {
    value,
    detail: `${minutes} minutes across ${sessions} session${sessions === 1 ? '' : 's'} in the last 30 days, against 150 minutes a week.`,
  };
}

export function computeHealthScore(inputs: HealthInputs): HealthScoreResult {
  const components: ScoreComponent[] = [];

  // ── Body ──
  if (inputs.heightCm && inputs.weightKg && inputs.heightCm >= 50) {
    const { value, detail } = bodyScore(inputs.heightCm, inputs.weightKg);
    components.push({ key: 'body', label: 'Body measurements', weight: WEIGHTS.body, state: 'computed', value, detail, missing: [] });
  } else {
    components.push({
      key: 'body', label: 'Body measurements', weight: WEIGHTS.body, state: 'missing', value: null,
      detail: 'Add your height and weight to include this.',
      missing: [...(inputs.heightCm ? [] : ['heightCm']), ...(inputs.weightKg ? [] : ['weightKg'])],
    });
  }

  // ── Activity ──
  const sessions = inputs.workoutsLast30 ?? null;
  const minutes = inputs.workoutMinutesLast30 ?? null;
  if (sessions !== null && minutes !== null) {
    const { value, detail } = activityScore(sessions, minutes);
    components.push({ key: 'activity', label: 'Movement', weight: WEIGHTS.activity, state: 'computed', value, detail, missing: [] });
  } else {
    components.push({
      key: 'activity', label: 'Movement', weight: WEIGHTS.activity, state: 'missing', value: null,
      detail: 'Log a workout to include this.', missing: ['workouts'],
    });
  }

  // ── Blood markers ──
  if (inputs.markersInRange !== null && inputs.markersInRange !== undefined) {
    const value = Math.round(Math.max(0, Math.min(1, inputs.markersInRange)) * 100);
    components.push({
      key: 'markers', label: 'Blood results', weight: WEIGHTS.markers, state: 'computed', value,
      detail: `${value}% of the markers on your latest panel came back in range.`, missing: [],
    });
  } else {
    components.push({
      key: 'markers', label: 'Blood results', weight: WEIGHTS.markers, state: 'missing', value: null,
      detail: 'Upload a blood report to include this.', missing: ['bloodPanel'],
    });
  }

  // ── Sleep ──
  // Honest about the gap: nothing in this app records sleep yet, so this can
  // never compute today. Listed anyway so the score openly says what it is not
  // counting, rather than quietly weighting three things and calling it health.
  components.push({
    key: 'sleep', label: 'Sleep', weight: WEIGHTS.sleep, state: 'missing', value: null,
    detail: 'Sleep isn’t tracked in Together City yet, so it isn’t counted.',
    missing: ['sleep'],
  });

  const totalWeight = components.reduce((n, c) => n + c.weight, 0);
  const computed = components.filter((c) => c.state === 'computed');
  const coveredWeight = computed.reduce((n, c) => n + c.weight, 0);
  const missingFields = components.flatMap((c) => c.missing);

  if (coveredWeight === 0) {
    return {
      state: 'unavailable', score: null, band: null,
      basis: 'Nothing has been recorded yet, so there is nothing to summarise.',
      components, missingFields, disclaimer: HEALTH_DISCLAIMER,
    };
  }

  if (coveredWeight / totalWeight < MIN_COVERAGE) {
    return {
      state: 'incomplete', score: null, band: null,
      basis: `Not enough recorded yet for a meaningful summary — ${computed.map((c) => c.label.toLowerCase()).join(' and ')} alone would not be a fair picture.`,
      components, missingFields, disclaimer: HEALTH_DISCLAIMER,
    };
  }

  // Weighted mean over the components that actually have data — a missing
  // component drops out of the average rather than scoring zero into it.
  const score = Math.round(computed.reduce((n, c) => n + (c.value ?? 0) * c.weight, 0) / coveredWeight);

  return {
    state: 'computed',
    score,
    band: bandFor(score),
    basis: `Counts ${computed.map((c) => c.label.toLowerCase()).join(', ')}. Anything you haven’t recorded is left out rather than counted against you.`,
    components,
    missingFields,
    disclaimer: HEALTH_DISCLAIMER,
  };
}

function bandFor(score: number): string {
  if (score >= 85) return 'Strong';
  if (score >= 70) return 'Good';
  if (score >= 55) return 'Fair';
  return 'Worth attention';
}
