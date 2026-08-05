/**
 * THE ONLY NAME A BUSINESS EVER SEES.
 *
 * The owner's rule for this hub is that the person asking stays anonymous. That
 * is easy to say and easy to leak — one `include: { seeker: true }` in a query
 * six months from now and a real name is on a stranger's screen. So identity is
 * not "hidden at render"; it never enters the object at all. What the business
 * gets is this string, and this string is derived from nothing that can be
 * turned back into a person.
 *
 * A COUNTER, NOT A HASH OF THE USER ID. A hash is stable per person across every
 * business they contact, so two businesses comparing notes — or one person
 * running two businesses — could tell that the same citizen approached both.
 * The number here comes from how many threads the listing already has, so
 * "Neighbour 3" means the third person to ask THIS business, and means nothing
 * anywhere else.
 *
 * The word matters as much as the number. "User 3" is a database row. "Anon 3"
 * announces that somebody is hiding. "Neighbour 3" is what the person actually
 * is to the business — someone nearby who needs the thing they do.
 */
export const ALIAS_WORD = 'Neighbour';

export function mintAlias(existingThreadCount: number): string {
  return `${ALIAS_WORD} ${existingThreadCount + 1}`;
}

/**
 * The seeker's own view of themselves in the thread. They know who they are, so
 * this is not a name — it is a reassurance, shown once at the top of the room,
 * that the other side does not.
 */
export const seekerReassurance = (alias: string): string =>
  `They see you as “${alias}”. Your name, handle and photo are not shared.`;
