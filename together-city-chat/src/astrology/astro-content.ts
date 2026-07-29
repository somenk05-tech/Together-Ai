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
import { greetingFor } from './voice';

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

// composeDaily() and its DailyReading type lived here: a short 100-200 word
// horoscope superseded by composeGuidance below, kept only because a spec still
// referenced it. It was written entirely in the vocabulary this hub no longer
// uses — planets, signs and aspects named outright — so leaving it in place was
// a loaded gun: the next person to need "a short daily" would have wired it up
// and quietly reintroduced the voice everywhere else just lost. Deleted rather
// than translated, since nothing in production called it.

export interface GuidanceSection { key: string; title: string; icon: string; body: string }
export interface LuckyElements { number: number; color: string; time: string; direction: string }
export interface DailyGuidance {
  date: string;
  greeting: string;              // "Dear {First}," — every report opens as a letter
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
export function composeGuidance(
  chart: NatalChart, userSeed: string, date: Date, num: Numerology, dasha: Dasha, firstName?: string | null,
): DailyGuidance {
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

  // Every sentence below is DRIVEN by the computation above and NAMES none of
  // it. The trait vocabulary in T is already written as observations about a
  // person rather than about a sky, so it carries over directly; what goes is
  // the scaffolding that used to announce which planet supplied which adjective.
  const career = [
    mercury.retrograde
      ? `Today leans toward reviewing, finishing and double-checking rather than launching. If an important decision can wait a day, letting it may serve you better than reacting immediately.`
      : `This is a good window for saying the thing you have been putting off — a conversation or a message tends to land cleanly today. Say it plainly and calmly.`,
    `You may find your attention naturally drawn toward ${num.dayFocus}, so ${num.personalDay === 9 ? 'closing open loops before starting something new will feel especially satisfying' : num.personalDay === 1 ? 'a small, deliberate first step counts more than a grand plan' : 'steady, unhurried progress serves you better than pushing hard'}.`,
    `You are in a longer season of ${dasha.theme}, and effort of that kind tends to compound when it stays consistent rather than dramatic.`,
  ].join(' ');

  const relationships = `Care tends to reach people best from you when it is ${T[venus.sign].love} — a small, sincere gesture will likely land better than a grand one. The mood around you today tilts toward ${fmtList(T[moonT.sign].keywords.slice(0, 2))}, so if a conversation matters, listening carefully first may do more than reacting quickly.`;

  const health = `Your energy is running ${T[mars.sign].element === 'fire' ? 'hot' : T[mars.sign].element === 'earth' ? 'steady' : T[mars.sign].element === 'air' ? 'restless' : 'deep'} at the moment${mars.retrograde ? ', and it will reward pacing rather than pushing' : ''}. ${cap(sun.health)} — so honour the basics: water, one proper meal, and twenty unhurried minutes of movement or fresh air will do more than any quick fix.`;

  const finance = `Money tends to reward ${T[venus.sign].money} choices from you right now. You are in a year themed around ${num.yearTheme}, so a simple test helps before any spend or commitment: does this serve where you are actually heading? ${jupiter.retrograde ? 'Consolidating what you already have may serve you better than chasing something new.' : 'Patient, considered growth tends to outperform quick wins for you.'}`;

  const growth = `One strength that stands out in you is ${num.lifePathMeaning}; today asks for one honest, small step rather than a leap. It is a natural moment to ${waxing ? 'set an intention and begin' : 'let go of something you have outgrown'} — quiet, repeated effort is doing more than it appears to.`;

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

  // Says what this IS for without saying what produced it. The honesty the old
  // line was reaching for — this is reflection, not prophecy — matters and is
  // kept; the inventory of inputs that followed it does not belong in front of
  // the citizen.
  const framing = `Written for you, to help you think — not to tell you what will happen. You always hold the pen.`;

  const sections: GuidanceSection[] = [
    { key: 'career', title: 'Career & Work', icon: '💼', body: career },
    { key: 'relationships', title: 'Relationships', icon: '❤️', body: relationships },
    { key: 'health', title: 'Health & Energy', icon: '🌿', body: health },
    { key: 'finance', title: 'Finance', icon: '💰', body: finance },
    { key: 'growth', title: 'Personal Growth', icon: '🌱', body: growth },
  ];
  const text = sections.map((s) => s.body).join('\n\n');
  return {
    date: iso, greeting: greetingFor(firstName), framing, theme, moonPhase: phase, sunSign: chart.sun.sign,
    numerology: { lifePath: num.lifePath, personalYear: num.personalYear, personalMonth: num.personalMonth, personalDay: num.personalDay },
    dasha: { maha: dasha.maha, antar: dasha.antar },
    sections, lucky, reflection, text, words: wordCount(text),
  };
}

export interface MonthlySection { key: string; title: string; body: string }
export interface MonthlyReading {
  month: string; greeting: string; title: string; sections: MonthlySection[]; words: number;
  bestDates: number[]; cautionDates: number[];
  framing?: string;
  numerology?: { lifePath: number; personalYear: number; personalMonth: number };
  dasha?: { maha: string; antar: string };
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function composeMonthly(
  chart: NatalChart, userSeed: string, astro: MonthAstro, num?: Numerology, dasha?: Dasha, firstName?: string | null,
): MonthlyReading {
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
  // The lunation days still drive the Family section; only their description changes.
  const lunationDays = astro.events.filter((e) => e.kind === 'lunation').map((e) => e.day);

  const sections: MonthlySection[] = [];

  sections.push({
    key: 'intro', title: `Your ${monthName} at a Glance`, body: para(
      P(
        `${monthName} asks you for ${tough.length > harm.length ? 'patience before ambition' : 'deliberate, confident movement'}.`,
        `It is a month where growth tends to come through ${fmtList(T[jupiter.sign].keywords.slice(0, 2))}, and where the things you have committed to will quietly be tested for whether they hold.`,
        `Your instinct is ${st.keywords[0]}, and that combination rewards ${pick(rng, ['plans with structure behind them', 'commitments you can actually keep', 'a shorter list pursued harder', 'depth over breadth'])}.`,
      ),
      P(
        `Inwardly, you may notice the month running through ${fmtList(mt.keywords)} — that is how it will FEEL from the inside, whatever it looks like from outside.`,
        harm.length ? `You have real support available this month, and it concentrates around the strongest dates listed at the end — lean into those.` : `Nothing carries you this month, which is quietly good news: progress will be earned, and therefore keepable.`,
        tough.length ? `There is friction to respect too; the caution dates below mark when to keep the stakes low.` : `Little works against you this month — your main opponent is ${st.watchout}.`,
      ),
      P(
        pick(rng, [
          `Read the sections below as one connected story: what happens in your work this month is linked to how you manage energy, and both feed the quality of your closest relationships.`,
          `Treat this month as a single project with several fronts — work, money, love, health — that all draw from the same reserve of ${st.keywords[1] ?? st.keywords[0]}.`,
        ]),
        `Where specific dates are named, they are worked out for you personally rather than copied from anything generic.`,
      ),
    ),
  });

  if (num && dasha) {
    sections.push({
      key: 'cycle', title: 'Your Cycle & Timing', body: para(
        P(
          `You are in a longer season emphasising ${num.yearTheme}, and ${monthName} sits inside it as a chapter of its own.`,
          `This particular month leans toward ${num.personalMonth === 9 || num.personalMonth === 4 ? 'completing, consolidating and tidying loose ends' : num.personalMonth === 1 || num.personalMonth === 5 ? 'initiating, adapting and trying the new' : 'steady, relational progress rather than dramatic moves'}.`,
        ),
        P(
          `Underneath both, you are moving through a longer chapter themed around ${dasha.theme}. It helps to read the month through that: what supports that theme tends to flow, and what fights it tends to feel heavier than it should.`,
        ),
        P(`Hold all of this as guidance to think with — a sense of where your effort is likeliest to pay, never a fixed prediction. The choices stay yours.`),
      ),
    });
  }

  sections.push({
    key: 'career', title: 'Career & Business', body: para(
      P(
        `Professionally, this is a month that asks you to prove durability${saturn.retrograde ? ', and old obligations may resurface wanting proper completion' : ''}.`,
        `The most useful thing you can do: ${pick(rng, ['document what you deliver', 'make one process actually repeatable', 'close the loop on the oldest open promise on your list', 'strengthen the foundations before adding another floor'])}.`,
        `You should find drive available for ${T[mars.sign].work} efforts${mars.retrograde ? ', though revision and rework will outperform brand-new launches this month' : ''}.`,
      ),
      P(
        `Your natural working style is ${st.work}, and this month it meets ${tough.some((h) => h.planet === 'Saturn') ? 'testing conditions: expect at least one deadline, authority figure or structural limit to push back. The productive response is precision, not speed.' : 'reasonably open conditions: the people you need to persuade are more persuadable than usual, particularly around the strongest dates below.'}`,
        `If you run a business, ${pick(rng, ['review pricing before adding customers', 'tighten one recurring cost you have stopped noticing', 'formalise the handshake agreements — this is a month that favours things written down', 'invest in the boring infrastructure that removes your most common emergency'])}.`,
      ),
      P(
        `In meetings and negotiations, ${mercury.retrograde ? 'give yourself room: schedule signings and final commitments for later in the month, and treat mid-month misunderstandings as clerical rather than personal.' : `your reasoning should come across ${T[mercury.sign].element === 'air' ? 'sharp and persuasive' : 'concrete and credible'} — a strong month for interviews, pitches and difficult conversations handled early.`}`,
        `The single best working habit for this month: ${pick(rng, ['finish visibly — completed work compounds right now', 'under-promise by ten percent and over-deliver quietly', 'protect two deep-work blocks a week as if they were client meetings', 'ask directly for the responsibility you want; being explicit pays this month'])}.`,
      ),
    ),
  });

  sections.push({
    key: 'money', title: 'Money', body: para(
      P(
        `Financially, you may notice the pull this month running toward ${T[venus.sign].money} choices, alongside a temptation to expand — worthwhile when it lands on assets, risky when it lands on lifestyle.`,
        `Your baseline money style is ${st.money}, so this month specifically ${pick(rng, ['budget the enthusiasm: cap any single discretionary purchase', 'automate the saving you keep meaning to do', 'audit subscriptions and standing payments — a cancelled leak is free money', 'move one lump from idle to earning'])}.`,
      ),
      P(
        tough.some((h) => h.planet === 'Mars') ? `Impatience is the expensive emotion this month — the deal that "cannot wait" is precisely the one that should.` : `Little is pushing you toward rash spending this month, which makes it a genuinely good window for planned, researched purchases.`,
        `Your best financial windows fall on the dates listed below; keep large, irreversible commitments away from the caution dates.`,
        `A practical rule for ${monthName}: ${pick(rng, ['decide investments on paper a day before you execute them', 'let any windfall sit for seventy-two hours before it is assigned', 'review one insurance or protection gap', 'track every rupee for one week; the data will surprise you once, then pay you monthly'])}.`,
      ),
    ),
  });

  sections.push({
    key: 'love', title: 'Love & Relationships', body: para(
      P(
        `Affection this month takes on a ${T[venus.sign].love} flavour.`,
        `Your own style is ${st.love}, with an inner life that needs ${fmtList(mt.keywords.slice(0, 2))} — and this month that ${['fire', 'air'].includes(T[venus.sign].element) === ['fire', 'air'].includes(st.element) ? 'moves in step with what is around you, so expressing what you actually feel comes easier than usual' : 'runs slightly against what is around you, so translate: say the practical thing if your partner needs it, even when you feel the poetic one'}.`,
      ),
      P(
        `For couples: ${pick(rng, ['plan one unhurried evening with phones elsewhere — the rest takes care of itself', 'the recurring argument softens if raised BEFORE it flares; pick a calm hour', 'shared logistics (money, family, home) benefit from one honest working session this month', 'novelty is the medicine — one new place or ritual resets the dynamic'])}`,
        `For singles: ${harm.some((h) => h.planet === 'Venus' || h.planet === 'Jupiter') ? 'this is an above-average month to be visible — accept the invitation you would normally decline, especially near the strongest dates.' : 'connection this month favours depth over volume; one real conversation outperforms ten exchanges of pleasantries.'}`,
      ),
      P(
        `Watch for ${st.watchout} in close quarters — for you it is the most likely source of unnecessary hurt.`,
        `The relationship habit that pays all month: ${pick(rng, ['appreciate specifically — name the thing, not just the person', 'repair fast; resentment compounds like interest', 'ask one more question before offering the solution', 'protect your own recovery time so you bring a full self to the table'])}.`,
      ),
    ),
  });

  sections.push({
    key: 'health', title: 'Health', body: para(
      P(
        `Your energy this month runs ${T[mars.sign].element === 'fire' ? 'high and fast-burning — brilliant for training, hazardous for sleep if unspent' : T[mars.sign].element === 'earth' ? 'steady — ideal for building a routine that survives busy weeks' : T[mars.sign].element === 'air' ? 'in bursts — pair movement with something social or mental to sustain it' : 'deep but tidal — respect the low days instead of overriding them'}.`,
        `You tend to find that ${st.health}, and that ${mt.health}.`,
      ),
      P(
        tough.length ? `Because the month carries real friction, stress will look for a physical exit — give it a scheduled one: ${pick(rng, ['three honest workouts a week', 'a daily walk that is not negotiable', 'one screen-free hour before bed', 'breathwork or stretching on the caution dates especially'])}.` : `With little pressing on you, this is a consolidation month: the routine you establish now sticks unusually well.`,
        `Small clinical housekeeping — ${pick(rng, ['the postponed dental or eye check', 'a basic blood panel if it has been over a year', 'posture and workstation setup', 'hydration before caffeine each morning'])} — done this month prevents a nuisance later.`,
      ),
    ),
  });

  sections.push({
    key: 'family', title: 'Family', body: para(
      P(
        `${lunationDays.length ? `Two points in the month — around the ${fmtList(lunationDays.map(ordinal))} — tend to mark the emotional turning points at home.` : `This is an emotionally even month at home, without a single obvious turning point.`}`,
        `Early in a month like this, beginnings go well: conversations, moves, plans. Later, things already present tend to become visible — expect feelings that were there all along to surface, rather than new ones to appear.`,
      ),
      P(
        `Within your family you are the ${pick(rng, ['emotional barometer', 'quiet anchor', 'organising memory', 'first responder'])}; this month, ${pick(rng, ['let someone else hold the logistics for one weekend', 'say the appreciative thing out loud — assumed gratitude reads as absence', 'one call to the relative you keep postponing settles more than you expect', 'set one gentle boundary and keep it warmly'])}.`,
        `Elders and children both respond well to routine right now — shared meals at fixed times do invisible good.`,
      ),
    ),
  });

  sections.push({
    key: 'travel', title: 'Travel', body: para(
      P(
        `${mercury.retrograde ? 'Arrangements need more slack than usual this month — build margin into itineraries, screenshot every confirmation, and prefer refundable fares.' : 'Arrangements should move smoothly this month — bookings, visas and paperwork tend to go through cleanly, particularly early on.'}`,
        `Journeys with a purpose of ${['fire', 'air'].includes(T[jupiter.sign].element) ? 'discovery suit you better right now — new places over familiar ones' : 'consolidation suit you better right now — the family visit, the pilgrimage, the trip that completes something'}.`,
      ),
      P(
        `Your best travel windows align with the favourable dates below; if a journey must fall on a caution date, keep connections generous and documents duplicated.`,
        pick(rng, [
          `Short trips outperform grand tours this month — two days well-planned will restore more than ten days improvised.`,
          `If a foreign matter (visa, admission, posting) is pending, advance it in the first half of the month and follow up in writing.`,
          `Pack lighter than feels safe; the freed attention is worth more than the third pair of options.`,
        ]),
      ),
    ),
  });

  // The turning-point dates are still computed exactly as before; what changes
  // is that they are presented as days that matter FOR THIS PERSON rather than
  // as an itemised list of what the sky is doing.
  const shiftLines = astro.events.slice(0, 8).map((e) => {
    const focus = e.kind === 'ingress'
      ? `attention tends to move toward ${fmtList(T[(e.text.split(' enters ')[1] as SignName)]?.keywords?.slice(0, 2) ?? ['new priorities'])}`
      : e.kind === 'retrograde'
        ? `it is worth revisiting plans rather than pressing them forward`
        : `something already building tends to come into the open`;
    return `Around the ${ordinal(e.day)}, ${focus}.`;
  });
  sections.push({
    key: 'events', title: 'Turning Points This Month', body: para(
      `A few days in ${monthName} carry more weight than the rest for you:`,
      shiftLines.length ? shiftLines.join('\n\n') : 'This is an unusually even month — no single day stands out, so momentum carries uninterrupted.',
      `None of these are deadlines. Treat them as days worth a little extra margin, and notice what they bring up.`,
    ),
  });

  sections.push({
    key: 'best', title: 'Best Dates This Month', body: para(
      astro.bestDates.length
        ? P(
          `Your strongest dates this month are ${fmtList(astro.bestDates.map(ordinal))} — days when things are likeliest to move in your favour.`,
          `Use them for what matters most: ${pick(rng, ['the pitch, the proposal, the launch', 'first meetings and important asks', 'signing, submitting, publishing', 'the conversation that needs its best odds'])}.`,
        )
        : `No days stand out as especially favourable this month — treat it as evenly weighted and let preparation, not timing, create your advantage.`,
      `A strong date is a tailwind, not a guarantee: it improves the odds of the work you bring to it.`,
    ),
  });

  sections.push({
    key: 'caution', title: 'Dates to Be Cautious', body: para(
      astro.cautionDates.length
        ? P(
          `Handle ${fmtList(astro.cautionDates.map(ordinal))} with extra care — you may find your patience shorter and your judgement pressed around these days.`,
          `Nothing about them is dangerous; they are simply poor value for launches, confrontations and irreversible signatures. Schedule maintenance, routine work and rest there instead.`,
        )
        : `No days this month press on you particularly hard — an uncommonly clean slate. Ordinary prudence is enough.`,
      `If something unavoidable falls on a caution date, slow the tempo: confirm twice, leave earlier, and keep your ${st.watchout} on a short leash.`,
    ),
  });

  sections.push({
    key: 'summary', title: 'Monthly Summary', body: para(
      P(
        `${monthName} asks you to ${tough.length > harm.length ? 'trade speed for durability' : 'move while the moving is good'}.`,
        `Work rewards ${saturn.retrograde ? 'completion of old business' : 'structured ambition'}; money favours ${T[venus.sign].money} choices; love deepens through the ${T[venus.sign].love}; health follows whatever routine you actually keep.`,
      ),
      P(
        `Circle the strongest dates, respect the caution dates, and remember the month's one-line brief: ${pick(rng, [
          `let ${st.strength} lead, and keep ${st.watchout} in the passenger seat.`,
          `fewer promises, fuller delivery.`,
          `build in private, announce when finished.`,
          `protect the mornings and the month protects you.`,
        ])}`,
        `Conditions shift again next month — decisions made with this one's grain will still be standing when they do.`,
      ),
    ),
  });

  // Guarantee the premium length target (2,000–4,000 words) deterministically.
  const RESERVE: Array<[string, string[]]> = [
    ['career', [
      `A note on colleagues: the quiet contributor in your circle carries more useful information than the loud one — one coffee with the right person this month replaces five meetings.`,
      `If a role change is on your mind, use this month for positioning rather than leaping: update the document, have the exploratory conversation, and let the decision ripen toward your strongest dates.`,
    ]],
    ['money', [
      `On lending and borrowing between friends or family: informal arrangements turn sticky this month — if it must happen, write it down kindly.`,
      `Recurring income deserves one deliberate look: a small fee renegotiated or a rate corrected now compounds quietly for the rest of the year.`,
    ]],
    ['love', [
      `Family opinions and partnerships intersect this month; hear them fully, then decide from what you actually want, not from the mood of the room.`,
      `Old connections may resurface${mercury.retrograde ? ', which is typical of a month like this' : ''}; nostalgia is information about what you value, not necessarily an instruction to go back.`,
    ]],
    ['health', [
      `Sleep is the multiplier on everything else this month: a fixed wake time, even on weekends, will do more for mood and focus than any supplement.`,
      `Watch the caffeine-to-water ratio on high-pressure days; your energy burns cleanest on simple fuel.`,
    ]],
    ['family', [
      `A household repair or upgrade postponed for months fits this month beautifully — fix the thing, and notice how much mental bandwidth it returns.`,
      `Children and younger relatives mirror your pace this month more than your words; the calm you model is the lesson that lands.`,
    ]],
    ['travel', [
      `Local exploration counts: one unfamiliar neighbourhood, market or trail this month refreshes the mind at a fraction of the cost of a flight.`,
      `If documents or renewals (passport, licence, permits) are within six months of expiry, process them now while the conditions are known.`,
    ]],
  ];
  // Second wave: personalised depth paragraphs, appended only as needed. Driven
  // by the same computed values as everything above, phrased about the person.
  const DEPTH: Array<[string, string]> = [
    ['intro', `A word on how to use this. None of it is a script — it describes the prevailing conditions and the tendencies you bring to them, and every suggestion assumes you remain the one steering. Where it points to friction, budget extra time; where it points to flow, raise your ambition a notch. The difference is made by adjusting deliberately rather than drifting.`],
    ['career', `Zooming out past this month: what you are being asked to prove right now is cumulative, not weekly. Every deadline honoured this month is a brick in a reputation that pays compounding dividends later, when faster and flashier people around you run out of momentum. Think of ${monthName} as one disciplined lap in a much longer race you are quietly winning.`],
    ['career', `If you manage others, match assignments to energy this month: give the urgent, visible task to your sprinters and the structural work to your marathoners, and resist the urge to do both yourself. Delegation is this month's hidden productivity gain.`],
    ['money', `For long-horizon wealth, remember that a season of expansion expands whatever it touches — including mistakes. The remedy is position sizing: let no single enthusiasm, however exciting, hold more of your capital than you could lose with a shrug. Expansion paired with discipline is the rare combination that actually pays.`],
    ['money', `Household economics deserve one honest hour this month. You tend to tie financial peace to emotional peace more tightly than you may admit, and a written budget — even an imperfect one — quiets both at once.`],
    ['love', `A deeper note on your emotional needs in close relationships: they run toward ${fmtList(mt.keywords)}, and months like this one test whether you ASK for them or merely hope they are guessed. The partner, friend or family member who hears the explicit version of you will meet you far more often than the one left to decode silences.`],
    ['love', `One constant worth holding on to: you love most sustainably when ${st.love.split(' and ')[0]} feeling is paired with everyday reliability — the good-morning message, the kept promise, the remembered small thing. This month, let consistency be the romance.`],
    ['health', `The mind-body link is real for you: unprocessed ${mt.keywords[0]} tends to show up physically before it shows up in words, usually as ${mt.health.toLowerCase()}. Ten minutes of honest journaling on difficult evenings is cheap preventive medicine this month.`],
    ['health', `Energy management beats time management right now: identify your two strongest hours of the day and defend them for what matters. Left unguarded, they get spent on trivia.`],
    ['family', `Where generations disagree this month, translate rather than judge. Elders in your circle are likely valuing ${T[saturn.sign].keywords[0]} while younger voices push for ${T[jupiter.sign].keywords[0]} — both are right about different time horizons, and naming that aloud usually ends the argument.`],
    ['travel', `If you are weighing relocation or a long posting, growth this year concentrates in places and roles rich in ${fmtList(T[jupiter.sign].keywords.slice(0, 2))}. Visit before you commit — an informed leap, never a blind one.`],
    ['intro', `One more thing worth naming before the detail. ${cap(st.strength)} is the quality you can rely on this month, and it is genuinely uncommon — you may underrate it precisely because it costs you so little effort. The counterweight is ${st.watchout}, which tends to appear when you are tired rather than when you are challenged. Watching your own energy is therefore the most efficient way to manage your own weaknesses this month.`],
    ['career', `If work feels slower than your ambition this month, that gap is worth reading carefully rather than fighting. You are ${st.work} by nature, and the conditions right now reward exactly that when it is applied narrowly and resisted when it is spread thin. The practical translation: pick the two things that would matter in a year, and let the rest be done adequately rather than beautifully.`],
    ['love', `Where a relationship has been quietly stuck, the useful question this month is not who is right but what each of you is protecting. You may find that what looks like a disagreement about a decision is really a difference in what makes each of you feel safe. Naming that out loud tends to dissolve arguments that logic could not.`],
    ['family', `If you carry more of the household's invisible work than you have admitted, this is a good month to say so plainly and without accusation. You tend to absorb rather than ask, and the people around you are far likelier to be unaware than unwilling. One specific request usually works better than a general appeal.`],
    ['summary', `Finally, hold all of this lightly. Conditions incline, they do not compel — the same month that tests one person into frustration matures another into ${st.keywords[2] ?? st.keywords[0]}. The difference is never the circumstances; it is the daily choices made inside them. Choose like the second person, and ${monthName} will read, in hindsight, as the month things quietly turned.`],
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
    greeting: greetingFor(firstName),
    // The title is the month, not a classification of the reader. The chart
    // itself is still shown — as its own labelled panel, where it reads as data
    // rather than as the voice of the letter.
    title: `Your ${monthName}`,
    sections,
    words: sections.reduce((n, s) => n + wordCount(s.body), 0),
    bestDates: astro.bestDates,
    cautionDates: astro.cautionDates,
    framing: 'Written for you, as reflection and a sense of timing — never a fixed prediction. The choices stay yours.',
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
  firstName?: string | null,
): string {
  const rng = mulberry32(hashSeed(userSeed + topic + question.slice(0, 64)));
  const key = Object.keys(TOPIC_PLANETS).find((k) => topic.toLowerCase().includes(k)) ?? 'career';
  const rulers = TOPIC_PLANETS[key];
  const transits = positionsAt(julianDay(now));
  const sun = chart.sun.sign, moonS = chart.moon.sign;
  const st = T[sun], mt = T[moonS];
  const subject = topic.toLowerCase();
  const name = (firstName ?? '').trim();
  const paras: string[] = [];

  // What this means for them. The chart still selects every adjective; it is
  // simply never named, and the reply never becomes about the one writing it.
  paras.push(
    `${name ? `${name}, this` : 'This'} is a question you are asking from two places at once, and it is worth separating them. ` +
    `Outwardly, you bring ${st.keywords[0]} to how you pursue ${subject} — that is your real advantage here. ` +
    `Inwardly, what you need from it runs toward ${fmtList(mt.keywords.slice(0, 2))}, and that need is quieter but far less negotiable. ` +
    `Any answer that satisfies only the first layer tends to get re-decided within a year.`,
  );

  // Why it is relevant right now. Same computation as before — the aspect
  // between each ruling factor and its natal place — described as conditions
  // the person is moving through rather than as planetary geometry.
  const conditions = rulers.map((r) => {
    const t = transits.find((x) => x.planet === r)!;
    const natal = chart.planets.find((x) => x.planet === r);
    const asp = natal ? aspectBetween(t.lon, natal.lon) : null;
    if (!asp) {
      return t.retrograde
        ? `there is a pull toward reworking ground you have already covered before breaking new`
        : `conditions favour gradual, visible progress rather than a single decisive move`;
    }
    if (HARMONIOUS.includes(asp.type)) return `this area is opening with less resistance than usual — doors that were stuck tend to give now`;
    if (asp.type === 'conjunction') return `you are at the start of a cycle here: what you begin now sets a pattern that runs for a long stretch`;
    return `this area is being tested rather than blocked — progress is available, but it will ask for revision, patience and proof`;
  });
  paras.push(
    `As for why it feels live right now: ${fmtList([...new Set(conditions)])}. ` +
    `You may notice that reflected in how much effort the same action costs you this month compared to a few months ago.`,
  );

  const dateLine = (m: MonthAstro): string => {
    const best = m.bestDates.length
      ? `your strongest days this month are ${fmtList(m.bestDates.map(ordinal))}`
      : `no days this month stand out as especially favourable, so preparation will matter more than timing`;
    const caution = m.cautionDates.length ? `, while ${fmtList(m.cautionDates.map(ordinal))} deserve a slower hand` : '';
    return best + caution + '.';
  };

  // What they can practically do with it.
  paras.push(
    `Concretely, for the coming weeks: ${dateLine(monthAstro)}` +
    ` ${pick(rng, [
      `Move the significant step toward the stronger days and keep the slower ones for preparation only.`,
      `Let paperwork, commitments and public moves cluster on the stronger days; use the slower ones to refine rather than launch.`,
    ])}`,
  );

  paras.push(
    `There is an inner test worth applying as you weigh the options. Whatever the outward result, you are unlikely to feel settled about ${subject} unless it also delivers ${fmtList(mt.keywords.slice(0, 2))}. ` +
    `So hold each option against that private standard as well as the visible metrics. ` +
    `${pick(rng, [
      `Options that look right on paper but starve that need tend to come back around; the ones that feed it tend to stick.`,
      `People who honour that need first usually find the outward decision makes itself afterwards.`,
    ])}`,
  );

  paras.push(
    `${pick(rng, [
      `Your strongest asset in this matter is ${st.strength}, and the single risk worth naming is ${st.watchout}. `,
      `One strength that stands out here: ${st.strength}. The one way you could undermine it is ${st.watchout}. `,
    ])}` +
    `${pick(rng, [
      `Take one concrete step within seven days, however small — a decision that has not been made cannot be helped along by good timing.`,
      `Write the outcome you want in one sentence and act on its first step this week; timing multiplies effort, it never replaces it.`,
      `Revisit this question in a month and compare what actually changed — you will learn more from that than from any single answer.`,
    ])}`,
  );

  paras.push(
    `This is saved under My Questions, so you can come back to it as things unfold. If the situation changes shape, ask again with the new detail and the answer will change with it.`,
  );

  return paras.join('\n\n');
}
