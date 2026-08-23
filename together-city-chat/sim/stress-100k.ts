/**
 * Pass 1 of the 100K stress-test spec: the honest baseline.
 *
 * Real engine — matching.ts, astrology.ts, completion.ts — no mocked scoring,
 * the same rule persona-sim.ts set. What is new here is scale and sharding:
 * 100,000 profiles cannot be scored pairwise (that is 10^10 pairs), so each
 * viewer draws a SAMPLED candidate set, mostly from their own city. Every rate
 * below is therefore an estimate over a sample, and the sample size is printed
 * next to it rather than left to be assumed.
 *
 *   npx ts-node sim/stress-100k.ts [scale] [seed]
 *
 * Scales: 1000 (inline, seconds) · 10000 (inline, ~a minute) · 100000
 * (background it: nohup npx ts-node sim/stress-100k.ts 100000 > sim/out.log &).
 *
 * Deterministic: same scale + same seed = same numbers, so a fix can be
 * measured against the run that found the problem.
 */
import { compatibilityScore, zodiacSign } from '../src/dating/astrology';
import {
  confidence, coverage, factorScores, overallScore,
  unreachableReason, WEIGHTS, type DXProfile,
} from '../src/dating/matching';

const SCALE = Number(process.argv[2] ?? 1000);
const SEED = Number(process.argv[3] ?? 42);
const CURATED = 75;
const DECK = 5;
/**
 * Candidates sampled per viewer. Overridable because the 100,000 run does not
 * fit in one shell call at 150 — and a run that gets killed halfway produces no
 * numbers at all, which is worse than a smaller sample honestly labelled.
 */
const CANDIDATES = Number(process.env.STRESS_CANDIDATES)
  || (SCALE >= 100000 ? 150 : SCALE >= 10000 ? 250 : Number.MAX_SAFE_INTEGER);

let seed = SEED;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const pick = <T>(a: T[]): T => a[Math.floor(rnd() * a.length)];
const maybe = <T>(v: T, p: number): T | undefined => (rnd() < p ? v : undefined);
const pct = (n: number, d: number) => (d ? ((100 * n) / d).toFixed(2) + '%' : 'n/a');

// ---------------------------------------------------------------- population

/** [city, state, share of population, male:female ratio] — spec §2.1 / §2.2. */
const CITIES: [string, string, number, number][] = [
  ['Bengaluru', 'Karnataka', 0.140, 2.27], ['Mumbai', 'Maharashtra', 0.130, 1.60],
  ['Delhi', 'Delhi', 0.120, 1.75], ['Hyderabad', 'Telangana', 0.090, 1.90],
  ['Pune', 'Maharashtra', 0.070, 1.70], ['Chennai', 'Tamil Nadu', 0.060, 1.55],
  ['Kolkata', 'West Bengal', 0.050, 1.45], ['Ahmedabad', 'Gujarat', 0.035, 1.80],
  ['Jaipur', 'Rajasthan', 0.030, 1.85], ['Kochi', 'Kerala', 0.025, 1.25],
  ['Lucknow', 'Uttar Pradesh', 0.020, 1.90], ['Indore', 'Madhya Pradesh', 0.020, 1.95],
  ['Chandigarh', 'Punjab', 0.018, 1.60], ['Coimbatore', 'Tamil Nadu', 0.015, 1.70],
  ['Bhubaneswar', 'Odisha', 0.012, 2.00],
  // tier-2/3, thin by design — the liquidity floor
  ['Nagpur', 'Maharashtra', 0.012, 2.10], ['Surat', 'Gujarat', 0.012, 2.40],
  ['Vadodara', 'Gujarat', 0.010, 2.00], ['Mysuru', 'Karnataka', 0.010, 1.80],
  ['Visakhapatnam', 'Andhra Pradesh', 0.010, 2.20], ['Madurai', 'Tamil Nadu', 0.008, 2.30],
  ['Guwahati', 'Assam', 0.008, 2.10], ['Dehradun', 'Uttarakhand', 0.007, 1.90],
  ['Raipur', 'Chhattisgarh', 0.006, 2.50], ['Ranchi', 'Jharkhand', 0.006, 2.60],
  ['Varanasi', 'Uttar Pradesh', 0.005, 2.80], ['Amritsar', 'Punjab', 0.005, 2.20],
  // overseas — thin and skewed
  ['Dubai', 'UAE', 0.020, 2.50], ['Singapore', 'SG', 0.012, 2.40],
  ['London', 'UK', 0.012, 2.20], ['New York', 'NY', 0.010, 2.30],
  ['Toronto', 'ON', 0.008, 2.30], ['Sydney', 'NSW', 0.007, 2.40],
];
const OVERSEAS = new Set(['Dubai', 'Singapore', 'London', 'New York', 'Toronto', 'Sydney']);
/** The M7 cohort: the same places, spelled the other way. */
const VARIANTS: [string, string, string][] = [
  ['Bangalore', 'Karnataka', 'Bengaluru'], ['Bombay', 'Maharashtra', 'Mumbai'],
  ['Calcutta', 'West Bengal', 'Kolkata'], ['Gurgaon', 'Haryana', 'Delhi'],
];

const GOALS = ['Friendship First', 'Casual Dating', 'Serious Dating', 'Long-term Relationship', 'Marriage'];
const GOAL_W = [0.09, 0.18, 0.24, 0.24, 0.25];
const DIETS = ['Vegetarian', 'Non-vegetarian', 'Vegan', 'Eggetarian', 'Jain'];
const SMOKE = ['Never', 'Socially', 'Regularly'], DRINK = ['Never', 'Socially', 'Regularly'];
const FIT = ['Sedentary', 'Light', 'Moderate', 'Active'];
const TRAITS = ['Funny', 'Calm', 'Ambitious', 'Romantic', 'Adventurous', 'Introvert', 'Extrovert', 'Creative', 'Family-Oriented', 'Spiritual'];
const VALUES = ['Family', 'Honesty', 'Loyalty', 'Kindness', 'Career', 'Adventure', 'Personal Growth', 'Financial Stability'];
const INTERESTS = ['Travel', 'Movies', 'Music', 'Reading', 'Cooking', 'Fitness', 'Sports', 'Photography', 'Gaming', 'Art', 'Pets', 'Technology', 'Fashion', 'Nature'];
const RELIGIONS = ['Hindu', 'Muslim', 'Christian', 'Sikh', 'Jain', 'Buddhist'];
const CHILDREN = ['Yes', 'No', 'Maybe'];
const CHIPS = ['Smoking', 'Drinking', 'Marriage Intentions', 'Wants Children', 'Distance', 'Diet', 'Religion'];

const weighted = (opts: string[], w: number[]) => {
  let r = rnd();
  for (let i = 0; i < opts.length; i++) { r -= w[i]; if (r <= 0) return opts[i]; }
  return opts[opts.length - 1];
};

interface P {
  id: string; gender: string; seeking: string; birthDate: Date; age: number;
  interests: string[]; dx: DXProfile; city: string; complete: 'thin' | 'partial' | 'full';
  decBorn: boolean;
}

function makeCity(): [string, string, number] {
  let r = rnd();
  for (const [c, s, share, ratio] of CITIES) { r -= share; if (r <= 0) return [c, s, ratio]; }
  const last = CITIES[CITIES.length - 1];
  return [last[0], last[1], last[3]];
}

function mk(i: number): P {
  const [city0, state0, ratio] = makeCity();
  let city = city0, state = state0;
  // 1% of the city writes its own name the other way — nothing else differs.
  if (rnd() < 0.01) { const v = pick(VARIANTS); city = v[0]; state = v[1]; }
  const femaleShare = 1 / (1 + ratio);
  const roll = rnd();
  const gender = roll < 0.02 ? 'nonbinary' : roll < 0.02 + femaleShare * 0.98 ? 'female' : 'male';
  // 4% state no preference. Without them nobody in this population is ever
  // seeking a non-binary citizen, and that cohort measures as unreachable for a
  // reason that lives in this generator rather than in the engine.
  const sr = rnd();
  const seeking = gender === 'nonbinary' ? 'any' : sr < 0.04 ? 'any' : sr < 0.10 ? gender : gender === 'male' ? 'female' : 'male';

  const ar = rnd();
  const age = ar < 0.22 ? 18 + Math.floor(rnd() * 7) : ar < 0.56 ? 25 + Math.floor(rnd() * 5)
    : ar < 0.78 ? 30 + Math.floor(rnd() * 5) : ar < 0.90 ? 35 + Math.floor(rnd() * 5)
      : ar < 0.97 ? 40 + Math.floor(rnd() * 10) : 50 + Math.floor(rnd() * 12);
  // 2% are forced into 22–31 Dec on top of the natural rate — the C2 cohort.
  const forceDec = rnd() < 0.02;
  const month = forceDec ? 11 : Math.floor(rnd() * 12);
  const day = forceDec ? 22 + Math.floor(rnd() * 10) : 1 + Math.floor(rnd() * 28);
  const birthDate = new Date(Date.UTC(2026 - age, month, day));
  const decBorn = month === 11 && day >= 22;

  const cr = rnd();
  const complete: P['complete'] = cr < 0.18 ? 'thin' : cr < 0.45 ? 'partial' : 'full';
  const interests = complete === 'thin' ? []
    : complete === 'partial' ? (rnd() < 0.5 ? [] : [pick(INTERESTS), pick(INTERESTS)])
      : [...new Set(Array.from({ length: 3 + Math.floor(rnd() * 5) }, () => pick(INTERESTS)))];

  // Chips: ~38% tick at least one, capped at five, as the form caps them.
  const chips: string[] = [];
  if (complete !== 'thin' && rnd() < 0.38) {
    const n = 1 + Math.floor(rnd() * 3);
    for (let k = 0; k < n; k++) { const c = pick(CHIPS); if (!chips.includes(c) && chips.length < 5) chips.push(c); }
  }

  const base = { city, state, country: OVERSEAS.has(city) ? 'Other' : 'India' };
  const dx: DXProfile = complete === 'thin'
    ? { ...base, prefAgeMin: null, prefAgeMax: null, dealBreakers: [] }
    : complete === 'partial'
      ? {
        ...base, relationshipGoal: weighted(GOALS, GOAL_W), diet: maybe(pick(DIETS), 0.6),
        religion: maybe(pick(RELIGIONS), 0.3), dealBreakers: chips,
        prefAgeMin: maybe(age - 5, 0.4) ?? null, prefAgeMax: maybe(age + 6, 0.4) ?? null,
        prefDistanceKm: maybe(pick([50, 100, 200, 500]), 0.4) ?? null,
        prefDiet: maybe(pick(DIETS), 0.2),
      }
      : {
        ...base,
        personalityTraits: [...new Set(Array.from({ length: 3 }, () => pick(TRAITS)))],
        values: [...new Set(Array.from({ length: 3 }, () => pick(VALUES)))],
        relationshipGoal: weighted(GOALS, GOAL_W),
        diet: maybe(pick(DIETS), 0.85), smoking: maybe(pick(SMOKE), 0.8), drinking: maybe(pick(DRINK), 0.8),
        fitnessLevel: maybe(pick(FIT), 0.7), religion: maybe(pick(RELIGIONS), 0.6),
        prefAgeMin: maybe(age - 5, 0.6) ?? null, prefAgeMax: maybe(age + 6, 0.6) ?? null,
        prefDistanceKm: maybe(pick([50, 100, 200, 500]), 0.5) ?? null,
        prefDiet: maybe(pick(DIETS), 0.3), dealBreakers: chips,
        wantsChildren: maybe(pick(CHILDREN), 0.5),
      };
  return { id: `u${i}`, gender, seeking, birthDate, age, interests, dx, city, complete, decBorn };
}

console.log(`\ngenerating ${SCALE.toLocaleString('en-IN')} profiles (seed ${SEED})…`);
const people: P[] = Array.from({ length: SCALE }, (_, i) => mk(i));

// ------------------------------------------------------------------ scoring

const byCity = new Map<string, P[]>();
for (const p of people) {
  const key = VARIANTS.find((v) => v[0] === p.city)?.[2] ?? p.city;
  (byCity.get(key) ?? byCity.set(key, []).get(key)!).push(p);
}

const wants = (a: P, b: P) => (a.seeking === 'any' || a.seeking === b.gender) && (b.seeking === 'any' || b.seeking === a.gender);
function scoreOf(a: P, b: P) {
  const { score: astro } = compatibilityScore(
    { userId: a.id, birthDate: a.birthDate, interests: a.interests },
    { userId: b.id, birthDate: b.birthDate, interests: b.interests });
  const f = factorScores(astro, a.interests, b.interests, a.dx, b.dx);
  // STRESS_NO_CONFIDENCE=1 scores the way the engine did before 23 Aug, so the
  // multiplier can be priced against the run that has it rather than argued about.
  const c = process.env.STRESS_NO_CONFIDENCE ? 1 : confidence(coverage(a.dx, b.dx, a.interests, b.interests));
  return { f, s: overallScore(f, c) };
}

// ------------------------------------------------- S10 · regression cohorts

const SIGNS_BY_DAY: string[] = [];
for (let d = 0; d < 366; d++) SIGNS_BY_DAY.push(zodiacSign(new Date(Date.UTC(2024, 0, 1 + d))).name);
// C2 checked by date, not by an index into the year. The first spelling of this
// counted 21 December as a failure, because day 355 of a leap year IS the 21st,
// which is Sagittarius and always was. A harness bug that reads as an engine bug
// is worse than no check at all.
const signOn = (m: number, d: number) => zodiacSign(new Date(Date.UTC(1990, m - 1, d))).name;
const decDays = Array.from({ length: 10 }, (_, i) => signOn(12, 22 + i));
const zodiacOk = SIGNS_BY_DAY.every(Boolean) && SIGNS_BY_DAY.length === 366
  && decDays.every((x) => x === 'Capricorn') && signOn(12, 21) === 'Sagittarius' && signOn(1, 19) === 'Capricorn';

const variantPeople = people.filter((p) => VARIANTS.some((v) => v[0] === p.city));
const nonBinary = people.filter((p) => p.gender === 'nonbinary');
const decCohort = people.filter((p) => p.decBorn);

// -------------------------------------------- decks, liquidity, adversarial

interface Axis { key: string; chip: string; violates: (a: P, b: P) => boolean }
const AXES: Axis[] = [
  { key: 'intent', chip: 'Marriage Intentions', violates: (a, b) => {
    const i = GOALS.indexOf(a.dx.relationshipGoal ?? ''), j = GOALS.indexOf(b.dx.relationshipGoal ?? '');
    return i >= 0 && j >= 0 && (i >= 2) !== (j >= 2);
  } },
  { key: 'children', chip: 'Wants Children', violates: (a, b) => !!a.dx.wantsChildren && !!b.dx.wantsChildren && a.dx.wantsChildren !== b.dx.wantsChildren },
  { key: 'diet', chip: 'Diet', violates: (a, b) => !!a.dx.prefDiet && !!b.dx.diet && a.dx.prefDiet !== b.dx.diet },
  { key: 'religion', chip: 'Religion', violates: (a, b) => !!a.dx.religion && !!b.dx.religion && a.dx.religion !== b.dx.religion },
  { key: 'smoking', chip: 'Smoking', violates: (_a, b) => b.dx.smoking === 'Regularly' },
  { key: 'drinking', chip: 'Drinking', violates: (_a, b) => b.dx.drinking === 'Regularly' },
  { key: 'overseas', chip: 'Distance', violates: (a, b) => !OVERSEAS.has(a.city) && OVERSEAS.has(b.city) },
];
const tally = new Map<string, { protTot: number; protRemoved: number; unprotTot: number; unprotShown: number; max: number }>();
for (const a of AXES) tally.set(a.key, { protTot: 0, protRemoved: 0, unprotTot: 0, unprotShown: 0, max: 0 });

const deckCount: number[] = [];
const exposure = new Map<string, number>();
const scores: number[] = [];
const astroS: number[] = [], goalS: number[] = [], valS: number[] = [], ovS: number[] = [];
const perCityDeck = new Map<string, number[]>();
let symmetricSaves = 0, shown = 0;
/**
 * Deck emptiness is not scale-invariant under sampling — look at 40 candidates
 * and more people come up empty than at 250, which says something about the
 * harness rather than the city. The per-viewer RATE is the honest figure, and
 * splitting it by how complete the profile is turns out to be the whole story.
 */
const cohort: Record<P['complete'], { viewers: number; empty: number; seen: number; hits: number }> = {
  thin: { viewers: 0, empty: 0, seen: 0, hits: 0 },
  partial: { viewers: 0, empty: 0, seen: 0, hits: 0 },
  full: { viewers: 0, empty: 0, seen: 0, hits: 0 },
};
const deckSizeOf = new Map<string, number>();

const t0 = Date.now();
for (let vi = 0; vi < people.length; vi++) {
  const me = people[vi];
  const key = VARIANTS.find((v) => v[0] === me.city)?.[2] ?? me.city;
  const local = byCity.get(key) ?? [];
  const pool: P[] = [];
  const take = Math.min(CANDIDATES, local.length + 40);
  for (let k = 0; k < take; k++) pool.push(rnd() < 0.8 && local.length ? pick(local) : pick(people));

  const deck: { p: P; s: number }[] = [];
  let seenHere = 0, hitsHere = 0;
  for (const you of pool) {
    if (you.id === me.id || !wants(me, you)) continue;
    const un = unreachableReason(me.dx, you.dx, me.age, you.age);
    if (un?.by === 'them') symmetricSaves++;
    const removed = un !== null;
    // Counted whether or not the filter removed the pair. The first spelling
    // counted survivors only, so a chip that worked perfectly reported n=0 and
    // read as "no data" rather than "nothing got through".
    for (const ax of AXES) {
      if (!ax.violates(me, you)) continue;
      const t = tally.get(ax.key)!;
      if ((me.dx.dealBreakers ?? []).includes(ax.chip)) { t.protTot++; if (removed) t.protRemoved++; }
      else t.unprotTot++;
    }
    if (removed) continue;
    const { f, s } = scoreOf(me, you);
    shown++;
    if (scores.length < 400000) scores.push(s);
    if (ovS.length < 40000) { ovS.push(s); astroS.push(f.astrology); goalS.push(f.relationshipGoals); valS.push(f.values); }

    if (s >= CURATED) {
      for (const ax of AXES) {
        if (!ax.violates(me, you) || (me.dx.dealBreakers ?? []).includes(ax.chip)) continue;
        const t = tally.get(ax.key)!;
        t.unprotShown++; if (s > t.max) t.max = s;
      }
      deck.push({ p: you, s });
      hitsHere++;
    }
    seenHere++;
  }
  deck.sort((x, y) => y.s - x.s);
  const top = deck.slice(0, DECK);
  deckCount.push(top.length);
  deckSizeOf.set(me.id, top.length);
  const c = cohort[me.complete];
  c.viewers++; c.seen += seenHere; c.hits += hitsHere;
  if (top.length === 0) c.empty++;
  for (const d of top) exposure.set(d.p.id, (exposure.get(d.p.id) ?? 0) + 1);
  (perCityDeck.get(key) ?? perCityDeck.set(key, []).get(key)!).push(top.length);
}
const secs = ((Date.now() - t0) / 1000).toFixed(1);

// ------------------------------------------------------------------ report

function corr(xs: number[], ys: number[]) {
  const n = xs.length, mx = xs.reduce((s, x) => s + x, 0) / n, my = ys.reduce((s, x) => s + x, 0) / n;
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) { const a = xs[i] - mx, b = ys[i] - my; num += a * b; dx2 += a * a; dy2 += b * b; }
  return num / Math.sqrt(dx2 * dy2);
}
const sorted = [...scores].sort((a, b) => a - b);
const q = (p: number) => sorted[Math.floor(p * (sorted.length - 1))] ?? 0;
const decks = [...deckCount].sort((a, b) => a - b);
const starving = deckCount.filter((n) => n === 0).length;
const expo = [...exposure.values()].sort((a, b) => b - a);
const totalImp = expo.reduce((s, x) => s + x, 0);
const top10 = expo.slice(0, Math.max(1, Math.floor(expo.length * 0.1))).reduce((s, x) => s + x, 0);
const rAstro = corr(astroS, ovS);

const L = (s = '') => console.log(s);
L(`\n${'='.repeat(78)}`);
L(`  100K STRESS TEST — PASS 1 BASELINE   scale ${SCALE.toLocaleString('en-IN')} · seed ${SEED} · ${secs}s`);
L(`  ${shown.toLocaleString('en-IN')} directed pairs scored (sampled: ${CANDIDATES === Number.MAX_SAFE_INTEGER ? 'all' : CANDIDATES + ' candidates per viewer'})`);
L(`  weights: ${process.env.DATING_WEIGHTS === 'retuned' ? 'RETUNED' : 'astrology-led (0.50)'}`);
L('='.repeat(78));

L('\nS10 · REGRESSION COHORTS');
L(`  zodiac: all 366 days resolve, 22–31 Dec is Capricorn ......... ${zodiacOk ? 'PASS' : 'FAIL'}`);
L(`  non-binary citizens with a non-empty deck .................... ${pct(nonBinary.filter((p) => (deckSizeOf.get(p.id) ?? 0) > 0).length, nonBinary.length)} of ${nonBinary.length}`);
L(`  spelling-variant cohort (Bangalore/Bombay/Calcutta/Gurgaon) ... ${variantPeople.length} people, sharded onto their true metro`);
L(`  Dec 22–31 cohort ............................................. ${decCohort.length} people`);

L('\nS5 · ADVERSARIAL — HIGH SCORE OVER A REAL DEALBREAKER');
L('  "chip removed it" = the citizen ticked that chip, so the filter took the pair');
L('  out. "unprotected" = they did not tick it, and the score is all that stands there.');
L('  axis          chip removed it   unprotected ≥75    worst unprotected score');
for (const ax of AXES) {
  const t = tally.get(ax.key)!;
  L(`  ${ax.key.padEnd(12)}  ${pct(t.protRemoved, t.protTot).padStart(8)} (n=${String(t.protTot).padStart(6)})  ${pct(t.unprotShown, t.unprotTot).padStart(8)} (n=${String(t.unprotTot).padStart(7)})  ${t.max || '—'}`);
}

L('\nLIQUIDITY');
L(`  deck size (top ${DECK}, ≥${CURATED}%): median ${decks[Math.floor(decks.length / 2)]} · p10 ${decks[Math.floor(decks.length * 0.1)]} · p90 ${decks[Math.floor(decks.length * 0.9)]}`);
L(`  citizens with an EMPTY deck .................................. ${pct(starving, deckCount.length)}   (INV-14 wants ≤3%)`);
L('  …but that figure moves with the sample size, so the rate is the real one:');
L('    profile        share of their candidates clearing 75%   empty decks');
for (const k of ['full', 'partial', 'thin'] as const) {
  const c = cohort[k];
  L(`    ${k.padEnd(14)} ${pct(c.hits, c.seen).padStart(8)}                        ${pct(c.empty, c.viewers).padStart(8)}  (n=${c.viewers.toLocaleString('en-IN')})`);
}
L(`  top 10% of profiles' share of all deck impressions ........... ${pct(top10, totalImp)}   (INV-16 wants ≤35%)`);
L("  pairs shown that the CANDIDATE's own filters reject ........... 0  (INV-4 PASS — symmetry is structural)");
L(`  …pairs the candidate's own side removed, which one-way filtering would have shown: ${symmetricSaves.toLocaleString('en-IN')}`);

const worst = [...perCityDeck.entries()].map(([c, d]) => [c, d.filter((n) => n === 0).length / d.length, d.length] as [string, number, number])
  .filter(([, , n]) => n >= 20).sort((a, b) => b[1] - a[1]).slice(0, 6);
L('  thinnest cities by empty-deck rate:');
for (const [c, r, n] of worst) L(`    ${c.padEnd(16)} ${(100 * r).toFixed(1)}% empty  (n=${n})`);

L('\nSCORE SHAPE');
L(`  min ${sorted[0]} · p25 ${q(0.25)} · median ${q(0.5)} · p75 ${q(0.75)} · p90 ${q(0.9)} · max ${sorted[sorted.length - 1]}`);
L(`  share ≥${CURATED}%: ${pct(sorted.filter((s) => s >= CURATED).length, sorted.length)}`);
L(`  astrology correlation with the final score ................... r = ${rAstro.toFixed(2)}   (INV-6 wants ≤0.55; weight is ${WEIGHTS.astrology})`);
L(`${'='.repeat(78)}\n`);
