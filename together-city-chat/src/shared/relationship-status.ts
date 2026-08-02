/**
 * Relationship status — what a citizen's situation IS.
 *
 * NOT the same question as two others this app already asks, and keeping the
 * three apart is the point of this file existing at all:
 *
 * · Dating's `relationshipGoal` is what somebody is LOOKING FOR — 'Marriage',
 *   'Casual dating', 'Still figuring it out'. A goal is not a status.
 * · `Connection.relationship` is a citizen's relationship TO ANOTHER PERSON —
 *   spouse, parent, sibling. That is a fact about a pair, not about a person.
 *
 * E.19 listed "relationshipStatus" as a `SharedFields` consolidation. It was
 * never one: no column, no field, no form, nothing reading it. This is the
 * feature, and the answer to "what reads it" is the honest small one — the
 * citizen's own profile shows it back. NOTHING COMPUTES WITH IT: it does not
 * reach dating, it does not change what anybody is shown, and the form says so.
 *
 * SKIPPABLE, and 'preferNotToSay' is an ANSWER rather than a blank — the same
 * distinction blood group draws between "nobody asked" and "I told you I don't
 * know". A relationship is a thing people decline to publish for reasons, and
 * declining is not the same as never having been asked.
 */

export const RELATIONSHIP_STATUSES = [
  'single', 'inRelationship', 'engaged', 'married',
  'separated', 'divorced', 'widowed', 'preferNotToSay',
] as const;

export type RelationshipStatus = (typeof RELATIONSHIP_STATUSES)[number];

const LABELS: Record<RelationshipStatus, string> = {
  single: 'Single',
  inRelationship: 'In a relationship',
  engaged: 'Engaged',
  married: 'Married',
  separated: 'Separated',
  divorced: 'Divorced',
  widowed: 'Widowed',
  preferNotToSay: 'Prefer not to say',
};

/** The citizen-facing name of a stored status. */
export function relationshipStatusLabel(stored: string): string {
  return LABELS[stored as RelationshipStatus] ?? stored;
}

/** A stored value from whatever was given, or undefined if it is not one of
 *  these. Never a guess: this is the citizen's own answer about their life. */
export function relationshipStatusFrom(raw?: string | null): RelationshipStatus | undefined {
  const t = (raw ?? '').trim();
  if (!t) return undefined;
  const flat = t.toLowerCase().replace(/[\s_-]+/g, '');
  return (RELATIONSHIP_STATUSES as readonly string[])
    .find((s) => s.toLowerCase() === flat) as RelationshipStatus | undefined;
}

/** What a screen says when there is no answer. Never an empty string — a blank
 *  where a value belongs reads as "nothing" when the truth is "nobody asked". */
export function relationshipStatusNote(stored?: string | null): string {
  const s = relationshipStatusFrom(stored);
  return s ? relationshipStatusLabel(s) : 'Not recorded';
}
