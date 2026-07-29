import type { DashaLord } from './personal-factors';

/**
 * Gemstones and remedies — the Astrology Zone's third and fourth surfaces.
 *
 * Written to the hub's voice rule (docs: Astrology-Voice-Principles): STRUCTURED
 * PANELS MAY SHOW THE MACHINERY, PROSE NEVER MAY. So a stone carries labelled
 * fields — stone, metal, finger, day, and the body it is traditionally linked to
 * — exactly as the chart chips and tarot card faces do. The paragraph beside it
 * says what the citizen might do with it, in their own language, and never
 * explains where it came from.
 *
 * Both surfaces are wellness and cultural practice, not medicine. Every response
 * carries the disclaimer, and any remedy involving the body is filtered against
 * declared health flags before it is offered — a fast is not something to
 * suggest to someone who should not be fasting.
 */

export const GEM_DISCLAIMER =
  'Gemstone and remedy guidance is offered as reflection and cultural practice, not as medical, ' +
  'financial or legal advice. Nothing here should replace care from a qualified professional, ' +
  'and no stone or observance is a substitute for treatment.';

export interface GemEntry {
  /** The lord this stone is traditionally linked to — LABELLED DATA, not prose. */
  lord: DashaLord;
  stone: string;
  alternatives: string[];
  metal: string;
  finger: string;
  /** Day traditionally chosen to begin wearing it. */
  beginOn: string;
  /** What the wearer is invited to work on. Voice-safe: no machinery named. */
  intention: string;
  /** Practical caution. Stones are expensive and some are traditionally heavy. */
  caution: string;
}

export const GEM_CATALOG: Record<DashaLord, GemEntry> = {
  Sun: {
    lord: 'Sun', stone: 'Ruby', alternatives: ['Red spinel', 'Garnet'], metal: 'Gold or copper', finger: 'Ring finger',
    beginOn: 'Sunday',
    intention: 'You may find it easier to be seen as you actually are — to take a little more room, and to let what you have built be visible rather than quietly assumed.',
    caution: 'Traditionally considered strong. Many people begin with a smaller stone and sit with it for a season.',
  },
  Moon: {
    lord: 'Moon', stone: 'Natural pearl', alternatives: ['Moonstone'], metal: 'Silver', finger: 'Little finger',
    beginOn: 'Monday',
    intention: 'A steadier inner weather tends to be the aim here — sleeping properly, feeling less at the mercy of a passing mood, and being easier company for yourself.',
    caution: 'Pearls are soft and dislike perfume, heat and household cleaners. They need gentle handling.',
  },
  Mars: {
    lord: 'Mars', stone: 'Red coral', alternatives: ['Carnelian'], metal: 'Copper, silver or gold', finger: 'Ring finger',
    beginOn: 'Tuesday',
    intention: 'Useful when what you want is not more energy but steadier energy — finishing the thing rather than starting a fourth, and holding your position without heat.',
    caution: 'Traditionally warming. Often avoided by those who already run hot-tempered or restless.',
  },
  Mercury: {
    lord: 'Mercury', stone: 'Emerald', alternatives: ['Green tourmaline', 'Peridot'], metal: 'Gold or silver', finger: 'Little finger',
    beginOn: 'Wednesday',
    intention: 'Clearer thinking and clearer speaking — being understood the first time, and keeping hold of detail that has been slipping.',
    caution: 'Emeralds are commonly treated and frequently included; buy certified or not at all.',
  },
  Jupiter: {
    lord: 'Jupiter', stone: 'Yellow sapphire', alternatives: ['Citrine', 'Topaz'], metal: 'Gold', finger: 'Index finger',
    beginOn: 'Thursday',
    intention: 'Room to grow into — study, teaching, mentors, and the kind of decisions that only make sense over years rather than weeks.',
    caution: 'Widely worn and generally considered gentle. Certification still matters at this price.',
  },
  Venus: {
    lord: 'Venus', stone: 'Diamond', alternatives: ['White sapphire', 'Zircon'], metal: 'Silver, platinum or gold', finger: 'Middle finger',
    beginOn: 'Friday',
    intention: 'Comfort, beauty and companionship — allowing ease without guilt, and letting relationships be pleasant rather than only useful.',
    caution: 'The costliest option by far. A white sapphire is the traditional substitute and is not a lesser choice.',
  },
  Saturn: {
    lord: 'Saturn', stone: 'Blue sapphire', alternatives: ['Amethyst', 'Lapis lazuli'], metal: 'Silver or iron', finger: 'Middle finger',
    beginOn: 'Saturday',
    intention: 'Structure that holds — patience with slow things, keeping promises to yourself, and the discipline that makes freedom possible later.',
    caution: 'Traditionally the most cautioned stone of all: wear it on trial for a few days before committing.',
  },
  Rahu: {
    lord: 'Rahu', stone: 'Hessonite garnet', alternatives: ['Smoky quartz'], metal: 'Silver', finger: 'Middle finger',
    beginOn: 'Saturday',
    intention: 'Steadiness when things feel unusually fast or unusually strange — separating what is genuinely new from what is merely loud.',
    caution: 'Traditionally cautioned. Begin on trial rather than committing outright.',
  },
  Ketu: {
    lord: 'Ketu', stone: "Cat's eye", alternatives: ['Chrysoberyl'], metal: 'Silver', finger: 'Little finger',
    beginOn: 'Thursday',
    intention: 'Letting go of what is finished — closing chapters cleanly, and being less troubled by what other people make of you.',
    caution: 'Traditionally cautioned. Begin on trial rather than committing outright.',
  },
};

/** Health situations that make a bodily observance a bad idea to suggest. */
export type HealthFlag =
  | 'pregnancy' | 'breastfeeding' | 'diabetes' | 'eating-disorder'
  | 'underweight' | 'kidney' | 'heart' | 'minor';

export interface RemedyTemplate {
  key: string;
  title: string;
  /** What to actually do. Voice-safe. */
  practice: string;
  /** 'observance' involves the body; 'giving' and 'practice' do not. */
  kind: 'observance' | 'giving' | 'practice';
  /** Flags that make this unsafe or inappropriate to offer. */
  unsafeWith: HealthFlag[];
}

export const REMEDY_TEMPLATES: Record<DashaLord, RemedyTemplate[]> = {
  Sun: [
    { key: 'sun-morning', title: 'Meet the early light', kind: 'practice', unsafeWith: [], practice: 'Get outside within an hour of waking, even briefly. It steadies the day more reliably than most things you could do later in it.' },
    { key: 'sun-give', title: 'Give where it is not seen', kind: 'giving', unsafeWith: [], practice: 'Offer something on a Sunday without telling anyone you did — wheat, jaggery, or simply time.' },
    { key: 'sun-fast', title: 'A lighter Sunday', kind: 'observance', unsafeWith: ['pregnancy', 'breastfeeding', 'diabetes', 'eating-disorder', 'underweight', 'minor'], practice: 'Keep Sundays deliberately simple at the table — one plain meal, taken slowly.' },
  ],
  Moon: [
    { key: 'moon-water', title: 'Keep water nearby', kind: 'practice', unsafeWith: ['kidney', 'heart'], practice: 'Drink more than you think you need, earlier than you think you need it. Mood follows hydration more closely than most people expect.' },
    { key: 'moon-give', title: 'Something white, given on a Monday', kind: 'giving', unsafeWith: [], practice: 'Rice, milk or cloth, given quietly at the start of the week.' },
    { key: 'moon-rest', title: 'Protect the last hour', kind: 'practice', unsafeWith: [], practice: 'Keep the hour before sleep undemanding — no screens that argue back, nothing that needs a decision.' },
  ],
  Mars: [
    { key: 'mars-move', title: 'Spend it before it spends you', kind: 'practice', unsafeWith: ['pregnancy', 'heart'], practice: 'Move hard enough to be out of breath a few times a week. Unspent energy tends to come out as temper.' },
    { key: 'mars-give', title: 'Tuesday, quietly', kind: 'giving', unsafeWith: [], practice: 'Give lentils, red cloth or a hand to someone doing physical work.' },
    { key: 'mars-pause', title: 'The one-night rule', kind: 'practice', unsafeWith: [], practice: 'Anything you would send while angry, keep until morning. You may find you send a better version, or none.' },
  ],
  Mercury: [
    { key: 'mercury-write', title: 'Write the thing down', kind: 'practice', unsafeWith: [], practice: 'Keep one place for what is owed and promised. A crowded mind is usually an un-emptied one.' },
    { key: 'mercury-give', title: 'Green, on a Wednesday', kind: 'giving', unsafeWith: [], practice: 'Give greens, books or study materials to someone learning something.' },
    { key: 'mercury-quiet', title: 'An hour without input', kind: 'practice', unsafeWith: [], practice: 'Take one hour a day with nothing arriving — no feed, no messages. Thinking needs a gap to happen in.' },
  ],
  Jupiter: [
    { key: 'jupiter-learn', title: 'Keep one thing you are learning', kind: 'practice', unsafeWith: [], practice: 'Something with no use attached to it. Growth wants a direction more than it wants a destination.' },
    { key: 'jupiter-give', title: 'Thursday, to a teacher', kind: 'giving', unsafeWith: [], practice: 'Give to teaching or to someone studying — books, fees, turmeric, yellow cloth.' },
    { key: 'jupiter-fast', title: 'A simple Thursday', kind: 'observance', unsafeWith: ['pregnancy', 'breastfeeding', 'diabetes', 'eating-disorder', 'underweight', 'minor'], practice: 'Keep Thursdays plain at the table, and put the attention elsewhere.' },
  ],
  Venus: [
    { key: 'venus-beauty', title: 'Make one thing pleasant', kind: 'practice', unsafeWith: [], practice: 'Tend something for no reason beyond that it is nicer afterwards — a room, a meal, a person.' },
    { key: 'venus-give', title: 'Friday, something lovely', kind: 'giving', unsafeWith: [], practice: 'Give sweets, white cloth or flowers, and let it be genuinely given.' },
    { key: 'venus-rest', title: 'Take the pleasure without earning it', kind: 'practice', unsafeWith: [], practice: 'Once a week, enjoy something you did not have to deserve first.' },
  ],
  Saturn: [
    { key: 'saturn-small', title: 'One promise, kept daily', kind: 'practice', unsafeWith: [], practice: 'Pick something small enough that you will not fail it, and do it every day. The size matters less than the streak.' },
    { key: 'saturn-give', title: 'Saturday, to those who go without', kind: 'giving', unsafeWith: [], practice: 'Give food, blankets, oil or work to someone with less. Preferably in person.' },
    { key: 'saturn-service', title: 'An hour of unglamorous work', kind: 'practice', unsafeWith: [], practice: 'Do something useful that nobody will thank you for. It settles more than it costs.' },
  ],
  Rahu: [
    { key: 'rahu-ground', title: 'Keep one ordinary anchor', kind: 'practice', unsafeWith: [], practice: 'Same walk, same hour, same handful of people. When things move fast, routine is what keeps you legible to yourself.' },
    { key: 'rahu-give', title: 'Give without a story', kind: 'giving', unsafeWith: [], practice: 'Give to someone you will never hear from again, and do not tell it afterwards.' },
    { key: 'rahu-check', title: 'Sleep on the exciting one', kind: 'practice', unsafeWith: [], practice: 'Anything that feels unusually urgent and unusually brilliant, look at again in daylight.' },
  ],
  Ketu: [
    { key: 'ketu-clear', title: 'Finish or discard', kind: 'practice', unsafeWith: [], practice: 'Take one unfinished thing a week and either complete it or let it go on purpose. Both close it.' },
    { key: 'ketu-give', title: 'Give something you own', kind: 'giving', unsafeWith: [], practice: 'Not money — an actual possession you have kept past its usefulness.' },
    { key: 'ketu-quiet', title: 'Sit still, briefly', kind: 'practice', unsafeWith: [], practice: 'Ten minutes with nothing to achieve. Uncomfortable at first, and then not.' },
  ],
};

export interface GemGuidance {
  primary: GemEntry;
  supporting: GemEntry;
  disclaimer: string;
}

/**
 * The stone to consider now, and one that supports it.
 *
 * Deterministic: the same period and the same chart give the same answer, so a
 * citizen is never told a different thing on refresh.
 */
export function buildGemGuidance(opts: { maha: DashaLord; antar: DashaLord }): GemGuidance {
  const primary = GEM_CATALOG[opts.maha];
  // If both periods share a lord, offer the other one's stone as support rather
  // than repeating the same entry twice.
  const supportLord = opts.antar === opts.maha ? fallbackSupport(opts.maha) : opts.antar;
  return { primary, supporting: GEM_CATALOG[supportLord], disclaimer: GEM_DISCLAIMER };
}

const SUPPORT_ORDER: DashaLord[] = ['Jupiter', 'Venus', 'Moon', 'Mercury', 'Sun', 'Mars', 'Saturn', 'Ketu', 'Rahu'];
function fallbackSupport(lord: DashaLord): DashaLord {
  return SUPPORT_ORDER.find((l) => l !== lord) ?? 'Jupiter';
}

export interface RemedyGuidance {
  remedies: RemedyTemplate[];
  /** Practices withheld because of a declared health flag, and why. */
  withheld: Array<{ title: string; reason: string }>;
  disclaimer: string;
}

/**
 * Practices for this period, filtered by what the citizen has told us.
 *
 * A bodily observance is never offered to somebody whose health flags make it a
 * bad idea — and the withholding is reported rather than silent, so the surface
 * can say "some practices are not shown because of what you've told us" instead
 * of quietly presenting a shorter list.
 */
export function buildRemedies(
  opts: { maha: DashaLord; antar: DashaLord },
  healthFlags: HealthFlag[] = [],
): RemedyGuidance {
  const flags = new Set(healthFlags);
  const pool = [
    ...REMEDY_TEMPLATES[opts.maha],
    ...(opts.antar === opts.maha ? [] : REMEDY_TEMPLATES[opts.antar]),
  ];

  const remedies: RemedyTemplate[] = [];
  const withheld: Array<{ title: string; reason: string }> = [];
  for (const r of pool) {
    const blocked = r.unsafeWith.filter((f) => flags.has(f));
    if (blocked.length > 0) {
      withheld.push({ title: r.title, reason: 'Not suggested given what you’ve shared about your health.' });
      continue;
    }
    remedies.push(r);
  }
  return { remedies, withheld, disclaimer: GEM_DISCLAIMER };
}
