import { DECK, SUIT_TRAIT, type TarotCard } from './tarot-deck';
import { hashSeed, mulberry32 } from './astro-content';

/**
 * Tarot readings — deterministic, reproducible, and honest about what they are.
 *
 * Every draw comes from a seeded shuffle, and the seed is stored with the
 * reading. That is what makes a reading reproducible: given the same seed, the
 * same cards come up in the same order and orientation, forever. A reading you
 * can't reproduce is one you can't verify, and a "random" draw that quietly
 * changes when you reload isn't a reading, it's a slot machine.
 *
 * No AI is involved in the draw. AI may later rephrase the prose, exactly as it
 * does for the horoscopes, but the cards and their positional meanings are
 * computed here and are the same with or without it.
 */

export type SpreadKind = 'daily' | 'three' | 'celtic';

export interface DrawnCard {
  cardId: string;
  name: string;
  arcana: 'major' | 'minor';
  suit?: string;
  reversed: boolean;
  /** Which slot of the spread this card landed in. */
  position: string;
  /** What that slot is asking. */
  positionMeaning: string;
  /** The card read in that slot. */
  reading: string;
  keywords: string[];
}

export interface TarotReadingOut {
  kind: SpreadKind;
  spreadName: string;
  question?: string;
  cards: DrawnCard[];
  summary: string;
  /** Non-negotiable on every reading — see DISCLAIMER. */
  disclaimer: string;
  /** Reproducibility: the same seed always yields this exact draw. */
  seed: string;
}

/**
 * Shown with every reading, never optional.
 *
 * Tarot sits one tab away from a Medical hub holding real blood panels, and a
 * citizen reading both in one session should never be in any doubt about which
 * is which.
 */
export const DISCLAIMER =
  'Tarot is offered here for reflection and entertainment. It is not medical, ' +
  'psychological, legal or financial advice, and it does not predict the future. ' +
  'Nothing in a reading should be used in place of a qualified professional.';

const POSITIONS: Record<SpreadKind, Array<{ name: string; asks: string }>> = {
  daily: [
    { name: 'Today', asks: 'the quality to carry through today' },
  ],
  three: [
    { name: 'Past', asks: 'what brought this about' },
    { name: 'Present', asks: 'where the matter actually stands' },
    { name: 'Future', asks: 'where it tends if nothing changes' },
  ],
  celtic: [
    { name: 'The Heart', asks: 'the matter itself, stripped of story' },
    { name: 'The Crossing', asks: 'what cuts across it, for good or ill' },
    { name: 'The Foundation', asks: 'the root beneath it, often older than you think' },
    { name: 'The Past', asks: 'what is passing out of influence' },
    { name: 'The Crown', asks: 'what you believe you want' },
    { name: 'The Approach', asks: 'what is arriving next' },
    { name: 'Yourself', asks: 'how you are actually showing up' },
    { name: 'Your Surroundings', asks: 'what the people around you bring to it' },
    { name: 'Hopes and Fears', asks: 'the thing you both want and dread — usually one card, not two' },
    { name: 'The Outcome', asks: 'where the whole configuration is heading' },
  ],
};

export const SPREAD_NAME: Record<SpreadKind, string> = {
  daily: 'Card of the Day',
  three: 'Past · Present · Future',
  celtic: 'The Celtic Cross',
};

export const spreadSize = (kind: SpreadKind): number => POSITIONS[kind].length;

/**
 * Fisher–Yates over the full 78, from the seeded generator.
 *
 * A real shuffle, not "pick N random cards" — the difference matters, because
 * picking independently can deal the same card twice, and a spread with the Tower
 * in two positions is not a tarot reading.
 */
function shuffle(rng: () => number): TarotCard[] {
  const d = [...DECK];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

/** Card + position → the sentence a reader would actually say. */
function readInPosition(card: TarotCard, reversed: boolean, position: string, asks: string): string {
  const words = reversed ? card.rev : card.up;
  const list = words.length > 1
    ? `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`
    : words[0];
  const orient = reversed ? 'reversed' : 'upright';
  const suitLine = card.suit ? ` This is ${SUIT_TRAIT[card.suit].line}.` : '';
  return `${card.name}, ${orient}, in ${position} — which asks ${asks}. ` +
    `It speaks of ${list}. ${card.theme}${suitLine}`;
}

/** One line drawing the spread together, from what actually came up. */
function summarise(kind: SpreadKind, cards: DrawnCard[], question?: string): string {
  const majors = cards.filter((c) => c.arcana === 'major').length;
  const reversed = cards.filter((c) => c.reversed).length;
  const suits = cards.map((c) => c.suit).filter(Boolean) as string[];
  const dominant = suits.length
    ? [...new Set(suits)].sort((a, b) => suits.filter((s) => s === b).length - suits.filter((s) => s === a).length)[0]
    : null;

  const parts: string[] = [];
  if (kind === 'daily') {
    parts.push(`One card for today${cards[0].reversed ? ', and it comes up reversed' : ''}.`);
  } else {
    parts.push(question ? `On the question you asked, ${cards.length} cards.` : `${cards.length} cards.`);
  }
  if (majors >= Math.ceil(cards.length / 2) && cards.length > 1) {
    parts.push(`Majors dominate (${majors} of ${cards.length}) — this reads as a matter larger than the day-to-day, more decided than chosen.`);
  } else if (majors === 0 && cards.length > 1) {
    parts.push('No Major Arcana — this sits in ordinary life, where your own choices carry it.');
  }
  if (dominant && cards.length > 1) {
    parts.push(`${SUIT_TRAIT[dominant as keyof typeof SUIT_TRAIT].element} runs through it: the weight is on ${SUIT_TRAIT[dominant as keyof typeof SUIT_TRAIT].domain}.`);
  }
  if (reversed > cards.length / 2 && cards.length > 1) {
    parts.push('Most cards are reversed — read this as energy blocked or turned inward rather than as bad news.');
  }
  return parts.join(' ');
}

/**
 * Compose a reading. Pure and deterministic: same seed, same reading, always.
 *
 * `seed` is stored alongside the result so a reading can be regenerated and
 * checked years later.
 */
export function composeTarot(kind: SpreadKind, seed: string, question?: string): TarotReadingOut {
  const rng = mulberry32(hashSeed(seed));
  const deck = shuffle(rng);
  const slots = POSITIONS[kind];

  const cards: DrawnCard[] = slots.map((slot, i) => {
    const card = deck[i];
    // Orientation is drawn from the same stream, so it's part of the same seed.
    const reversed = rng() < 0.35;
    return {
      cardId: card.id,
      name: card.name,
      arcana: card.arcana,
      suit: card.suit,
      reversed,
      position: slot.name,
      positionMeaning: slot.asks,
      reading: readInPosition(card, reversed, slot.name, slot.asks),
      keywords: reversed ? card.rev : card.up,
    };
  });

  return {
    kind,
    spreadName: SPREAD_NAME[kind],
    question,
    cards,
    summary: summarise(kind, cards, question),
    disclaimer: DISCLAIMER,
    seed,
  };
}
