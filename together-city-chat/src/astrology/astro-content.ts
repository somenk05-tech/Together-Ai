/**
 * Astrology content composer — deterministic, chart-driven editorial text.
 *
 * Every sentence is selected from curated pools using a seeded PRNG whose seed
 * is (userId + period), so a user's reading is stable for the whole day/month,
 * differs between users, and changes naturally when the sky changes. All
 * astrological claims come from the REAL positions computed in astro-engine —
 * the composer only puts words to them.
 */

import {
  BodyPosition, MonthAstro, NatalChart, SignName, aspectBetween, moonPhaseName,
  julianDay, positionsAt, HARMONIOUS, CHALLENGING, AspectType,
} from './astro-engine';
import type { Numerology, Dasha } from './personal-factors';

// ───────────────────────── Seeded randomness ─────────────────────────

export function hashSeed(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = <T,>(rng: () => number, arr: T[]): T => arr[Math.floor(rng() * arr.length) % arr.length];

export const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length;

// ───────────────────────── Sign & planet vocabulary ─────────────────────────

interface SignTraits {
  element: string; keywords: string[]; strength: string; watchout: string;
  love: string; work: string; health: string; money: string;
}
const T: Record<SignName, SignTraits> = {
  Aries: { element: 'fire', keywords: ['initiative', 'courage', 'directness'], strength: 'your ability to start things nobody else dares to', watchout: 'impatience that turns small delays into big frustrations', love: 'direct and passionate', work: 'fast-moving and pioneering', health: 'high energy that needs a physical outlet', money: 'bold but sometimes impulsive' },
  Taurus: { element: 'earth', keywords: ['stability', 'patience', 'persistence'], strength: 'the steady persistence that finishes what others abandon', watchout: 'stubbornness when circumstances genuinely call for change', love: 'loyal and sensual', work: 'methodical and reliable', health: 'steady stamina that thrives on routine', money: 'security-minded and patient' },
  Gemini: { element: 'air', keywords: ['communication', 'curiosity', 'adaptability'], strength: 'your gift for connecting people and ideas', watchout: 'scattering energy across too many parallel threads', love: 'playful and mentally engaged', work: 'versatile and quick', health: 'a busy mind that needs proper rest', money: 'clever but easily distracted' },
  Cancer: { element: 'water', keywords: ['intuition', 'care', 'memory'], strength: 'emotional intelligence that reads a room instantly', watchout: 'retreating into your shell when a conversation would fix things', love: 'nurturing and deeply loyal', work: 'protective and intuitive', health: 'sensitive digestion tied to emotional weather', money: 'careful and home-oriented' },
  Leo: { element: 'fire', keywords: ['confidence', 'warmth', 'leadership'], strength: 'the warmth that makes people want to follow you', watchout: 'letting pride argue when listening would win', love: 'generous and wholehearted', work: 'creative and commanding', health: 'vitality that dims without recognition and play', money: 'generous, sometimes to a fault' },
  Virgo: { element: 'earth', keywords: ['precision', 'service', 'analysis'], strength: 'an eye for detail that catches what everyone else misses', watchout: 'perfectionism that delays good-enough work', love: 'attentive and quietly devoted', work: 'exacting and dependable', health: 'benefits enormously from clean routine', money: 'analytical and prudent' },
  Libra: { element: 'air', keywords: ['balance', 'diplomacy', 'fairness'], strength: 'the diplomacy that turns conflict into partnership', watchout: 'indecision when a choice simply must be made', love: 'romantic and partnership-focused', work: 'collaborative and tasteful', health: 'equilibrium — too much of anything unsettles you', money: 'balanced but tempted by beauty' },
  Scorpio: { element: 'water', keywords: ['intensity', 'depth', 'strategy'], strength: 'a strategic depth others underestimate', watchout: 'holding grudges that quietly drain you', love: 'intense and all-in', work: 'focused and transformative', health: 'strong recovery powers when you truly rest', money: 'shrewd and private' },
  Sagittarius: { element: 'fire', keywords: ['vision', 'optimism', 'freedom'], strength: 'the optimism that finds a path where others see walls', watchout: 'overpromising in a moment of enthusiasm', love: 'adventurous and honest', work: 'big-picture and enterprising', health: 'thrives on movement and open air', money: 'expansive, occasionally overextended' },
  Capricorn: { element: 'earth', keywords: ['ambition', 'discipline', 'endurance'], strength: 'the discipline to build things that last decades', watchout: 'working past the point where rest would earn more', love: 'steadfast and slow-burning', work: 'ambitious and structured', health: 'bones, posture and pacing deserve attention', money: 'long-term and conservative' },
  Aquarius: { element: 'air', keywords: ['innovation', 'independence', 'community'], strength: 'seeing the future a few steps before everyone else', watchout: 'detaching when people need you present', love: 'unconventional and friendship-first', work: 'inventive and reform-minded', health: 'circulation and nervous system like variety', money: 'idealistic with sudden inspirations' },
  Pisces: { element: 'water', keywords: ['imagination', 'empathy', 'flow'], strength: 'an imagination that dissolves impossible problems', watchout: 'drifting when a deadline needs hard edges', love: 'romantic and selfless', work: 'creative and compassionate', health: 'sleep and water are your true medicines', money: 'generous — keep one practical anchor' },
};

const PLANET_DOMAIN: Record<string, string> = {
  Sun: 'vitality and visibility', Moon: 'mood and instinct', Mercury: 'communication, paperwork and travel plans',
  Venus: 'love, beauty and money', Mars: 'drive, ambition and conflict', Jupiter: 'growth, luck and opportunity',
  Saturn: 'discipline, structure and long-term duty',
};

const ASPECT_TONE: Record<AspectType, string> = {
  conjunction: 'concentrates', sextile: 'gently supports', square: 'challenges', trine: 'smoothly energises', opposition: 'polarises',
};

// ───────────────────────── Shared helpers ─────────────────────────

interface TransitHit { planet: string; type: AspectType; target: 'Sun' | 'Moon'; orb: number; harmonious: boolean }

function hitsAgainstNatal(transits: BodyPosition[], chart: NatalChart, maxOrb = 4): TransitHit[] {
  const out: TransitHit[] = [];
  for (const t of transits) {
    if (t.planet === 'Moon') continue;
    for (const natal of [chart.sun, chart.moon] as const) {
      const asp = aspectBetween(t.lon, natal.lon);
      if (asp && asp.orb <= maxOrb) {
        out.push({
          planet: t.planet, type: asp.type, target: natal.planet as 'Sun' | 'Moon', orb: asp.orb,
          harmonious: HARMONIOUS.includes(asp.type) || (asp.type === 'conjunction' && (t.planet === 'Venus' || t.planet === 'Jupiter')),
        });
      }
    }
  }
  return out.sort((a, b) => a.orb - b.orb);
}

const fmtList = (xs: string[]) => xs.length <= 1 ? (xs[0] ?? '') : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1];
const ordinal = (n: number) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]); };

// ───────────────────────── Daily horoscope ─────────────────────────

export interface DailyReading { date: string; theme: string; text: string; moonPhase: string; sunSign: SignName; words: number }

export function composeDaily(chart: NatalChart, userSeed: string, date: Date): DailyReading {
  const iso = date.toISOString().slice(0, 10);
  const rng = mulberry32(hashSeed(userSeed + iso));
  const jd = julianDay(new Date(date.getTime()));
  const transits = positionsAt(jd);
  const hits = hitsAgainstNatal(transits, chart);
  const sun = T[chart.sun.sign];
  const moonT = transits.find((t) => t.planet === 'Moon')!;
  const mercury = transits.find((t) => t.planet === 'Mercury')!;
  const venus = transits.find((t) => t.planet === 'Venus')!;
  const mars = transits.find((t) => t.planet === 'Mars')!;
  const phase = moonPhaseName(jd);

  const parts: string[] = [];
  const lead = hits[0];
  let theme: string;
  if (lead && lead.harmonious) {
    theme = pick(rng, ['A day that works with you', 'Momentum comes easily today', 'A supportive sky', 'Green lights ahead']);
    parts.push(pick(rng, [
      `${lead.planet} ${ASPECT_TONE[lead.type]} your natal ${lead.target} today, which puts ${PLANET_DOMAIN[lead.planet]} firmly on your side.`,
      `With ${lead.planet} in a flowing ${lead.type} to your ${lead.target}, ${PLANET_DOMAIN[lead.planet]} moves in your favour — use it deliberately rather than letting the day drift.`,
    ]));
  } else if (lead) {
    theme = pick(rng, ['A day for steady hands', 'Patience pays today', 'Handle with care', 'Slow is smooth today']);
    parts.push(pick(rng, [
      `${lead.planet} ${ASPECT_TONE[lead.type]} your natal ${lead.target} today, so friction around ${PLANET_DOMAIN[lead.planet]} is possible — treat it as a test of pacing, not a verdict.`,
      `A ${lead.type} from ${lead.planet} to your ${lead.target} can make ${PLANET_DOMAIN[lead.planet]} feel heavier than usual; keep decisions small and reversible.`,
    ]));
  } else {
    theme = pick(rng, ['A quiet, clear day', 'An open sky', 'Your day to set the tone']);
    parts.push(pick(rng, [
      `No hard transits touch your chart today, which gives you an unusually clean slate — the day takes the shape you give it.`,
      `The sky is quiet for you today; with nothing forcing your hand, your natural ${pick(rng, sun.keywords)} decides the tone.`,
    ]));
  }
  parts.push(pick(rng, [
    `The ${phase} Moon travels through ${moonT.sign}, tilting the emotional background toward ${fmtList(T[moonT.sign].keywords.slice(0, 2))}.`,
    `Emotionally, the ${phase} in ${moonT.sign} colours the day — expect ${fmtList(T[moonT.sign].keywords.slice(0, 2))} to run underneath everything.`,
  ]));
  parts.push(mercury.retrograde
    ? pick(rng, [
      `Mercury is retrograde in ${mercury.sign}: re-read before you send, confirm timings twice, and favour finishing over launching.`,
      `With Mercury retrograde in ${mercury.sign}, double-check messages and travel details — revisions, not launches, are favoured.`,
    ])
    : pick(rng, [
      `Mercury moves direct through ${mercury.sign}, keeping conversations ${T[mercury.sign].element === 'air' ? 'quick and clear' : 'grounded and practical'} — a good window for the talk you have postponed.`,
      `Communication flows well with Mercury in ${mercury.sign}; put the important conversation or email in today rather than next week.`,
    ]));
  parts.push(pick(rng, [
    `In matters of the heart, Venus in ${venus.sign} favours a ${T[venus.sign].love} approach.`,
    `Venus in ${venus.sign} softens relationships toward the ${T[venus.sign].love}; a small gesture lands better than a grand plan.`,
  ]));
  parts.push(pick(rng, [
    `Mars in ${mars.sign} sets the day's drive — channel it into ${T[mars.sign].work} work and avoid spending it on arguments${mars.retrograde ? ', especially with Mars retrograde asking you to redo rather than push' : ''}.`,
    `Your energy runs ${T[mars.sign].element === 'fire' ? 'hot' : T[mars.sign].element === 'earth' ? 'steady' : T[mars.sign].element === 'air' ? 'restless' : 'deep'} with Mars in ${mars.sign}${mars.retrograde ? ' (retrograde — pace it)' : ''}; one focused push beats five scattered ones.`,
  ]));
  parts.push(pick(rng, [
    `Lean on ${sun.strength}, and watch for ${sun.watchout}.`,
    `Your edge today is ${sun.strength}; the trap to sidestep is ${sun.watchout}.`,
    `Play to ${sun.strength} — and if the day snags, it will most likely be through ${sun.watchout}.`,
  ]));

  let text = parts.join(' ');
  if (wordCount(text) < 100) {
    text += ' ' + pick(rng, [
      'Keep money decisions boring today: steady beats spectacular, and anything urgent-sounding deserves a second look tomorrow.',
      'Health-wise, honour the basics — water, a proper meal and twenty unhurried minutes outdoors will do more than any hack.',
      'If a decision can wait a day, let it; if it cannot, choose the option you would still defend a month from now.',
    ]);
  }
  return { date: iso, theme, text, moonPhase: phase, sunSign: chart.sun.sign, words: wordCount(text) };
}

// ───────────────────────── Monthly horoscope ─────────────────────────

// ───────────────────────── Personal Guidance Engine (daily) ─────────────────────────

export interface GuidanceSection { key: string; title: string; icon: string; body: string }
export interface LuckyElements { number: number; color: string; time: string; direction: string }
export interface DailyGuidance {
  date: string;
  framing: string;               // honest "guidance, not prediction" note
  theme: string;
  moonPhase: string;
  sunSign: SignName;
  numerology: { lifePath: number; personalYear: number; personalMonth: number; personalDay: number };
  dasha: { maha: string; antar: string };
  sections: GuidanceSection[];   // career, relationships, health, finance, growth
  lucky: LuckyElements;
  reflection: string;
  text: string;                  // flattened prose (history + back-compat)
  words: number;
}

const LUCKY_COLORS: Record<string, string[]> = {
  fire: ['red', 'saffron', 'gold'], earth: ['forest green', 'brown', 'olive'],
  air: ['sky blue', 'silver', 'soft white'], water: ['sea green', 'deep blue', 'pearl white'],
};
const DIRECTION_BY_ELEMENT: Record<string, string> = { fire: 'south', earth: 'south-west', air: 'west', water: 'north' };
const TIME_OF_DAY = ['early morning', 'late morning', 'afternoon', 'early evening'];
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/**
 * The Personal Guidance Engine — structured, emotionally-intelligent guidance
 * across Career, Relationships, Health, Finance and Personal Growth, plus lucky
 * elements and a reflection prompt. Combines the birth chart, today's transits,
 * numerology and the running Dasha. Deterministic (the honest floor); the
 * service AI-polishes the wording without changing the facts. Nothing here is a
 * prediction — it's guidance to think with.
 */
export function composeGuidance(chart: NatalChart, userSeed: string, date: Date, num: Numerology, dasha: Dasha): DailyGuidance {
  const iso = date.toISOString().slice(0, 10);
  const rng = mulberry32(hashSeed(userSeed + iso + 'g3'));
  const jd = julianDay(new Date(date.getTime()));
  const transits = positionsAt(jd);
  const hits = hitsAgainstNatal(transits, chart);
  const find = (p: string) => transits.find((t) => t.planet === p)!;
  const moonT = find('Moon'), mercury = find('Mercury'), venus = find('Venus'), mars = find('Mars'), jupiter = find('Jupiter');
  const phase = moonPhaseName(jd);
  const sun = T[chart.sun.sign];
  const lead = hits[0];
  const waxing = /(New|Waxing)/.test(phase);

  const theme = lead
    ? (lead.harmonious ? pick(rng, ['A day that works with you', 'Supportive momentum', 'Green lights ahead'])
                       : pick(rng, ['A day for steady hands', 'Patience pays today', 'Slow is smooth today']))
    : pick(rng, ['A quiet, open day', 'Your day to set the tone', 'A clear sky']);

  const career = [
    mercury.retrograde
      ? `With Mercury retrograde in ${mercury.sign}, today favours reviewing, finishing and double-checking over launching. If an important decision can wait a day, letting it may lead to a better outcome than reacting immediately.`
      : `Mercury in ${mercury.sign} supports clear communication — a good window to have the conversation, or send the message, you've been putting off. Say it plainly and calmly.`,
    `Your numerology cycle leans toward ${num.dayFocus}, so ${num.personalDay === 9 ? 'closing open loops before starting something new will feel especially satisfying' : num.personalDay === 1 ? 'a small, deliberate first step counts more than a grand plan' : 'steady, unhurried progress serves you better than pushing hard'}.`,
    `In your longer ${dasha.maha} period — a season of ${dasha.theme} — effort tends to compound when it stays consistent rather than dramatic.`,
  ].join(' ');

  const relationships = `Venus in ${venus.sign} favours a ${T[venus.sign].love} approach; a small, sincere gesture will likely land better than a grand one. The ${phase} Moon in ${moonT.sign} tilts the mood toward ${fmtList(T[moonT.sign].keywords.slice(0, 2))} — if a conversation matters today, listening carefully first may do more than reacting quickly.`;

  const health = `Your energy runs ${T[mars.sign].element === 'fire' ? 'hot' : T[mars.sign].element === 'earth' ? 'steady' : T[mars.sign].element === 'air' ? 'restless' : 'deep'} with Mars in ${mars.sign}${mars.retrograde ? ' (retrograde — pace yourself)' : ''}. ${cap(sun.health)} — so honour the basics: water, one proper meal, and twenty unhurried minutes of movement or fresh air will do more than any quick fix.`;

  const finance = `Money tends to reward ${T[venus.sign].money} choices right now. With a Personal Year themed around ${num.yearTheme}, a simple test helps before any spend or commitment: does this serve where you're actually heading this year? ${jupiter.retrograde ? 'Jupiter retrograde gently suggests consolidating what you have over chasing something new.' : `Jupiter in ${jupiter.sign} favours patient, considered growth over quick wins.`}`;

  const growth = `Your Life Path ${num.lifePath} carries ${num.lifePathMeaning}; today asks for one honest, small step rather than a leap. The ${phase} is a natural moment to ${waxing ? 'set an intention and begin' : 'release something you\'ve outgrown'} — trust that quiet, repeated effort is doing more than it appears to.`;

  const el = sun.element;
  const lucky: LuckyElements = {
    number: num.personalDay,
    color: pick(rng, LUCKY_COLORS[el] ?? LUCKY_COLORS.air),
    time: pick(rng, TIME_OF_DAY),
    direction: DIRECTION_BY_ELEMENT[el] ?? 'east',
  };

  const reflection = pick(rng, [
    `This evening, note one thing you accomplished recently and one small step you'd like to take tomorrow. Naming both turns a busy day into a clear one.`,
    `Before bed, write down one moment today you're quietly proud of, and one worry you can set down until morning.`,
    `Take five minutes tonight to ask: what deserves a little more of my attention this week, and what deserves a little less? Let the answer be gentle.`,
  ]);

  const framing = `Reflective guidance from your birth chart, today's transits and your numerology — offered to help you think, not to predict what will happen. You always hold the pen.`;

  const sections: GuidanceSection[] = [
    { key: 'career', title: 'Career & Work', icon: '💼', body: career },
    { key: 'relationships', title: 'Relationships', icon: '❤️', body: relationships },
    { key: 'health', title: 'Health & Energy', icon: '🌿', body: health },
    { key: 'finance', title: 'Finance', icon: '💰', body: finance },
    { key: 'growth', title: 'Personal Growth', icon: '🌱', body: growth },
  ];
  const text = sections.map((s) => s.body).join('\n\n');
  return {
    date: iso, framing, theme, moonPhase: phase, sunSign: chart.sun.sign,
    numerology: { lifePath: num.lifePath, personalYear: num.personalYear, personalMonth: num.personalMonth, personalDay: num.personalDay },
    dasha: { maha: dasha.maha, antar: dasha.antar },
    sections, lucky, reflection, text, words: wordCount(text),
  };
}

export interface MonthlySection { key: string; title: string; body: string }
export interface MonthlyReading {
  month: string; title: string; sections: MonthlySection[]; words: number;
  bestDates: number[]; cautionDates: number[];
  framing?: string;
  numerology?: { lifePath: number; personalYear: number; personalMonth: number };
  dasha?: { maha: string; antar: string };
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function composeMonthly(chart: NatalChart, userSeed: string, astro: MonthAstro, num?: Numerology, dasha?: Dasha): MonthlyReading {
  const monthName = `${MONTHS[astro.month - 1]} ${astro.year}`;
  const rng = mulberry32(hashSeed(userSeed + `${astro.year}-${astro.month}`));
  const sun = chart.sun.sign, moon = chart.moon.sign;
  const asc = chart.ascendant?.sign ?? null;
  const st = T[sun], mt = T[moon];
  const tr = (p: string) => astro.transits.find((t) => t.planet === p)!;
  const hits = hitsAgainstNatal(astro.transits, chart, 5);
  const harm = hits.filter((h) => h.harmonious);
  const tough = hits.filter((h) => !h.harmonious);
  const P = (...ss: string[]) => ss.join(' ');
  const para = (...ps: string[]) => ps.filter(Boolean).join('\n\n');

  const jupiter = tr('Jupiter'), saturn = tr('Saturn'), venus = tr('Venus'), mars = tr('Mars'), mercury = tr('Mercury');

  const sections: MonthlySection[] = [];

  sections.push({
    key: 'intro', title: `Your ${monthName} at a Glance`, body: para(
      P(
        `${monthName} opens with your ${sun} Sun ${asc ? `and ${asc} rising ` : ''}meeting a sky that asks for ${tough.length > harm.length ? 'patience before ambition' : 'deliberate, confident movement'}.`,
        `Jupiter spends the month in ${jupiter.sign}, expanding ${PLANET_DOMAIN.Jupiter} through the lens of ${fmtList(T[jupiter.sign].keywords.slice(0, 2))}, while Saturn in ${saturn.sign} keeps ${PLANET_DOMAIN.Saturn} honest.`,
        `For a ${sun} — whose instinct is ${st.keywords[0]} — this combination rewards ${pick(rng, ['plans with structure behind them', 'commitments you can actually keep', 'a shorter list pursued harder', 'depth over breadth'])}.`,
      ),
      P(
        `Your Moon in ${moon} shapes how the month FEELS from the inside: expect your emotional weather to run through ${fmtList(mt.keywords)}.`,
        harm.length ? `The strongest support this month comes from ${harm[0].planet}, which ${ASPECT_TONE[harm[0].type]} your natal ${harm[0].target} — lean into it around the dates listed at the end of this reading.` : `No single transit carries you this month, which is quietly good news: progress will be earned, and therefore keepable.`,
        tough.length ? `The friction to respect comes from ${tough[0].planet} ${ASPECT_TONE[tough[0].type].replace(/s$/, '')}ing your ${tough[0].target}; the caution dates below mark when to keep stakes low.` : `Nothing in the sky actively works against you this month — your main opponent is ${st.watchout}.`,
      ),
      P(
        pick(rng, [
          `Read the sections below as one connected story: what happens in your career this month is linked to how you manage energy, and both feed the quality of your closest relationships.`,
          `Treat this month as a single project with several fronts — career, money, love, health — that all draw from the same reserve of ${st.keywords[1] ?? st.keywords[0]}.`,
        ]),
        `Where specific dates are named, they come from exact planetary geometry against your birth chart on the sidereal (Vedic) zodiac — Jyotish Shastra, not generic Western sign-only astrology.`,
      ),
    ),
  });

  if (num && dasha) {
    sections.push({
      key: 'cycle', title: 'Your Cycle & Timing', body: para(
        P(
          `Beyond the sky, your personal cycles set this month's tone. You're in a Personal Month ${num.personalMonth} inside a Personal Year ${num.personalYear} — a season emphasising ${num.yearTheme}.`,
          `Numerologically, ${monthName} leans toward ${num.personalMonth === 9 || num.personalMonth === 4 ? 'completing, consolidating and tidying loose ends' : num.personalMonth === 1 || num.personalMonth === 5 ? 'initiating, adapting and trying the new' : 'steady, relational progress rather than dramatic moves'}.`,
        ),
        P(
          `In the longer arc, you're moving through a ${dasha.maha} Mahādasha (with a ${dasha.antar} sub-period) — a chapter themed around ${dasha.theme}. It helps to read the month's events through that lens: what supports that theme tends to flow, and what fights it tends to feel heavier than it should.`,
        ),
        P(`Hold all of this as guidance to think with — timing that points to where your effort is likeliest to pay, never a fixed prediction. The choices stay yours.`),
      ),
    });
  }

  sections.push({
    key: 'career', title: 'Career & Business', body: para(
      P(
        `Professionally, the month is defined by Saturn in ${saturn.sign} ${saturn.retrograde ? '(retrograde — old obligations resurface for proper completion)' : ''} and Mars in ${mars.sign}.`,
        `Saturn asks a ${sun} to prove durability: ${pick(rng, ['document what you deliver', 'make one process actually repeatable', 'close the loop on the oldest open promise on your list', 'strengthen the foundations before adding another floor'])}.`,
        `Mars supplies the push — its ${T[mars.sign].element}-sign drive suits ${T[mars.sign].work} efforts${mars.retrograde ? ', though retrograde motion means revision and rework will outperform brand-new launches' : ''}.`,
      ),
      P(
        `Your natural working style is ${st.work}, and this month it meets ${tough.some((h) => h.planet === 'Saturn') ? 'testing conditions: expect at least one deadline, authority figure or structural limit to push back. The productive response is precision, not speed.' : 'reasonably open conditions: superiors and clients are more persuadable than usual, particularly in the window around the best dates below.'}`,
        `If you run a business, ${pick(rng, ['review pricing before adding customers', 'tighten one recurring cost you have stopped noticing', 'formalise the handshake agreements — Saturn favours contracts', 'invest in the boring infrastructure that removes your most common emergency'])}.`,
      ),
      P(
        `In meetings and negotiations, Mercury in ${mercury.sign} ${mercury.retrograde ? 'is retrograde: schedule signings and final commitments after it stations direct, and treat mid-month misunderstandings as clerical rather than personal.' : `keeps your reasoning ${T[mercury.sign].element === 'air' ? 'sharp and persuasive' : 'concrete and credible'} — a strong month for interviews, pitches and difficult conversations handled early.`}`,
        `The single best career habit for this month: ${pick(rng, ['finish visibly — completed work compounds under this sky', 'under-promise by ten percent and over-deliver quietly', 'protect two deep-work blocks a week as if they were client meetings', 'ask directly for the responsibility you want; the sky rewards the explicit'])}.`,
      ),
    ),
  });

  sections.push({
    key: 'money', title: 'Money', body: para(
      P(
        `Financially, Venus in ${venus.sign} and Jupiter in ${jupiter.sign} set the tone.`,
        `Venus governs what you are drawn to spend on, and in ${venus.sign} the pull is toward ${T[venus.sign].money} choices; Jupiter tempts expansion — worthwhile when it lands on assets, risky when it lands on lifestyle.`,
        `Your baseline money style is ${st.money}, so this month specifically ${pick(rng, ['budget the enthusiasm: cap any single discretionary purchase', 'automate the saving you keep meaning to do', 'audit subscriptions and standing payments — Saturn loves a cancelled leak', 'move one lump from idle to earning'])}.`,
      ),
      P(
        tough.some((h) => h.planet === 'Mars') ? `With Mars aspecting your chart harshly, impatience is the expensive emotion this month — the deal that "cannot wait" is precisely the one that should.` : `Nothing in the sky pushes you toward rash spending this month, which makes it a genuinely good window for planned, researched purchases.`,
        `Best financial windows fall on the dates listed below; keep large, irreversible commitments away from the caution dates.`,
        `A practical rule for ${monthName}: ${pick(rng, ['decide investments on paper a day before you execute them', 'let any windfall sit for seventy-two hours before it is assigned', 'review one insurance or protection gap — Saturn rewards it', 'track every rupee for one week; the data will surprise you once, then pay you monthly'])}.`,
      ),
    ),
  });

  sections.push({
    key: 'love', title: 'Love & Relationships', body: para(
      P(
        `Venus spends the month in ${venus.sign}, giving affection a ${T[venus.sign].love} flavour.`,
        `Your own style — ${st.love}, with a ${moon}-Moon inner life that needs ${fmtList(mt.keywords.slice(0, 2))} — ${['fire', 'air'].includes(T[venus.sign].element) === ['fire', 'air'].includes(st.element) ? 'moves in step with this sky, so expressing what you actually feel comes easier than usual' : 'runs slightly against this sky, so translate: say the practical thing if your partner needs it, even when you feel the poetic one'}.`,
      ),
      P(
        `For couples: ${pick(rng, ['plan one unhurried evening with phones elsewhere — the transits do the rest', 'the recurring argument softens if raised BEFORE it flares; pick a calm hour', 'shared logistics (money, family, home) benefit from one honest working session this month', 'novelty is the medicine — one new place or ritual resets the dynamic'])}`,
        `For singles: ${harm.some((h) => h.planet === 'Venus' || h.planet === 'Jupiter') ? 'this is an above-average month to be visible — accept the invitation you would normally decline, especially near the best dates.' : 'connection this month favours depth over volume; one real conversation outperforms ten exchanges of pleasantries.'}`,
      ),
      P(
        `Watch for ${st.watchout} in close quarters — under this sky it is the most likely source of unnecessary hurt.`,
        `The relationship habit that pays all month: ${pick(rng, ['appreciate specifically — name the thing, not just the person', 'repair fast; under Saturn, resentment compounds like interest', 'ask one more question before offering the solution', 'protect your own recovery time so you bring a full self to the table'])}.`,
      ),
    ),
  });

  sections.push({
    key: 'health', title: 'Health', body: para(
      P(
        `Vitality this month follows Mars in ${mars.sign}: energy runs ${T[mars.sign].element === 'fire' ? 'high and fast-burning — brilliant for training, hazardous for sleep if unspent' : T[mars.sign].element === 'earth' ? 'steady — ideal for building a routine that survives busy weeks' : T[mars.sign].element === 'air' ? 'in bursts — pair movement with something social or mental to sustain it' : 'deep but tidal — respect the low days instead of overriding them'}.`,
        `As a ${sun}, ${st.health}; your ${moon} Moon adds that ${mt.health}.`,
      ),
      P(
        tough.length ? `Because the month carries real friction (${tough[0].planet} against your ${tough[0].target}), stress will look for a physical exit — give it a scheduled one: ${pick(rng, ['three honest workouts a week', 'a daily walk that is not negotiable', 'one screen-free hour before bed', 'breathwork or stretching on the caution dates especially'])}.` : `With no harsh transits pressing on your chart, this is a consolidation month: the routine you establish now sticks unusually well.`,
        `Small clinical housekeeping — ${pick(rng, ['the postponed dental or eye check', 'a basic blood panel if it has been over a year', 'posture and workstation setup', 'hydration before caffeine each morning'])} — done this month prevents a nuisance later.`,
      ),
    ),
  });

  sections.push({
    key: 'family', title: 'Family', body: para(
      P(
        `The Moon rules your family sphere, and its lunations this month — ${astro.events.filter((e) => e.kind === 'lunation').map((e) => `the ${e.text} on the ${ordinal(e.day)}`).join(' and ') || 'a quiet lunar month'} — mark the emotional turning points at home.`,
        `A new moon favours beginnings (conversations, moves, plans); a full moon brings things to light — expect feelings already present to become visible, not new ones to be invented.`,
      ),
      P(
        `With your Moon in ${moon}, you are the family's ${pick(rng, ['emotional barometer', 'quiet anchor', 'organising memory', 'first responder'])}; this month, ${pick(rng, ['let someone else hold the logistics for one weekend', 'say the appreciative thing out loud — assumed gratitude reads as absence', 'one call to the relative you keep postponing settles more than you expect', 'set one gentle boundary and keep it warmly'])}.`,
        `Elders and children both respond well to routine under Saturn in ${saturn.sign} — shared meals at fixed times do invisible good.`,
      ),
    ),
  });

  sections.push({
    key: 'travel', title: 'Travel', body: para(
      P(
        `Travel is Mercury and Jupiter's territory. Mercury in ${mercury.sign} ${mercury.retrograde ? 'is retrograde for part of the month — build slack into itineraries, screenshot every confirmation, and prefer refundable fares' : 'is direct and cooperative — bookings, visas and paperwork move smoothly, particularly early in the month'}.`,
        `Jupiter in ${jupiter.sign} favours journeys with a purpose of ${['fire', 'air'].includes(T[jupiter.sign].element) ? 'discovery — new places over familiar ones' : 'consolidation — the family visit, the pilgrimage, the trip that completes something'}.`,
      ),
      P(
        `Best travel windows align with the favourable dates below; if a journey must fall on a caution date, keep connections generous and documents duplicated.`,
        pick(rng, [
          `Short trips outperform grand tours this month — two days well-planned will restore more than ten days improvised.`,
          `If a foreign matter (visa, admission, posting) is pending, advance it in the first half of the month and follow up in writing.`,
          `Pack lighter than feels safe; under this sky the freed attention is worth more than the third pair of options.`,
        ]),
      ),
    ),
  });

  const evLines = astro.events.slice(0, 10).map((e) => `On the ${ordinal(e.day)}, ${e.text.toLowerCase().startsWith('new') || e.text.toLowerCase().startsWith('full') ? e.text.replace(/^(\w)/, (c) => c.toLowerCase()) : e.text} ${e.kind === 'ingress' ? 'shifts the collective focus toward ' + fmtList(T[(e.text.split(' enters ')[1] as SignName)]?.keywords?.slice(0, 2) ?? ['new priorities']) : e.kind === 'retrograde' ? '— adjust plans in that planet\'s domain accordingly' : 'marks an emotional pivot for the month'}.`);
  sections.push({
    key: 'events', title: 'Important Planetary Events', body: para(
      `These are the sky's actual headlines for ${monthName}, computed from planetary motion rather than copied from a generic calendar:`,
      evLines.length ? evLines.join('\n\n') : 'A rare quiet month: no sign changes or stations occur — momentum carries, uninterrupted.',
      `Events involving ${pick(rng, ['Mercury touch your paperwork and conversations first', 'Venus touch your relationships and finances first', 'Mars touch your energy and deadlines first'])}; note how each lands relative to your ${sun} Sun and plan the adjacent days with a little extra margin.`,
    ),
  });

  sections.push({
    key: 'best', title: 'Best Dates This Month', body: para(
      astro.bestDates.length
        ? P(
          `Your strongest dates are ${fmtList(astro.bestDates.map(ordinal))} — days when supportive geometry (Venus, Jupiter or the Sun in flowing aspect to your natal chart) is exact or near-exact.`,
          `Use them for what matters most: ${pick(rng, ['the pitch, the proposal, the launch', 'first meetings and important asks', 'signing, submitting, publishing', 'the conversation that needs its best odds'])}.`,
        )
        : `No standout supportive alignments peak this month — treat it as evenly weighted and let preparation, not timing, create your advantage.`,
      `A best date is a tailwind, not a guarantee: it improves the odds of the work you bring to it.`,
    ),
  });

  sections.push({
    key: 'caution', title: 'Dates to Be Cautious', body: para(
      astro.cautionDates.length
        ? P(
          `Handle ${fmtList(astro.cautionDates.map(ordinal))} with extra care — Mars or Saturn presses on your natal Sun or Moon around these days.`,
          `Nothing about them is dangerous; they are simply poor value for launches, confrontations and irreversible signatures. Schedule maintenance, routine work and rest there instead.`,
        )
        : `No harsh alignments peak against your chart this month — an uncommonly clean slate. Ordinary prudence is enough.`,
      `If something unavoidable falls on a caution date, slow the tempo: confirm twice, leave earlier, and keep your ${st.watchout} on a short leash.`,
    ),
  });

  sections.push({
    key: 'summary', title: 'Monthly Summary', body: para(
      P(
        `${monthName} asks your ${sun} nature to ${tough.length > harm.length ? 'trade speed for durability' : 'move while the moving is good'}.`,
        `Career rewards ${saturn.retrograde ? 'completion of old business' : 'structured ambition'}; money favours ${T[venus.sign].money} choices; love deepens through the ${T[venus.sign].love}; health follows whatever routine you actually keep.`,
      ),
      P(
        `Circle the best dates, respect the caution dates, and remember the month's one-line brief: ${pick(rng, [
          `let ${st.strength} lead, and keep ${st.watchout} in the passenger seat.`,
          `fewer promises, fuller delivery.`,
          `build in private, announce when finished.`,
          `protect the mornings and the month protects you.`,
        ])}`,
        `Next month's sky shifts again — decisions made with this one's grain will still be standing when it does.`,
      ),
    ),
  });

  // Guarantee the premium length target (2,000–4,000 words) deterministically.
  const RESERVE: Array<[string, string[]]> = [
    ['career', [
      `A note on colleagues: under this configuration, the quiet contributor in your circle carries more useful information than the loud one — one coffee with the right person this month replaces five meetings.`,
      `If a role change is on your mind, use this month for positioning rather than leaping: update the document, have the exploratory conversation, and let the decision ripen toward the best dates.`,
    ]],
    ['money', [
      `On lending and borrowing between friends or family: Saturn's position makes informal arrangements sticky this month — if it must happen, write it down kindly.`,
      `Recurring income deserves one deliberate look: a small fee renegotiated or a rate corrected now compounds quietly for the rest of the year.`,
    ]],
    ['love', [
      `Family opinions and partnerships intersect this month; hear them fully, then decide from your own chart, not the room's weather.`,
      `Old connections may resurface${mercury.retrograde ? ' — classic retrograde behaviour' : ''}; nostalgia is information about what you value, not necessarily an instruction to go back.`,
    ]],
    ['health', [
      `Sleep is the multiplier on everything else this month: a fixed wake time, even on weekends, will do more for mood and focus than any supplement.`,
      `Watch the caffeine-to-water ratio on high-pressure days; the ${T[mars.sign].element}-sign Mars burns clean fuel best.`,
    ]],
    ['family', [
      `A household repair or upgrade postponed for months fits beautifully under Saturn's influence — fix the thing, and notice how much mental bandwidth it returns.`,
      `Children and younger relatives mirror your pace this month more than your words; the calm you model is the lesson that lands.`,
    ]],
    ['travel', [
      `Local exploration counts: one unfamiliar neighbourhood, market or trail this month refreshes the mind at a fraction of the cost of a flight.`,
      `If documents or renewals (passport, licence, permits) are within six months of expiry, process them now while Mercury's conditions are known.`,
    ]],
  ];
  // Second wave: sign-personalised depth paragraphs, appended only as needed.
  const DEPTH: Array<[string, string]> = [
    ['intro', `A word on how to use this reading. Astrology at its best is a weather report, not a script: the transits above describe prevailing winds for a ${sun} with a ${moon} Moon, and every recommendation that follows assumes you remain the pilot. Where the forecast says friction, budget extra time; where it says flow, raise your ambition a notch — the sky rewards those who adjust their sails deliberately.`],
    ['career', `Zooming out to the quarter: Saturn's slow passage through ${saturn.sign} is a multi-month chapter, not a weekly mood, and its lesson for your ${sun} Sun is cumulative — every deadline honoured this month is a brick in a reputation that pays compounding dividends when faster, flashier colleagues run out of momentum. Think of ${monthName} as one disciplined lap in a much longer race you are quietly winning.`],
    ['career', `If you manage others, the ${T[mars.sign].element}-sign Mars asks you to match assignments to energy: give the urgent, visible task to your sprinters and the structural work to your marathoners, and resist the urge to do both yourself — delegation is this month's hidden productivity transit.`],
    ['money', `For long-horizon wealth, remember that Jupiter's year in ${jupiter.sign} expands whatever it touches — including mistakes. The classical remedy is position sizing: let no single enthusiasm, however starry, hold more of your capital than you could lose with a shrug. Expansion plus discipline is the rare combination this sky actually rewards.`],
    ['money', `Household economics deserve one honest hour this month: the ${moon} Moon in your chart ties financial peace to emotional peace more tightly than you may admit, and a written budget — even an imperfect one — quiets both at once.`],
    ['love', `A deeper note for the ${moon} Moon: your emotional needs in close relationships run toward ${fmtList(mt.keywords)}, and months like this one test whether you ASK for those needs or merely hope they are guessed. The partner, friend or family member who hears the explicit version of you will meet it far more often than the one left to decode silences.`],
    ['love', `Venus retrogrades and returns, but the chart's constant is this: a ${sun} loves most sustainably when ${st.love.split(' and ')[0]} feeling is paired with everyday reliability — the good-morning message, the kept promise, the remembered small thing. This month, let consistency be the romance.`],
    ['health', `The mind-body link runs through your ${moon} Moon: unprocessed ${mt.keywords[0]} shows up physically before it shows up verbally, usually as ${mt.health.toLowerCase()}. Ten minutes of honest journaling on difficult evenings is cheap preventive medicine this month.`],
    ['health', `Energy management beats time management under this sky: identify your two strongest hours of the day and defend them for what matters; the ${T[mars.sign].element} Mars will happily spend them on trivia if you let it.`],
    ['family', `Where generations disagree this month, translate rather than judge: Saturn in ${saturn.sign} makes elders value ${T[saturn.sign].keywords[0]} while younger voices push for ${T[jupiter.sign].keywords[0]} — both are right about different time horizons, and naming that aloud usually ends the argument.`],
    ['travel', `For those weighing relocation or a long posting: Jupiter's sign speaks to WHERE growth concentrates this year, and ${jupiter.sign}'s flavour favours places and roles rich in ${fmtList(T[jupiter.sign].keywords.slice(0, 2))}. Visit before you commit; the chart advises informed leaps, not blind ones.`],
    ['summary', `Finally, hold the month lightly. Charts incline, they do not compel — and the same transit that tests one ${sun} into frustration matures another into ${st.keywords[2] ?? st.keywords[0]}. The difference is never the sky; it is the daily choices made under it. Choose like the second person, and ${monthName} will read, in hindsight, as the month things quietly turned.`],
  ];
  let total = sections.reduce((n, s) => n + wordCount(s.body), 0);
  for (const [key, extras] of RESERVE) {
    if (total >= 2150) break;
    const sec = sections.find((s) => s.key === key)!;
    for (const ex of extras) {
      if (total >= 2150) break;
      sec.body += '\n\n' + ex;
      total += wordCount(ex);
    }
  }
  for (const [key, ex] of DEPTH) {
    if (total >= 2150) break;
    const sec = sections.find((s) => s.key === key)!;
    sec.body += '\n\n' + ex;
    total += wordCount(ex);
  }

  return {
    month: monthName,
    title: `${monthName} — ${sun} ${asc ? `(with ${asc} Rising)` : ''}`.trim(),
    sections,
    words: sections.reduce((n, s) => n + wordCount(s.body), 0),
    bestDates: astro.bestDates,
    cautionDates: astro.cautionDates,
    framing: 'This monthly guidance blends your Vedic chart, transits, Dasha period and numerology — offered as reflection and timing, not fixed prediction.',
    ...(num ? { numerology: { lifePath: num.lifePath, personalYear: num.personalYear, personalMonth: num.personalMonth } } : {}),
    ...(dasha ? { dasha: { maha: dasha.maha, antar: dasha.antar } } : {}),
  };
}

// ───────────────────────── Ask the Astrologer (fallback answer) ─────────────────────────

const TOPIC_PLANETS: Record<string, string[]> = {
  career: ['Saturn', 'Sun', 'Mars'], marriage: ['Venus', 'Moon', 'Jupiter'], relationships: ['Venus', 'Moon', 'Mars'],
  business: ['Jupiter', 'Mercury', 'Saturn'], investments: ['Jupiter', 'Saturn', 'Mercury'], education: ['Mercury', 'Jupiter', 'Sun'],
  children: ['Jupiter', 'Moon', 'Venus'], 'foreign travel': ['Jupiter', 'Mercury', 'Sun'], property: ['Saturn', 'Moon', 'Venus'],
  health: ['Mars', 'Sun', 'Saturn'], 'spiritual growth': ['Jupiter', 'Saturn', 'Moon'],
};

export function composeAnswer(
  chart: NatalChart, userSeed: string, topic: string, question: string, now: Date, monthAstro: MonthAstro,
): string {
  const rng = mulberry32(hashSeed(userSeed + topic + question.slice(0, 64)));
  const key = Object.keys(TOPIC_PLANETS).find((k) => topic.toLowerCase().includes(k)) ?? 'career';
  const rulers = TOPIC_PLANETS[key];
  const transits = positionsAt(julianDay(now));
  const sun = chart.sun.sign, moonS = chart.moon.sign, asc = chart.ascendant?.sign ?? null;
  const st = T[sun];
  const paras: string[] = [];

  paras.push(
    `Thank you for trusting me with this question. Reading your chart — Sun in ${sun}${asc ? `, ${asc} rising` : ''}, Moon in ${moonS} — the matter of ${topic.toLowerCase()} sits primarily with ${fmtList(rulers)}, and your birth positions give a clear starting point: your ${sun} Sun brings ${st.keywords[0]} to how you pursue it, while the ${moonS} Moon means your inner needs here run toward ${fmtList(T[moonS].keywords.slice(0, 2))}. Any honest answer has to satisfy both layers, not just the visible one.`,
  );

  const readings = rulers.map((r) => {
    const t = transits.find((x) => x.planet === r)!;
    const natal = chart.planets.find((x) => x.planet === r);
    const asp = natal ? aspectBetween(t.lon, natal.lon) : null;
    const state = `${r} currently moves through ${t.sign}${t.retrograde ? ' (retrograde)' : ''}`;
    const tone = asp
      ? `and stands in ${asp.type} to its place in your birth chart — ${HARMONIOUS.includes(asp.type) ? 'a supportive signature that tends to open doors in this area with less resistance than usual' : asp.type === 'conjunction' ? 'a fresh-cycle signature: what you begin now in this area sets the pattern for a long stretch ahead' : 'a testing signature: progress is available, but it will ask for revision, patience and proof'}`
      : `— ${t.retrograde ? 'its retrograde motion advises reworking existing ground before breaking new' : 'its steady motion supports gradual, visible progress'}`;
    return `${state} ${tone}.`;
  });
  paras.push(`Here is what the sky is actually doing in your ${topic.toLowerCase()} houses right now. ${readings.join(' ')}`);

  paras.push(
    `Concretely, for the coming weeks: ${astro(monthAstro)}` +
    ` ${pick(rng, [
      `Move the significant step toward the favourable dates and keep the caution dates for preparation only.`,
      `Let paperwork, commitments and public moves cluster on the favourable dates; use the caution dates to refine rather than launch.`,
    ])}`,
  );
  function astro(m: MonthAstro): string {
    const best = m.bestDates.length ? `your supportive dates are ${fmtList(m.bestDates.map(ordinal))} of this month` : 'this month carries no standout supportive peak, so preparation matters more than timing';
    const caution = m.cautionDates.length ? `, while ${fmtList(m.cautionDates.map(ordinal))} deserve a slower hand` : '';
    return best + caution + '.';
  }

  paras.push(
    `There is also an inner dimension your question touches. Your ${moonS} Moon means that whatever the outward outcome, you will only FEEL settled about ${topic.toLowerCase()} when it also delivers ${fmtList(T[moonS].keywords.slice(0, 2))} — so as you weigh options, test each one against that private standard, not only against the visible metrics. ${pick(rng, [
      `Choices that look right on paper but starve the ${moonS} Moon tend to be re-decided within a year; choices that feed it tend to stick.`,
      `In my experience, a ${moonS}-Moon person who honours this need makes the outward decision almost effortlessly afterwards.`,
    ])}`,
  );

  paras.push(pick(rng, [
    `On the practical plane — and a good astrologer always ends here — the chart advises: ${st.strength} is your instrument in this matter; ${st.watchout} is the one way you could undermine it. `,
    `Practically speaking: your strongest asset in this matter is ${st.strength}, and the single risk worth naming is ${st.watchout}. `,
  ]) + pick(rng, [
    `Take one concrete step within seven days, however small — charts reward motion, and the sky above cannot act on a decision that has not been made.`,
    `Write the outcome you want in one sentence and act on its first step this week; timing multiplies effort, it never replaces it.`,
    `Revisit this question after the next New Moon: compare what changed, and you will see the transit's fingerprints yourself.`,
  ]));

  paras.push(
    `May the coming cycle treat you kindly. Your question and this reading are saved under My Questions, so you can return to it as events unfold — and if the situation changes shape, ask again with the new detail and I will read the updated sky against your chart.`,
  );

  return paras.join('\n\n');
}
