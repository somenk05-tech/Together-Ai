/**
 * The four suits, in the order the deck builds them.
 *
 * Its own module so that `cardArt.ts` and `card-art.test.ts` cannot drift apart
 * on the spelling of a suit — the whole value of the art list is that it agrees
 * with the deck, and a test that hard-codes its own copy of "pentacles" is a
 * test that agrees with itself.
 *
 * These are the same four keys as `SUIT_TRAIT` in the API's tarot-deck.ts. They
 * are duplicated across the wire rather than shared because the client has no
 * import path into the API package; if that ever changes, this is the file to
 * delete.
 */
export const DECK_SUITS = ['wands', 'cups', 'swords', 'pentacles'] as const;
export type DeckSuit = (typeof DECK_SUITS)[number];
