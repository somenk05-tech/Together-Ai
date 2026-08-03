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
  julianDay, positionsAt, HARMONIOUS, AspectType,
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
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const ordinal = (n: number) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]); };

// ───────────────────────── Daily horoscope ─────────────────────────

// Two composers have stood here and both are gone. composeDaily() wrote a short
// horoscope with the planets named outright; composeGuidance() replaced it with
// five labelled sections in ordinary language. Neither was translated into what
// follows, because both were shapes rather than content — and a spare composer
// left lying around is a loaded gun: the next person needing "just a short
// daily" wires it up and quietly reintroduces the voice everyone else lost.

/**
 * A brief, not a page.
 *
 * This used to be where the daily and monthly readings were *written* — five
 * labelled sections, lucky elements, a reflection box, then eight more sections
 * for the month. All of it rendered as panels, and the composer's job was to
 * fill them.
 *
 * The surface is a letter now, so the composer's job changed shape. What it
 * produces is a BRIEF: the observations the letter has to contain, each one a
 * plain sentence about a person, none of them prose anybody will ever read. The
 * letter is written from the brief by letter.ts's rules, and the brief never
 * leaves the server.
 *
 * The computation underneath is untouched — the same sidereal chart, the same
 * transits, the same numerology and running period, the same seeded selection
 * per (user + period) so a brief is stable for the day. What went is the layer
 * that turned all that into headings.
 */
export interface GuidanceBrief {
  /** The observations the letter must reflect. Plain English, in their own right. */
  observations: string[];
  /** A steer for the writer. Not an observation about the person. */
  note: string;
}

/**
 * Observations for one person's day.
 *
 * Ordered the way a letter tends to want them — the shape of the day first,
 * then work, people, body, money, and the long view — but the order is a
 * suggestion to the writer, not a structure. Nothing here may name what
 * produced it: every string below is already a sentence about a person, which
 * is what lets the whole list be handed to a writer that must never learn the
 * vocabulary.
 */
export function composeDailyBrief(
  chart: NatalChart, userSeed: string, date: Date, num: Numerology, dasha: Dasha,
): GuidanceBrief {
  const iso = date.toISOString().slice(0, 10);
  const rng = mulberry32(hashSeed(userSeed + iso + 'brief1'));
  const jd = julianDay(new Date(date.getTime()));
  const transits = positionsAt(jd);
  const hits = hitsAgainstNatal(transits, chart);
  const find = (p: string) => transits.find((t) => t.planet === p)!;
  const moonT = find('Moon'), mercury = find('Mercury'), venus = find('Venus'), mars = find('Mars'), jupiter = find('Jupiter');
  const waxing = /(New|Waxing)/.test(moonPhaseName(jd));
  const sun = T[chart.sun.sign];
  const lead = hits[0];

  const observations = [
    lead
      ? (lead.harmonious
        ? 'Today is likely to work with them rather than against them — things that have been stuck are more inclined to give.'
        : 'Today rewards a steady hand more than a fast one; pushing hard is likely to cost more than it returns.')
      : 'Today has no particular weather to it, which means the tone of it is largely theirs to set.',
    mercury.retrograde
      ? 'This is a better day for reviewing, finishing and double-checking than for launching. An important decision that can wait a day probably should.'
      : 'Something they have been holding back would land cleanly today if said plainly and without heat.',
    `Their attention is naturally pulled toward ${num.dayFocus} at the moment.`,
    num.personalDay === 9
      ? 'Closing open loops will feel better than starting anything new.'
      : num.personalDay === 1
        ? 'A small deliberate first step counts for more today than a complete plan.'
        : 'Unhurried, consistent progress will serve them better than effort applied in a burst.',
    `They are in a long season themed around ${dasha.theme}, and that kind of effort compounds when it stays consistent rather than dramatic.`,
    `Care reaches people best from them when it is ${T[venus.sign].love} — a small sincere gesture will land better than a large one.`,
    `The mood around them today leans toward ${fmtList(T[moonT.sign].keywords.slice(0, 2))}, so in any conversation that matters, listening first will do more than responding quickly.`,
    `Their energy is running ${T[mars.sign].element === 'fire' ? 'hot' : T[mars.sign].element === 'earth' ? 'steady' : T[mars.sign].element === 'air' ? 'restless' : 'deep'} today${mars.retrograde ? ', and will reward pacing over pushing' : ''}. ${cap(sun.health)}.`,
    `Money rewards ${T[venus.sign].money} choices from them right now, inside a longer stretch themed around ${num.yearTheme}. ${jupiter.retrograde ? 'Consolidating what they already have beats chasing something new.' : 'Patient growth outperforms a quick win for them.'}`,
    `A strength that genuinely stands out in them is ${num.lifePathMeaning}. Today asks for one honest small step rather than a leap, and it is a natural moment to ${waxing ? 'begin something' : 'let go of something they have outgrown'}.`,
    `What they can rely on is ${sun.strength}. What tends to trip them is ${sun.watchout}, and it usually shows up when they are tired rather than when they are challenged.`,
    pick(rng, [
      'Worth leaving them with a question to sit with tonight: what deserves a little more of their attention this week, and what deserves a little less.',
      'Worth leaving them with something small to notice tonight: one thing today they are quietly pleased about, and one worry that can wait until morning.',
      'Worth leaving them with the thought that not everything has to be solved at once, and that moving with a clear head beats moving quickly.',
    ]),
  ];

  return {
    observations,
    note: 'This is a single ordinary day. Keep the scale of it right — no turning points, no destinies, ' +
      'nothing that would sound strange said aloud by someone who had watched them make coffee.',
  };
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * Observations for one person's month.
 *
 * The month has more to say than a day and the letter is correspondingly
 * longer, but it is the same object: one continuous piece of writing, not
 * twelve readings stacked up. The dates below are the only numbers that reach
 * the citizen, and they reach it as days of the month — which is what they are.
 */
export function composeMonthlyBrief(
  chart: NatalChart, userSeed: string, astro: MonthAstro, num?: Numerology, dasha?: Dasha,
): GuidanceBrief & { month: string } {
  const monthName = `${MONTHS[astro.month - 1]} ${astro.year}`;
  const rng = mulberry32(hashSeed(userSeed + `${astro.year}-${astro.month}` + 'brief1'));
  const st = T[chart.sun.sign], mt = T[chart.moon.sign];
  const tr = (p: string) => astro.transits.find((t) => t.planet === p)!;
  const hits = hitsAgainstNatal(astro.transits, chart, 5);
  const harm = hits.filter((h) => h.harmonious);
  const tough = hits.filter((h) => !h.harmonious);
  const jupiter = tr('Jupiter'), saturn = tr('Saturn'), venus = tr('Venus'), mars = tr('Mars'), mercury = tr('Mercury');
  const turningDays = astro.events.filter((e) => e.kind === 'lunation').map((e) => e.day);

  const observations: string[] = [
    `The month ahead asks them for ${tough.length > harm.length ? 'patience before ambition' : 'deliberate, confident movement'}.`,
    ...(num ? [
      `They are inside a longer stretch themed around ${num.yearTheme}, and this month sits in it as a chapter of its own — leaning toward ${num.personalMonth === 9 || num.personalMonth === 4 ? 'completing, consolidating and tidying loose ends' : num.personalMonth === 1 || num.personalMonth === 5 ? 'starting, adapting and trying the unfamiliar' : 'steady, relational progress rather than dramatic moves'}.`,
    ] : []),
    ...(dasha ? [
      `Underneath all of it runs a much longer chapter themed around ${dasha.theme}. It is worth reading the month through that: what supports it tends to flow, and what fights it feels heavier than it should.`,
    ] : []),
    `Growth this month tends to arrive through ${fmtList(T[jupiter.sign].keywords.slice(0, 2))}, and the things they have already committed to will quietly be tested for whether they hold.`,
    `From the inside the month is likely to feel like ${fmtList(mt.keywords)}, whatever it looks like from outside.`,
    harm.length
      ? 'There is real support available to them this month, and it concentrates on a few specific days rather than spreading evenly.'
      : 'Nothing carries them this month, which is quietly good news: whatever progress happens will have been earned, and will therefore keep.',
    tough.length
      ? 'There is friction to respect too, and it also concentrates on particular days rather than sitting over the whole month.'
      : `Little works against them this month; their main opponent is ${st.watchout}.`,
    `Their working style is ${st.work}, and this month it meets ${tough.some((h) => h.planet === 'Saturn') ? 'testing conditions — expect at least one deadline, senior person or hard limit to push back, and answer it with precision rather than speed' : 'reasonably open conditions — the people they need to persuade are more persuadable than usual'}.`,
    `Professionally, the month rewards proving durability${saturn.retrograde ? ', and an old obligation may resurface wanting proper completion' : ''}. The most useful thing they can do is ${pick(rng, ['document what they actually deliver', 'make one process genuinely repeatable', 'close the loop on the oldest open promise on their list', 'strengthen the foundations before adding another floor'])}.`,
    mercury.retrograde
      ? 'Arrangements, signings and final commitments need more slack than usual this month; a mid-month misunderstanding is far likelier to be clerical than personal.'
      : `In meetings and difficult conversations their reasoning should come across ${T[mercury.sign].element === 'air' ? 'sharp and persuasive' : 'concrete and credible'}, which makes this a strong month for handling those early rather than late.`,
    `Money leans toward ${T[venus.sign].money} choices for them, alongside a temptation to expand — worth it on assets, risky on lifestyle. Their baseline money style is ${st.money}.`,
    tough.some((h) => h.planet === 'Mars')
      ? 'Impatience is the expensive emotion this month: the deal that supposedly cannot wait is precisely the one that should.'
      : 'Little is pushing them toward rash spending, which makes this a genuinely good window for planned, researched purchases.',
    `Affection this month takes on a ${T[venus.sign].love} flavour. Their own way of loving is ${st.love}, and what they need underneath it runs toward ${fmtList(mt.keywords.slice(0, 2))} — the difference between asking for that and hoping it is guessed decides how the month goes at home.`,
    `In close quarters, watch for ${st.watchout}; for them it is the likeliest source of unnecessary hurt.`,
    `Their energy this month runs ${T[mars.sign].element === 'fire' ? 'high and fast-burning — good for training, hazardous for sleep if it goes unspent' : T[mars.sign].element === 'earth' ? 'steady, which makes it a good month to build a routine that survives busy weeks' : T[mars.sign].element === 'air' ? 'in bursts, so movement paired with something social or mental will sustain better' : 'deep but tidal, so the low days are worth respecting rather than overriding'}. They tend to find that ${st.health.replace(/^./, (c) => c.toLowerCase())}.`,
    tough.length
      ? `Because the month carries real friction, stress will look for a physical exit — better to give it a scheduled one: ${pick(rng, ['three honest workouts a week', 'a daily walk that is not up for negotiation', 'one screen-free hour before bed'])}.`
      : 'With little pressing on them, this is a consolidation month: a routine established now sticks unusually well.',
    turningDays.length
      ? `Two points in the month — around the ${fmtList(turningDays.map(ordinal))} — tend to mark the emotional turning points at home, when something already present becomes visible rather than something new appearing.`
      : 'This is an emotionally even month at home, with no single obvious turning point.',
    astro.bestDates.length
      ? `Their strongest days this month are the ${fmtList(astro.bestDates.map(ordinal))} — worth using for the pitch, the ask, the signature, the conversation that needs its best odds. A strong day is a tailwind, not a guarantee.`
      : 'No days stand out as especially favourable this month, so preparation rather than timing is where their advantage comes from.',
    astro.cautionDates.length
      ? `The ${fmtList(astro.cautionDates.map(ordinal))} deserve a slower hand — not dangerous, simply poor value for launches, confrontations and irreversible signatures. Maintenance and rest belong there instead.`
      : 'No days this month press on them particularly hard; ordinary prudence is enough.',
    `${cap(st.strength)} is the quality they can rely on this month, and they may underrate it precisely because it costs them so little effort.`,
    `The one-line brief for the month: ${pick(rng, [
      `let ${st.strength} lead, and keep ${st.watchout} in the passenger seat`,
      'fewer promises, fuller delivery',
      'build in private, announce when finished',
      'protect the mornings and the month protects them',
    ])}.`,
    'Conditions shift again next month, and decisions made with this one\'s grain will still be standing when they do.',
  ];

  return {
    month: monthName,
    observations,
    note: `This is a letter about ${monthName} as a whole. Where specific days are named, name them as days ` +
      'of the month in ordinary prose — never as a list, never as a table, never as anything a reader ' +
      'could mistake for a schedule. It should read as one person thinking about the weeks ahead for ' +
      'someone they know well, not as a month broken into topics.',
  };
}

// ───────────────────────── Ask the Astrologer (fallback answer) ─────────────────────────

const TOPIC_PLANETS: Record<string, string[]> = {
  career: ['Saturn', 'Sun', 'Mars'], marriage: ['Venus', 'Moon', 'Jupiter'], relationships: ['Venus', 'Moon', 'Mars'],
  business: ['Jupiter', 'Mercury', 'Saturn'], investments: ['Jupiter', 'Saturn', 'Mercury'], education: ['Mercury', 'Jupiter', 'Sun'],
  children: ['Jupiter', 'Moon', 'Venus'], 'foreign travel': ['Jupiter', 'Mercury', 'Sun'], property: ['Saturn', 'Moon', 'Venus'],
  health: ['Mars', 'Sun', 'Saturn'], 'spiritual growth': ['Jupiter', 'Saturn', 'Moon'],
};

/**
 * Observations for one person's question. NOT an answer.
 *
 * composeAnswer() used to build the reply itself — five paragraphs, always in
 * the same order — and the model was told to keep its content and rewrite only
 * its voice. It did, and two unrelated questions came back with the same
 * opening sentence and the same shape. The template was the deliverable; the
 * model was the paint.
 *
 * So this returns notes. The same computation chooses every adjective, and
 * nothing here decides what the answer looks like — consultation.ts does that,
 * differently each time.
 */
export function composeAnswerBrief(
  chart: NatalChart, userSeed: string, topic: string, question: string, now: Date, monthAstro: MonthAstro,
): GuidanceBrief {
  const rng = mulberry32(hashSeed(userSeed + topic + question.slice(0, 64)));
  const key = Object.keys(TOPIC_PLANETS).find((k) => topic.toLowerCase().includes(k)) ?? 'career';
  const rulers = TOPIC_PLANETS[key];
  const transits = positionsAt(julianDay(now));
  const st = T[chart.sun.sign], mt = T[chart.moon.sign];
  const subject = topic.toLowerCase();

  // The same aspects the old composer read, described as conditions somebody is
  // moving through rather than as geometry.
  const conditions = rulers.map((r) => {
    const t = transits.find((x) => x.planet === r)!;
    const natal = chart.planets.find((x) => x.planet === r);
    const asp = natal ? aspectBetween(t.lon, natal.lon) : null;
    if (!asp) {
      return t.retrograde
        ? 'there is a pull toward reworking ground already covered before breaking new'
        : 'conditions favour gradual, visible progress rather than one decisive move';
    }
    if (HARMONIOUS.includes(asp.type)) return 'this area is opening with less resistance than usual — doors that were stuck tend to give now';
    if (asp.type === 'conjunction') return 'they are at the start of a cycle here: what begins now sets a pattern that runs a long stretch';
    return 'this area is being tested rather than blocked — progress is available, but it asks for revision, patience and proof';
  });

  const dates = monthAstro.bestDates.length
    ? `Their strongest days this month are the ${fmtList(monthAstro.bestDates.map(ordinal))}`
      + (monthAstro.cautionDates.length ? `, and the ${fmtList(monthAstro.cautionDates.map(ordinal))} deserve a slower hand.` : '.')
    : 'No days this month stand out as especially favourable, so preparation will matter more than timing.';

  return {
    observations: [
      `They bring ${st.keywords[0]} to how they pursue ${subject}, and that is their real advantage here.`,
      `What they need from ${subject} underneath that runs toward ${fmtList(mt.keywords.slice(0, 2))} — quieter, and far less negotiable.`,
      `An answer that satisfies only the outward layer tends to get re-decided within a year.`,
      ...[...new Set(conditions)].map((c) => `On this subject right now, ${c}.`),
      `They may notice it in how much effort the same action costs compared with a few months ago.`,
      dates,
      `Their strongest asset in this matter is ${st.strength}.`,
      `The one way they could undermine it is ${st.watchout}.`,
      pick(rng, [
        'A concrete step within seven days is worth more than a better decision made later — timing multiplies effort, it never replaces it.',
        'Writing the wanted outcome in one sentence, and acting on its first step this week, is what turns this from a question into a decision.',
        'Coming back to this in a month and comparing what actually changed will teach them more than any single answer.',
      ]),
      'The answer is saved under My Questions, so they can return to it as things unfold.',
    ],
    note: `The subject is ${subject}. Write about ${subject} the way somebody who knows that part of `
      + 'life writes about it — not about life in general with the word swapped in.',
  };
}
