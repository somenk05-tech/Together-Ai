import type { SignName } from '../astro-engine';
import type { DashaLord } from '../personal-factors';
import { GEMS, GEM_BY_ID, PRIMARY_BY_PLANET } from './gem-catalog';
import type { Gem, GemPlanet } from './gem-types';
import { TRIAL_NOTE, TRIAL_REQUIRED, WEARING, planetOf, type WearingRule } from './wearing';
import { priceAtWeight, recommendedWeight, type GemWeight } from './gem-weight';

/**
 * Which stones this chart calls for — and, just as importantly, how few.
 *
 * THE SHOP DOES NOT CHOOSE. Thirty stones exist; a chart names at most five,
 * and each one arrives with the ROLE it plays rather than a rank in a list. A
 * marketplace that opens on all thirty is a jewellery site with an astrology
 * theme, which is the thing this surface is explicitly not.
 *
 * THE FIVE ROLES, in the data sheet's own priority:
 *
 *   LIFE      the lagna lord's stone — the ascendant's own ruler, and the one
 *             stone traditional practice treats as always safe to wear. Needs
 *             a birth time, because without one there is no ascendant.
 *   FORTUNE   the ninth lord's stone. The ninth house is fortune, faith and the
 *             father; its lord's gem is the second pillar of the pair.
 *   PERIOD    the running mahadasha lord's stone — the season you are in rather
 *             than the chart you were born with, so it changes over a lifetime
 *             and the others do not.
 *   MOON      the moon rashi's lord. This is the FALLBACK, and it is what a
 *             citizen with no birth time gets instead of nothing.
 *   NUMBER    the life-path number's stone. Not Jyotish at all — a different
 *             tradition, offered as such and ranked last.
 *
 * A STONE HOLDS ONE ROLE, THE HIGHEST IT QUALIFIES FOR. Leo lagna in a Sun
 * mahadasha does not get two rubies; it gets one, with both reasons on it. The
 * first version of this listed the same stone three times and looked, fairly,
 * like a shop padding a page.
 */

/**
 * Sign rulership — fixed, standard Parashari, and the same twelve rows in every
 * text. Not a judgement and not owner data: this is what the word "lagna lord"
 * means.
 */
const SIGNS_IN_ORDER: SignName[] = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
];

const RULER: Record<SignName, GemPlanet> = {
  Aries: 'mars', Taurus: 'venus', Gemini: 'mercury', Cancer: 'moon',
  Leo: 'sun', Virgo: 'mercury', Libra: 'venus', Scorpio: 'mars',
  Sagittarius: 'jupiter', Capricorn: 'saturn', Aquarius: 'saturn', Pisces: 'jupiter',
};

/** The sign N houses on from a given one, counting the sign itself as the 1st. */
export function houseFrom(sign: SignName, house: number): SignName {
  const i = SIGNS_IN_ORDER.indexOf(sign);
  return SIGNS_IN_ORDER[(i + house - 1 + 120) % 12];
}

export const lordOf = (sign: SignName): GemPlanet => RULER[sign];

export type GemRole = 'life' | 'fortune' | 'period' | 'moon' | 'number';

/** Ranked in the order the data sheet gives; the array index IS the priority. */
const ROLE_ORDER: GemRole[] = ['life', 'fortune', 'period', 'moon', 'number'];

export const ROLE_LABEL: Record<GemRole, string> = {
  life: 'Life stone',
  fortune: 'Fortune stone',
  period: 'Stone for this period',
  moon: 'Moon stone',
  number: 'Number stone',
};

/** A stone, at the weight this person is prescribed, with what that costs. */
export interface GemAtWeight {
  gem: Gem;
  /** Null when we were never told a body weight — the figure is not invented. */
  weight: GemWeight | null;
  fromInr: number | null;
  toInr: number | null;
}

/**
 * HOW STRONGLY, in a word.
 *
 * A page that hands somebody four stones and lets them work out the order is a
 * page that has done the hard part and stopped one step short. The tradition is
 * not neutral between these: the lagna lord's stone is the one always safe to
 * wear and the one to wear if you wear only one; everything after it is
 * addition. So the sheets are RANKED, the rank is on the card, and the first
 * one says outright that it is the one to buy first.
 *
 * The rank comes from the ORDER, not from the role — because the order changes.
 * Without a birth time there is no life stone, the moon rashi's stone leads
 * instead, and it is then genuinely the must-have rather than the fourth thing
 * on a list.
 */
export type GemPriority = 'must-have' | 'strong' | 'recommended' | 'optional';

export const PRIORITY_LABEL: Record<GemPriority, string> = {
  'must-have': 'Must have',
  strong: 'Strongly recommended',
  recommended: 'Recommended',
  optional: 'Optional',
};

/** What the rank actually means for somebody deciding what to buy. */
export const PRIORITY_NOTE: Record<GemPriority, string> = {
  'must-have': 'If you wear only one stone, wear this one. It is the stone traditionally considered safe to wear for a whole life.',
  strong: 'Worn alongside the first, never instead of it — the two together are the traditional pair.',
  recommended: 'Worth adding once the stones above it are in place.',
  optional: 'Only if you want it. Nothing about your chart asks for it before the others.',
};

const priorityOf = (rank: number): GemPriority =>
  rank === 1 ? 'must-have' : rank === 2 ? 'strong' : rank === 3 ? 'recommended' : 'optional';

export interface GemRecommendation {
  gem: Gem;
  role: GemRole;
  /** 1 is the one to buy first. The whole list is ordered by it. */
  rank: number;
  priority: GemPriority;
  /** Other stones on this page whose planets are traditional allies, by name.
   *  Named only where the wearing table says they are — the enmity list is a
   *  separate file we do not have, so this asserts the positive and never the
   *  negative. */
  wornWith: string[];
  /** What this stone costs AT THE WEIGHT PRESCRIBED — the only price figure
   *  anybody can act on. Null together with the weight. */
  weight: GemWeight | null;
  fromInr: number | null;
  toInr: number | null;
  /** Every reason this stone came up, best first — a stone may hold one role
   *  and still be justified three ways. */
  reasons: string[];
  wearing: WearingRule;
  /** The 72-hour trial note, on the three stones that carry it. */
  trialNote: string | null;
  /** Cheaper stones for the same planet — priced at the HEAVIER weight the
   *  tradition asks of a substitute, which is the figure that decides whether
   *  it is actually cheaper. */
  substitutes: GemAtWeight[];
}

export interface GemChartInput {
  /** From the master profile, entered once. Null if never given — the weight
   *  rule then returns nothing rather than an average. */
  bodyKg?: number | null;
  /** Null when the birth time is unknown — the ascendant cannot be computed. */
  ascendant: SignName | null;
  moonSign: SignName;
  mahadasha: DashaLord;
  antardasha: DashaLord;
  lifePath: number;
}

/** Everything the design studio needs for ONE stone, by id. */
export interface GemDesignBrief {
  gem: Gem;
  weight: GemWeight | null;
  fromInr: number | null;
  toInr: number | null;
  wearing: WearingRule;
  /** The recommended stone this one stands in for, if it is a substitute. */
  standsInFor: string | null;
}

export interface GemRecommendations {
  /** What the recommendation was read from, shown as a labelled strip. The
   *  Astrology Zone's voice rule allows this: panels may name the machinery,
   *  prose may not. */
  chart: {
    ascendant: SignName | null;
    moonSign: SignName;
    mahadasha: DashaLord;
    antardasha: DashaLord;
    lifePath: number;
    /** What the carat figures were worked out from. Null if never given. */
    bodyKg: number | null;
  };
  /** True when there is no birth time, so life and fortune stones are absent. */
  timeUnknown: boolean;
  /** True when there is no body weight, so no carat figure is offered. */
  weightUnknown: boolean;
  recommendations: GemRecommendation[];
}

/**
 * The stones for one chart.
 *
 * NO BIRTH TIME IS A DIFFERENT ANSWER, NOT A WORSE ONE. Without it there is no
 * ascendant, so the two stones that depend on it are not computed — not
 * guessed, not defaulted to a noon chart and presented as fact. The moon rashi
 * stone leads instead, and the surface says why one is missing.
 */
export function recommendGems(input: GemChartInput): GemRecommendations {
  const timeUnknown = input.ascendant === null;

  // Each candidate names a planet, a role and the sentence explaining it.
  const candidates: { planet: GemPlanet; role: GemRole; reason: string }[] = [];

  if (input.ascendant) {
    const lagnaLord = lordOf(input.ascendant);
    candidates.push({
      planet: lagnaLord, role: 'life',
      reason: `Your ascendant is ${input.ascendant}, whose ruler is ${title(lagnaLord)}. Its stone is the one traditionally worn for a whole life rather than a season.`,
    });
    const ninth = houseFrom(input.ascendant, 9);
    candidates.push({
      planet: lordOf(ninth), role: 'fortune',
      reason: `The ninth from your ascendant is ${ninth}, ruled by ${title(lordOf(ninth))} — the house of fortune, and the second stone of the traditional pair.`,
    });
  }

  candidates.push({
    planet: planetOf(input.mahadasha), role: 'period',
    reason: `You are in a ${input.mahadasha} period, with ${input.antardasha} running inside it. This is the stone for the season you are in${timeUnknown ? ', read from your birth date' : ''}.`,
  });

  candidates.push({
    planet: lordOf(input.moonSign), role: 'moon',
    reason: `Your moon sign is ${input.moonSign}, ruled by ${title(lordOf(input.moonSign))}.${timeUnknown ? ' Without a birth time this is the steadiest reading available.' : ''}`,
  });

  const numberGem = GEMS.find((g) => g.kind === 'primary' && g.numerologyNumber === input.lifePath);
  if (numberGem) {
    candidates.push({
      planet: numberGem.planet, role: 'number',
      reason: `Your life-path number is ${input.lifePath}, which this stone carries in numerology — a different tradition from the rest of this page, offered as such.`,
    });
  }

  // ONE ENTRY PER STONE, holding its highest role and every reason it earned.
  const byPlanet = new Map<GemPlanet, { role: GemRole; reasons: string[] }>();
  for (const c of candidates) {
    const seen = byPlanet.get(c.planet);
    if (!seen) { byPlanet.set(c.planet, { role: c.role, reasons: [c.reason] }); continue; }
    seen.reasons.push(c.reason);
    if (ROLE_ORDER.indexOf(c.role) < ROLE_ORDER.indexOf(seen.role)) seen.role = c.role;
  }

  // The STONE has a say in its own weight — coral is worn heavy and sapphire
  // light, and a single body-weight rule applied to both is how a hundred-kilo
  // citizen was prescribed nine carats of Neelam.
  const at = (gem: Gem): GemAtWeight => {
    const weight = recommendedWeight(input.bodyKg, gem.planet, gem.kind);
    const price = weight ? priceAtWeight(weight.carats, gem.perCaratMinInr, gem.perCaratMaxInr) : null;
    return { gem, weight, fromInr: price?.fromInr ?? null, toInr: price?.toInr ?? null };
  };

  const recommendations: GemRecommendation[] = [];
  for (const [planet, { role, reasons }] of byPlanet) {
    const gem = PRIMARY_BY_PLANET.get(planet);
    if (!gem) continue;   // nine planets, nine primaries — but never assume it
    const priced = at(gem);
    recommendations.push({
      gem, role, reasons,
      // Both replaced below, once the list is in its final order.
      rank: 0, priority: 'optional', wornWith: [],
      weight: priced.weight, fromInr: priced.fromInr, toInr: priced.toInr,
      wearing: WEARING[planet],
      trialNote: TRIAL_REQUIRED.has(gem.id) ? TRIAL_NOTE : null,
      substitutes: GEMS.filter((g) => g.substituteFor === gem.id).map((g) => at(g)),
    });
  }
  recommendations.sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role));

  // THE RANK IS THE POSITION, ASSIGNED LAST. Doing it from the role would put a
  // moon stone fourth on a page where it is the only stone there is.
  recommendations.forEach((r, i) => {
    r.rank = i + 1;
    r.priority = priorityOf(r.rank);
  });
  // Which of these are traditionally worn together. The wearing table lists
  // each planet's allies; anything not on it is simply not claimed either way.
  for (const r of recommendations) {
    const allies = new Set(WEARING[r.gem.planet].allies);
    r.wornWith = recommendations
      .filter((o) => o.gem.id !== r.gem.id && allies.has(o.gem.planet))
      .map((o) => o.gem.name);
  }

  return {
    chart: {
      ascendant: input.ascendant, moonSign: input.moonSign,
      mahadasha: input.mahadasha, antardasha: input.antardasha, lifePath: input.lifePath,
      bodyKg: typeof input.bodyKg === 'number' ? input.bodyKg : null,
    },
    timeUnknown,
    weightUnknown: recommendedWeight(input.bodyKg, 'sun') === null,
    recommendations,
  };
}

const title = (p: GemPlanet) => p.charAt(0).toUpperCase() + p.slice(1);


/**
 * One stone, priced and sized for this person — for the design studio, which
 * arrives by URL and therefore cannot be handed the recommendation object.
 *
 * IT DOES NOT CHECK THAT THE STONE WAS RECOMMENDED, and that is deliberate: the
 * page it serves is reached from a "design this" button beside a stone the
 * citizen chose, and one of those buttons sits beside a cheaper SUBSTITUTE.
 * Refusing anything outside the top five would refuse the alternative it just
 * offered. What it will not do is invent a weight — no body weight, no figure,
 * exactly as everywhere else.
 */
export function designBrief(gemId: string, bodyKg: number | null | undefined): GemDesignBrief | null {
  const gem = GEM_BY_ID.get(gemId);
  if (!gem) return null;
  const weight = recommendedWeight(bodyKg, gem.planet, gem.kind);
  const price = weight ? priceAtWeight(weight.carats, gem.perCaratMinInr, gem.perCaratMaxInr) : null;
  return {
    gem,
    weight,
    fromInr: price?.fromInr ?? null,
    toInr: price?.toInr ?? null,
    wearing: WEARING[gem.planet],
    standsInFor: gem.substituteFor ? GEM_BY_ID.get(gem.substituteFor)?.name ?? null : null,
  };
}
