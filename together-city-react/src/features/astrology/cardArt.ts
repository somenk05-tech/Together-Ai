import { DECK_SUITS } from './deckSuits';

/**
 * Which cards we have art for.
 *
 * ALL SEVENTY-EIGHT, now that the Minor Arcana have arrived: 22 Major and 14
 * each of Wands, Cups, Swords and Pentacles. The ids are the deck's own
 * (`major-0` … `major-21`, `wands-1` … `pentacles-14`) rather than a parallel
 * scheme — a second way to name a card is a second thing to keep in step, and
 * this list is only useful while it agrees with tarot-deck.ts exactly.
 *
 * It is still a LIST rather than an assumption. `card-art.test.ts` holds it to
 * the folder in both directions, and CardFace asks it rather than guessing: a
 * card whose art is missing falls back to the typographic face instead of
 * rendering a broken image. That mattered when 56 cards had no art and it still
 * matters now, because the next thing to go missing will be one file, not
 * fifty-six, and one broken card is the harder kind to notice.
 *
 * WHAT IS STILL NOT HERE: a card back. The backs are drawn in CSS
 * (`.tarot-back-face`), and the supplied sheets contain no back design.
 */

/** Public path for a card's illustration, or null if we don't have one. */
export function artFor(cardId: string): string | null {
  return CARD_ART.has(cardId) ? `/assets/img/tarot/${cardId}.webp` : null;
}

export const CARD_ART: ReadonlySet<string> = new Set([
  ...Array.from({ length: 22 }, (_, n) => `major-${n}`),
  ...DECK_SUITS.flatMap((suit) => Array.from({ length: 14 }, (_, i) => `${suit}-${i + 1}`)),
]);
