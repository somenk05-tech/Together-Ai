/**
 * The conditions this form offers, and what each is called on screen.
 *
 * ONE LIST, MIRRORED AND GUARDED — the values must match `HEALTH_CONDITIONS`,
 * `TRIMESTERS` and `KIDNEY_STAGES` in the API's `shared/health-conditions.ts`,
 * which is what the server validates against. `health-conditions-picker.test.ts`
 * reads that file and fails on drift, the same way the blood group and
 * relationship status pairs are guarded — §15.1 and the beautyGender bug are
 * both "two lists for one answer, and the value that looks right never matches".
 *
 * WHAT IS NOT OFFERED, and why the absence is deliberate: 'glycemic',
 * 'dyslipidemia', 'inflammation' and 'anemia' are conclusions drawn from a lab
 * report, not things a citizen declares, and the API refuses them. Putting them
 * in a tick list would let somebody turn a lab result off about themselves, or
 * on. 'anaemia' IS here — a doctor can tell you that you have it — and it
 * arrives by being ticked, never by being inferred.
 */
export const HEALTH_CONDITION_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'diabetes', label: 'Diabetes' },
  { value: 'hypertension', label: 'High blood pressure' },
  { value: 'highCholesterol', label: 'High cholesterol' },
  { value: 'kidney', label: 'Kidney disease' },
  { value: 'fattyLiver', label: 'Fatty liver' },
  { value: 'gout', label: 'Gout / high uric acid' },
  { value: 'pcos', label: 'PCOS' },
  { value: 'thyroid', label: 'Thyroid condition' },
  { value: 'anaemia', label: 'Anaemia' },
  { value: 'jointPain', label: 'Joint sensitivity' },
  { value: 'pregnancy', label: 'Pregnancy' },
  { value: 'breastfeeding', label: 'Breastfeeding' },
];

/** Pregnancy's qualifier. The blank option above these means NOT ANSWERED;
 *  'unstated' means answered and would rather not say. Two silences, two
 *  sentences — the distinction blood group draws with "I don't know". */
export const TRIMESTER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'first', label: 'First trimester' },
  { value: 'second', label: 'Second trimester' },
  { value: 'third', label: 'Third trimester' },
  { value: 'unstated', label: 'I’d rather not say' },
];

/** Kidney's qualifier — three different protein ceilings, not three shades of
 *  the same one. */
export const KIDNEY_STAGE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'early', label: 'Stage 1–2' },
  { value: 'late', label: 'Stage 3–5, not on dialysis' },
  { value: 'dialysis', label: 'On dialysis' },
  { value: 'unstated', label: 'I don’t know the stage' },
];

/** Asked, and nothing ticked. Matches NONE_DECLARED on the server. */
const NONE_DECLARED = 'none';

/** The ticked keys a stored column holds. Unknown values are ignored rather
 *  than rendered — a checkbox for a key this build has no label for would be a
 *  blank box the citizen cannot interpret. */
export function declaredKeys(raw: string | null | undefined): string[] {
  if (!raw || raw === NONE_DECLARED) return [];
  const known = new Set(HEALTH_CONDITION_OPTIONS.map((o) => o.value));
  return raw.split(',').map((s) => s.trim()).filter((s) => known.has(s));
}

/** Whether anybody has ever asked. `null` is not the same as an empty answer,
 *  and the two read differently on the health record. */
export function wasAsked(raw: string | null | undefined): boolean {
  return raw != null && raw !== '';
}

/** What the health record says, given the column and its two qualifiers. One
 *  formatter, so the record and the picker cannot describe a row differently. */
export function declaredSummary(
  raw: string | null | undefined,
  trimester?: string | null,
  stage?: string | null,
): string {
  if (!wasAsked(raw)) return '';
  const keys = declaredKeys(raw);
  if (!keys.length) return 'You told us you have none of the conditions we asked about';
  const label = (v: string) => HEALTH_CONDITION_OPTIONS.find((o) => o.value === v)?.label ?? v;
  return keys.map((k) => {
    if (k === 'pregnancy' && trimester) {
      return `${label(k)} (${TRIMESTER_OPTIONS.find((o) => o.value === trimester)?.label ?? trimester})`;
    }
    if (k === 'kidney' && stage) {
      return `${label(k)} (${KIDNEY_STAGE_OPTIONS.find((o) => o.value === stage)?.label ?? stage})`;
    }
    return label(k);
  }).join(' · ');
}
