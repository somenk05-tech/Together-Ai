/**
 * What the Beauty profile form sends when it saves.
 *
 * The form is seeded with `{ ...EMPTY, ...saved }`, and `saved` is the whole
 * `extras` blob — including `aiEstimated`, the analysis's record of which
 * answers it guessed. Sending that object back turned every save after an
 * analysis into a 400 (3 Sep). The form owns its answers and nothing else, so
 * the payload is the answers and nothing else; the flags stay the server's.
 */
export const FORM_FIELDS = [
  'age', 'gender', 'heightCm', 'weightKg', 'city', 'occupation', 'lifestyle',
  'skinType', 'skinTone', 'undertone', 'skinGoals', 'skinConcerns',
  'hairType', 'hairThickness', 'hairDensity', 'hairTexture', 'hairGoals', 'hairConcerns', 'scalpType',
  'routine', 'allergies', 'medicalConditions', 'budget',
] as const;

export type FormField = (typeof FORM_FIELDS)[number];

export function profilePayload(form: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of FORM_FIELDS) if (form[k] !== undefined) out[k] = form[k];
  return out;
}

/** The one line shown when a save fails: the server's sentence if it sent one. */
export function saveFailureMessage(err: unknown): string {
  const msg: unknown = (err as { response?: { data?: { message?: unknown } } } | undefined)?.response?.data?.message;
  const text: unknown = Array.isArray(msg) ? (msg as unknown[])[0] : msg;
  return typeof text === 'string' && text.trim()
    ? `Your profile wasn't saved — ${text.trim()}`
    : "Your profile wasn't saved — please check your connection and tap Save again.";
}
