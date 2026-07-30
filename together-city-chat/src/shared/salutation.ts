/**
 * How Together City addresses a citizen (§4, FE-4.1).
 *
 * One formatter, because the alternative was twenty. `name.split(' ')[0]` is
 * written out by hand in twenty places across the two codebases, and at least
 * one of them was wrong: the blood-report narrative built its greeting from
 * `(user?.name ?? 'there').split(' ')[0]`, and `??` does not catch an empty
 * string — so a citizen who had never filled in their name was greeted
 * "Dear ," above their own lab results.
 *
 * The review's p4 asks for the report to open "Dear <name>". The spec files it
 * under the dashboard, but the screenshot is the blood-test reading, and that is
 * the screen where being addressed by name matters most — it is the one telling
 * somebody their haemoglobin is low.
 */

/** How long a display name may be before it stops being a name. */
const MAX = 40;

/**
 * The name to use when speaking to someone, or null when we have none.
 *
 * Splits on any whitespace, not just a space: names arrive from forms with tabs
 * and non-breaking spaces in them, and `split(' ')` leaves those attached.
 */
export function firstName(full?: string | null): string | null {
  const trimmed = (full ?? '').trim();
  if (!trimmed) return null;
  const first = trimmed.split(/\s+/)[0];
  if (!first) return null;
  // An email in the name field is somebody's sign-up mistake, not their name.
  // Better to use the part before the @ than to greet them "Dear a@b.com,".
  const cleaned = first.includes('@') ? first.split('@')[0] : first;
  return cleaned.slice(0, MAX) || null;
}

/**
 * The salutation, ready to print.
 *
 * "Dear user," when there is no name — the spec's wording, and deliberately not
 * "Dear there," or "Dear ,". It reads slightly formal, which is the right
 * register for the screen it was asked for.
 */
export function salutation(full?: string | null): string {
  return `Dear ${firstName(full) ?? 'user'},`;
}

/** For places that greet informally — the feed, a mail subject line. */
export function informalName(full?: string | null): string {
  return firstName(full) ?? 'there';
}
