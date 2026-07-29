/**
 * The 78-card Rider–Waite–Smith deck.
 *
 * Traditional card meanings, in the public domain and unchanged for a century —
 * this is curated reference data of the same kind as the nutrition ingredient
 * tables, not invented content. Nothing here is generated, and no card carries
 * a claim the tradition doesn't already make.
 *
 * Keywords are deliberately short. The reading is composed from them against a
 * spread position (see tarot-content.ts), so a card must read as a *quality*
 * that a position can colour — "beginnings, faith, the leap" works in any of the
 * ten Celtic Cross slots; a finished sentence would not.
 */

export type Arcana = 'major' | 'minor';
export type Suit = 'wands' | 'cups' | 'swords' | 'pentacles';

export interface TarotCard {
  /** Stable id — used as the seed key, so it must never change. */
  id: string;
  name: string;
  arcana: Arcana;
  suit?: Suit;
  /** 0–21 for majors, 1–14 for minors (11=Page, 12=Knight, 13=Queen, 14=King). */
  num: number;
  /** What the card says the right way up. */
  up: string[];
  /** What it says reversed — a block, an excess, or the shadow of the same force. */
  rev: string[];
  /** One line of what the card is fundamentally about. */
  theme: string;
}

const M = (num: number, name: string, up: string[], rev: string[], theme: string): TarotCard =>
  ({ id: `major-${num}`, name, arcana: 'major', num, up, rev, theme });

/** Major Arcana — the 22 cards of the larger story. */
export const MAJORS: TarotCard[] = [
  M(0, 'The Fool', ['beginnings', 'faith', 'the leap'], ['recklessness', 'hesitation', 'a leap not looked at'], 'Setting out without a map, and being right to.'),
  M(1, 'The Magician', ['capability', 'focus', 'resources at hand'], ['scattered effort', 'manipulation', 'unused talent'], 'You already have what the work requires.'),
  M(2, 'The High Priestess', ['intuition', 'the unspoken', 'patience'], ['ignored instinct', 'secrecy', 'noise over signal'], 'What you know before you can explain it.'),
  M(3, 'The Empress', ['abundance', 'nurture', 'growth'], ['smothering', 'neglect', 'creative block'], 'Tending something until it flourishes.'),
  M(4, 'The Emperor', ['structure', 'authority', 'boundaries'], ['rigidity', 'control', 'authority misused'], 'Order that makes freedom possible.'),
  M(5, 'The Hierophant', ['tradition', 'teaching', 'shared meaning'], ['dogma', 'rebellion', 'hollow ritual'], 'The wisdom that came before you.'),
  M(6, 'The Lovers', ['union', 'choice', 'alignment'], ['discord', 'avoided decision', 'values in conflict'], 'A choice that decides who you are.'),
  M(7, 'The Chariot', ['drive', 'direction', 'willed momentum'], ['scattered force', 'stalling', 'winning the wrong race'], 'Opposing forces harnessed and pointed forward.'),
  M(8, 'Strength', ['courage', 'gentleness', 'mastery of self'], ['self-doubt', 'force over patience', 'depleted reserves'], 'The soft hand that closes the lion’s mouth.'),
  M(9, 'The Hermit', ['solitude', 'searching', 'inner light'], ['isolation', 'lost bearings', 'refusing counsel'], 'Stepping back far enough to see.'),
  M(10, 'Wheel of Fortune', ['turning', 'cycles', 'luck in motion'], ['resistance', 'a downturn', 'clinging to a phase'], 'The turn you do not control.'),
  M(11, 'Justice', ['fairness', 'consequence', 'clear sight'], ['imbalance', 'evasion', 'a debt unpaid'], 'Cause meeting effect, exactly.'),
  M(12, 'The Hanged Man', ['pause', 'reversal of view', 'surrender'], ['stalling', 'martyrdom', 'a pause turned into a habit'], 'Seeing it differently by hanging still.'),
  M(13, 'Death', ['ending', 'transformation', 'clearing'], ['clinging', 'stalled change', 'fear of the ending'], 'What has to finish before the next thing starts.'),
  M(14, 'Temperance', ['balance', 'blending', 'the middle way'], ['excess', 'impatience', 'ingredients that won’t mix'], 'The right proportion, found slowly.'),
  M(15, 'The Devil', ['attachment', 'appetite', 'the chain you chose'], ['release', 'seeing the trap', 'breaking a hold'], 'A bond that looks like a need.'),
  M(16, 'The Tower', ['sudden change', 'collapse', 'revelation'], ['a delayed reckoning', 'disaster averted', 'rebuilding the same tower'], 'The structure that could not hold.'),
  M(17, 'The Star', ['hope', 'renewal', 'quiet faith'], ['discouragement', 'faith worn thin', 'looking away from the light'], 'Calm water after the storm.'),
  M(18, 'The Moon', ['uncertainty', 'dreams', 'the unclear path'], ['clarity returning', 'illusion named', 'fear spoken aloud'], 'Walking a road you cannot fully see.'),
  M(19, 'The Sun', ['clarity', 'joy', 'things seen plainly'], ['dimmed spirits', 'delay', 'optimism without ground'], 'Warmth with nothing hidden.'),
  M(20, 'Judgement', ['reckoning', 'awakening', 'the call'], ['self-doubt', 'ignoring the call', 'harsh self-judgement'], 'Being summoned by your own past.'),
  M(21, 'The World', ['completion', 'wholeness', 'the circle closed'], ['unfinished business', 'a delayed ending', 'closure withheld'], 'The end that contains the whole journey.'),
];

/** Per-suit character — every minor of a suit inherits this colouring. */
export const SUIT_TRAIT: Record<Suit, { element: string; domain: string; line: string }> = {
  wands: { element: 'Fire', domain: 'drive, work, creation', line: 'what you are moved to do' },
  cups: { element: 'Water', domain: 'feeling, relationship, meaning', line: 'what you care about' },
  swords: { element: 'Air', domain: 'thought, truth, conflict', line: 'what you are thinking through' },
  pentacles: { element: 'Earth', domain: 'body, money, craft', line: 'what you are building and holding' },
};

/** Number meanings shared across all four suits — the spine of the minors. */
const PIP: Record<number, { up: string[]; rev: string[]; theme: string }> = {
  1: { up: ['a beginning', 'raw potential', 'the offer'], rev: ['a false start', 'potential unused', 'the offer declined'], theme: 'The seed of the suit, handed to you.' },
  2: { up: ['balance', 'a pair', 'the choice between two'], rev: ['imbalance', 'indecision', 'a partnership strained'], theme: 'Two things held at once.' },
  3: { up: ['first fruits', 'collaboration', 'growth showing'], rev: ['delay', 'effort unshared', 'growth stalled'], theme: 'The early result of the work.' },
  4: { up: ['stability', 'consolidation', 'rest earned'], rev: ['stagnation', 'holding too tightly', 'rest refused'], theme: 'A foundation that holds still.' },
  5: { up: ['loss', 'conflict', 'the lean season'], rev: ['recovery', 'conflict easing', 'help accepted'], theme: 'The difficulty of the suit.' },
  6: { up: ['recovery', 'generosity', 'movement onward'], rev: ['imbalance in giving', 'a slow return', 'stuck in the old place'], theme: 'The turn back toward good.' },
  7: { up: ['assessment', 'perseverance', 'holding the position'], rev: ['doubt', 'overwhelm', 'ground given up'], theme: 'The long middle, where it is tested.' },
  8: { up: ['momentum', 'skill applied', 'speed'], rev: ['scattered effort', 'haste', 'momentum lost'], theme: 'The work accelerating.' },
  9: { up: ['near-completion', 'resilience', 'almost there'], rev: ['exhaustion', 'guarding too hard', 'the last stretch stalled'], theme: 'Close enough to feel the cost.' },
  10: { up: ['fullness', 'the burden of completion', 'the cycle ending'], rev: ['overload', 'an ending resisted', 'carrying what could be set down'], theme: 'The suit at its limit.' },
  11: { up: ['curiosity', 'a message', 'the student'], rev: ['immaturity', 'news delayed', 'learning refused'], theme: 'The Page — meeting the suit for the first time.' },
  12: { up: ['action', 'pursuit', 'the quest'], rev: ['recklessness', 'a stalled pursuit', 'direction lost'], theme: 'The Knight — the suit in motion.' },
  13: { up: ['depth', 'care', 'mastery held inwardly'], rev: ['over-involvement', 'coldness', 'care withheld'], theme: 'The Queen — the suit understood from within.' },
  14: { up: ['command', 'responsibility', 'mastery expressed'], rev: ['rigidity', 'domination', 'authority avoided'], theme: 'The King — the suit governed.' },
};

const RANK_NAME: Record<number, string> = {
  1: 'Ace', 2: 'Two', 3: 'Three', 4: 'Four', 5: 'Five', 6: 'Six', 7: 'Seven',
  8: 'Eight', 9: 'Nine', 10: 'Ten', 11: 'Page', 12: 'Knight', 13: 'Queen', 14: 'King',
};
const SUIT_NAME: Record<Suit, string> = { wands: 'Wands', cups: 'Cups', swords: 'Swords', pentacles: 'Pentacles' };

/**
 * The 56 minors, built from number × suit.
 *
 * Composed rather than hand-written: a Five is a Five in every suit, and the
 * suit supplies the arena. Writing all 56 out by hand invites the kind of drift
 * where the Five of Cups and the Five of Swords stop rhyming with each other for
 * no reason. Where tradition gives a card a strong distinct reading, the suit
 * trait plus the pip meaning still lands in the right place.
 */
export const MINORS: TarotCard[] = (Object.keys(SUIT_TRAIT) as Suit[]).flatMap((suit) =>
  Object.keys(PIP).map(Number).sort((a, b) => a - b).map((num): TarotCard => {
    const pip = PIP[num];
    return {
      id: `${suit}-${num}`,
      name: `${RANK_NAME[num]} of ${SUIT_NAME[suit]}`,
      arcana: 'minor',
      suit,
      num,
      up: pip.up,
      rev: pip.rev,
      theme: `${pip.theme} Here it plays out in ${SUIT_TRAIT[suit].domain}.`,
    };
  }),
);

export const DECK: TarotCard[] = [...MAJORS, ...MINORS];

export const cardById = (id: string): TarotCard | undefined => DECK.find((c) => c.id === id);
