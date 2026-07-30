/**
 * How Together City addresses a citizen, on the client (§4, FE-4.1).
 *
 * Mirrors together-city-chat/src/shared/salutation.ts. The two codebases have
 * no shared package, so the rules are stated twice — but only twice, rather
 * than the twenty hand-written `name.split(' ')[0]` this replaces. If the
 * register changes, both files move together.
 */

const MAX = 40;

/** The name to use when speaking to someone, or null when we have none. */
export function firstName(full?: string | null): string | null {
  const trimmed = (full ?? '').trim();
  if (!trimmed) return null;
  // Any whitespace, not just a space — names arrive from forms with tabs and
  // non-breaking spaces attached.
  const first = trimmed.split(/\s+/)[0];
  if (!first) return null;
  // An email in the name field is a sign-up mistake, not a name.
  const cleaned = first.includes('@') ? first.split('@')[0] : first;
  return cleaned.slice(0, MAX) || null;
}

/** Formal, for anything a citizen might read as correspondence. */
export function salutation(full?: string | null): string {
  return `Dear ${firstName(full) ?? 'user'},`;
}

/** Informal, for the feed and in-app headers. */
export function informalName(full?: string | null): string {
  return firstName(full) ?? 'there';
}
