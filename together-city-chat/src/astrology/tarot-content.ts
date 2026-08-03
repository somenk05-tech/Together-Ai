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
  /**
   * The IANA zone the draw was made in. Only set on a Card of the Day, where it
   * decides when "today" ends — see TarotService.dailyCard. Recorded on the
   * reading rather than in a column so that a card carries its own provenance:
   * a period of '2026-07-29' means nothing without knowing whose day that was.
   */
  tz?: string;
  /**
   * Which of the face-down cards was turned, for a Card of the Day that was
   * chosen rather than dealt. Optional because every daily card drawn before
   * choosing existed has no position, and those readings are still theirs.
   */
  position?: number;
  /**
   * Which face-down cards were turned, in the order they were turned, for a
   * spread the citizen picked. Absent on spreads dealt before picking existed —
   * those were drawn off the top and it would be a lie to claim otherwise.
   */
  picks?: number[];
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

/**
 * Card + position → what it means for the person.
 *
 * The card stays visible: its name, keywords and orientation are all returned
 * as structured data and shown on the card face. What changes is that the PROSE
 * is about the reader rather than about the deck. "The Fool, upright, in Past —
 * it speaks of beginnings" was exposition; "Looking at what brought this about,
 * you may recognise beginnings" is the same reading, addressed to the person
 * holding it.
 *
 * This is what a reader across a table actually does. They do not narrate the
 * card to you; they tell you what they see in your situation, and the card is
 * how they got there.
 */
function readInPosition(card: TarotCard, reversed: boolean, position: string, asks: string): string {
  const words = reversed ? card.rev : card.up;
  const list = words.length > 1
    ? `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`
    : words[0];
  const opener = reversed
    ? `Looking at ${asks}, something here is turned inward or held back`
    : `Looking at ${asks}`;
  const suitLine = card.suit ? ` This sits with ${SUIT_TRAIT[card.suit].line}.` : '';
  return `${opener} — you may recognise ${list}. ${card.theme}${suitLine}`;
}

/** One line drawing the spread together, from what actually came up.
 *  Empty for a single card — there is no spread to draw together. */
function summarise(cards: DrawnCard[], question?: string): string {
  const majors = cards.filter((c) => c.arcana === 'major').length;
  const reversed = cards.filter((c) => c.reversed).length;
  const suits = cards.map((c) => c.suit).filter(Boolean) as string[];
  const dominant = suits.length
    ? [...new Set(suits)].sort((a, b) => suits.filter((s) => s === b).length - suits.filter((s) => s === a).length)[0]
    : null;

  // The counts still drive every branch below; none of them are stated as
  // counts. "Majors dominate (3 of 5)" is a fact about the deck — true, and of
  // no use to the person reading it. What they need is what it implies.
  /**
   * ONE CARD HAS NO SPREAD TO READ.
   *
   * Every line below is guarded by `cards.length > 1`, because each of them is
   * about how the cards sit TOGETHER — which suit dominates, how many are
   * major, how many are reversed. With a single card none of them fire, so a
   * daily reading used to be a heading, "Reading the spread", over one sentence
   * that said nothing: *"Here is what today seems to be asking of you."* The
   * card's own reading is directly above it and has already said it.
   *
   * An empty summary is the honest answer, and the screen renders nothing at
   * all rather than a box with a promise in it. This also cleans up every daily
   * card already in the archive, because the view checks the text rather than
   * the date.
   */
  if (cards.length < 2) return '';

  const parts: string[] = [
    question ? `On what you asked, a few things stand out.` : `A few things stand out here.`,
  ];
  if (majors >= Math.ceil(cards.length / 2) && cards.length > 1) {
    parts.push(`This reads as a matter larger than the day-to-day — one that feels more decided than chosen, and where your part may be how you meet it rather than whether it happens.`);
  } else if (majors === 0 && cards.length > 1) {
    parts.push('This sits squarely in ordinary life, which is good news: your own choices are what carry it.');
  }
  if (dominant && cards.length > 1) {
    parts.push(`The weight of it falls on ${SUIT_TRAIT[dominant as keyof typeof SUIT_TRAIT].domain} — that is where your attention will do the most.`);
  }
  if (reversed > cards.length / 2 && cards.length > 1) {
    parts.push('Much of this is turned inward or held back at the moment. Read that as something blocked rather than something going wrong — blocked things tend to move once they are named.');
  }
  return parts.join(' ');
}

/**
 * Which of the face-down cards the citizen turned, in the order they turned them.
 *
 * CARRIED IN THE SEED RATHER THAN AS A PARAMETER, so that "the same seed always
 * yields this exact draw" stays literally true — a reading is regenerated from
 * one string years later, and a draw that also depended on an argument nobody
 * stored would not be reproducible at all.
 *
 * A seed with no `:picks:` suffix means the cards came off the top of the deck
 * in order, which is what every reading drawn before choosing existed did. Those
 * readings still regenerate exactly, because [0,1,2,…] is what this returns for
 * them.
 */
function picksIn(seed: string, size: number): number[] {
  const m = /:picks:([\d-]+)$/.exec(seed);
  const picked = m ? m[1].split('-').map(Number) : [];
  const usable = picked.length === size
    && picked.every((n) => Number.isInteger(n) && n >= 0 && n < DECK.length)
    && new Set(picked).size === size;
  return usable ? picked : Array.from({ length: size }, (_, i) => i);
}

/**
 * Compose a reading. Pure and deterministic: same seed, same reading, always.
 *
 * `seed` is stored alongside the result so a reading can be regenerated and
 * checked years later.
 */
export function composeTarot(kind: SpreadKind, seed: string, question?: string): TarotReadingOut {
  /**
   * THE DECK IS SHUFFLED BEFORE THE CARDS ARE TURNED, so the picks are stripped
   * out of the seed before it is hashed.
   *
   * This is the difference between a table and a slot machine. Hashing the
   * whole seed would re-shuffle the deck for every different set of picks — the
   * outcome would still depend on the choice, but nothing would be lying face
   * down when the choice was made, and "the third back was the Tower all along"
   * would be false. Stripping the suffix means the fan is laid from the draw's
   * own entropy, each back IS a particular card from that moment, and turning a
   * different one turns a different card.
   *
   * A seed with no suffix hashes exactly as it always did, so every reading in
   * the archive regenerates byte for byte.
   */
  const rng = mulberry32(hashSeed(seed.replace(/:picks:[\d-]+$/, '')));
  const deck = shuffle(rng);
  const slots = POSITIONS[kind];
  /**
   * THE CHOICE IS WHICH CARDS COME OUT, NOT WHICH ORDER THEY ARE SHOWN IN.
   *
   * The deck is shuffled once and laid face down; the citizen's Nth pick is
   * what fills the Nth position. Turning the third back rather than the ninth
   * therefore deals a different card into The Heart, which is exactly what
   * choosing means at a table. Had the picks only reordered a set already
   * decided, the fan would be a flourish and a citizen would find out by
   * drawing twice.
   */
  const picks = picksIn(seed, slots.length);

  /**
   * Orientation belongs to the card on the table, not to the slot it ends up in.
   *
   * Drawn for the whole deck up front, from the same stream, so that the card
   * lying under a given back is upright or reversed BEFORE anybody turns it —
   * the same reason the shuffle happens before the picks. Turning it into Past
   * rather than Future must not flip it.
   *
   * The first values off the stream are the same values the old loop drew in
   * slot order, and a legacy seed picks [0,1,2,…], so every reading already
   * stored composes identically. That is not a coincidence to rely on quietly:
   * spread-choice.spec.ts asserts it against a real pre-picking seed.
   */
  const orientation = deck.map(() => rng() < 0.35);

  const cards: DrawnCard[] = slots.map((slot, i) => {
    const card = deck[picks[i]];
    const reversed = orientation[picks[i]];
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
    summary: summarise(cards, question),
    disclaimer: DISCLAIMER,
    seed,
    // Only when they were really chosen. picksIn() falls back to the top of the
    // deck for a seed that names none, and reporting that fallback as a choice
    // would put "you turned cards 1, 2 and 3" under a reading nobody picked.
    ...(/:picks:/.test(seed) ? { picks } : {}),
  };
}
