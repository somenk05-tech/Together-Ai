/**
 * The blood groups this form offers, and what each is called on screen.
 *
 * ONE LIST, MIRRORED ON PURPOSE — and guarded. The values here must match
 * `BLOOD_GROUPS` in the API's `shared/blood-group.ts`, which is what the server
 * validates against and what `bloodGroupFrom()` can read back. Two vocabularies
 * for one answer is the §15.1 shape and the `beautyGender` bug: a value that
 * looks right and never matches. `blood-group-optional.test.ts` reads the API
 * file and fails if these two lists drift apart.
 *
 * The labels exist because 'hh+' is a storage key. Bombay (hh) is
 * ABO-independent but Rh still applies, so it carries a sign like every other
 * group — a single "Bombay" option would record a real fact and silently drop
 * the rest of the answer.
 */
export const BLOOD_GROUP_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'A+', label: 'A+' },
  { value: 'A-', label: 'A−' },
  { value: 'B+', label: 'B+' },
  { value: 'B-', label: 'B−' },
  { value: 'AB+', label: 'AB+' },
  { value: 'AB-', label: 'AB−' },
  { value: 'O+', label: 'O+' },
  { value: 'O-', label: 'O−' },
  { value: 'hh+', label: 'Bombay (hh) +' },
  { value: 'hh-', label: 'Bombay (hh) −' },
];

/** What a screen shows for a stored group. Never the raw key. */
export function bloodGroupLabel(stored: string): string {
  return BLOOD_GROUP_OPTIONS.find((o) => o.value === stored)?.label ?? stored;
}
