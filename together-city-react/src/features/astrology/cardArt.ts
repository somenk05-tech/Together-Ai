/**
 * Which cards we actually have art for.
 *
 * THE DECK IS 78 CARDS AND THE ART IS 22. The Major Arcana are illustrated; the
 * Minor Arcana — fourteen each of Wands, Cups, Swords and Pentacles — are not,
 * because the artwork for them does not exist yet. That is the honest state of
 * it, and it is written as data rather than left for a broken <img> to discover
 * at runtime: a card with no art renders as the typographic card it always was,
 * which reads as a deliberate design rather than as a missing file.
 *
 * `card-art.test.ts` holds this to the files on disk in both directions — every
 * id here must resolve to an image, and an image with no id here is art nobody
 * can see. A list that drifts from the folder is worse than no list, because it
 * makes the app confident about something that is not true.
 *
 * When the Minors arrive: drop `minor-<suit>-<n>.webp` into the same folder and
 * add the ids. Nothing else changes — CardFace already asks this module rather
 * than assuming.
 */

/** Public path for a card's illustration, or null if we don't have one. */
export function artFor(cardId: string): string | null {
  return CARD_ART.has(cardId) ? `/assets/img/tarot/${cardId}.webp` : null;
}

/**
 * The 22 Major Arcana, by the deck's own stable ids (`major-0` … `major-21`).
 * These are the ids tarot-deck.ts assigns, not a parallel naming scheme — a
 * second way to name a card is a second thing to keep in step.
 */
export const CARD_ART: ReadonlySet<string> = new Set(
  Array.from({ length: 22 }, (_, n) => `major-${n}`),
);
