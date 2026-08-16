/**
 * WHAT A BUSINESS SEES INSTEAD OF A NAME — until the person says otherwise.
 *
 * The owner's rule for this hub was that the person asking stays anonymous.
 * On 16 Aug he changed it by half: the CITIZEN decides, per business, whether
 * to show their name, and until they do the business gets a customer number.
 * THE DEFAULT DID NOT MOVE. Nobody's name appears anywhere because a screen
 * was rebuilt; it appears because they pressed something.
 *
 * A COUNTER, NOT A HASH OF THE USER ID. A hash is stable per person across
 * every business they contact, so two businesses comparing notes — or one
 * person running two businesses — could tell that the same citizen approached
 * both. The number here comes from how many threads the listing already has,
 * so "#3" means the third person to ask THIS business and means nothing
 * anywhere else.
 *
 * WHY A NUMBER AND NOT A WORD (owner, 16 Aug). It was "Neighbour 3", chosen
 * because "User 3" is a database row and "Anon 3" announces that somebody is
 * hiding. What that reading missed is the counter: an inbox of Neighbour 1,
 * Neighbour 2, Neighbour 3 is three copies of one word, and the business
 * scanning it is looking for the digit anyway. "#3" is the same fact with the
 * noise removed — a customer number, which is what a shop writes on a ticket.
 * The word came off; the promise under it did not.
 */
export const mintAlias = (existingThreadCount: number): string => `#${existingThreadCount + 1}`;

/**
 * The label for an alias, whenever it was minted.
 *
 * Threads and reviews created before 16 Aug hold "Neighbour 3" as their stored
 * signature, and that string is NOT rewritten — a review's signature is the one
 * it was posted under, and a migration that edits history to match today's copy
 * is a migration that edits history. So the number is read out at the edge
 * instead, and both generations print as "#3".
 */
export function customerLabel(alias: string): string {
  const digits = /(\d+)\s*$/.exec(alias ?? '');
  return digits ? `#${digits[1]}` : (alias || '#?');
}

/**
 * The seeker's own view of themselves in the thread. They know who they are, so
 * this is not a name — it is a statement of which of the two states they are in
 * and what the other side can therefore see.
 */
export const seekerReassurance = (alias: string, named?: string | null): string =>
  named
    ? `They see your name, ${named}. You chose to show it, and you can go back to ${customerLabel(alias)} whenever you like.`
    : `They see you as “${customerLabel(alias)}”. Your name, handle and photo are not shared.`;
