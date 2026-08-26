/**
 * Targeted probes against the SHIPPED engine. No formula is re-implemented.
 * Run: tsx sim/probes.ts
 */
import { compatibilityScore, zodiacSign } from '../src/dating/astrology';
import {
  GOAL_ORDER, WEIGHTS, coverage, confidence, factorScores, overallScore,
  hardFilterReason, unreachableReason, frictions, explain, effectiveDealBreakers,
  type DXProfile,
} from '../src/dating/matching';
import { distanceBetween, cityCoords } from '../src/shared/geo';
import { GOALS_PROD, RELIGIONS, CHILDREN, INTERESTS, TRAITS, VALUES, DIETS, trueKm } from './global-pop';

const L = (s = '') => console.log(s);
const H = (s: string) => { L(); L('─'.repeat(78)); L(s); L('─'.repeat(78)); };
const bd = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

function score(a: { id: string; bd: Date; ints: string[]; dx: DXProfile }, b: typeof a, conf = true) {
  const { score: astro } = compatibilityScore(
    { userId: a.id, birthDate: a.bd, interests: a.ints }, { userId: b.id, birthDate: b.bd, interests: b.ints });
  const f = factorScores(astro, a.ints, b.ints, a.dx, b.dx);
  const c = conf ? confidence(coverage(a.dx, b.dx, a.ints, b.ints)) : 1;
  return { f, s: overallScore(f, c), c, astro };
}
const P = (id: string, bdt: Date, ints: string[], dx: DXProfile) => ({ id, bd: bdt, ints, dx });

// ═══════════════════════════════════════════════ P1 · vocabulary proof
H('P1 · THE PRODUCTION VOCABULARY vs THE ENGINE VOCABULARY');
L('lookup.data.ts relationshipGoal labels — what the dropdown serves:');
L('  ' + JSON.stringify(GOALS_PROD));
L('matching.ts GOAL_ORDER — what the engine can parse:');
L('  ' + JSON.stringify(GOAL_ORDER));
L('');
L('  label served by the form        GOAL_ORDER index   goalScore vs itself   "committed?"');
for (const g of GOALS_PROD) {
  const i = GOAL_ORDER.indexOf(g);
  const self = score(P('a', bd(1995, 3, 3), [], { relationshipGoal: g }), P('b', bd(1995, 3, 3), [], { relationshipGoal: g }), false);
  const comm = i < 0 ? 'unparseable' : i >= 2 ? 'committed' : 'not committed';
  L(`  ${g.padEnd(30)} ${String(i).padStart(3)}              ${String(self.f.relationshipGoals).padStart(3)}                 ${comm}`);
}
L('');
L('  Marriage Intentions chip — does it EVER fire? (all 36 ordered pairs of served labels)');
let fired = 0, pairsTested = 0;
for (const g1 of GOALS_PROD) for (const g2 of GOALS_PROD) {
  pairsTested++;
  const me: DXProfile = { relationshipGoal: g1, dealBreakers: ['Marriage Intentions'] };
  const them: DXProfile = { relationshipGoal: g2 };
  if (hardFilterReason(me, them, 30) === 'intent') fired++;
}
L(`  fired on ${fired} of ${pairsTested} ordered pairs.`);
L('  same test with the engine\'s own Title-Case vocabulary:');
let fired2 = 0, n2 = 0;
for (const g1 of GOAL_ORDER) for (const g2 of GOAL_ORDER) {
  n2++;
  if (hardFilterReason({ relationshipGoal: g1, dealBreakers: ['Marriage Intentions'] }, { relationshipGoal: g2 }, 30) === 'intent') fired2++;
}
L(`  fired on ${fired2} of ${n2} ordered pairs.`);
L('');
L('  relationshipGoals FACTOR across all served-label pairs:');
const vals = new Map<number, number>();
for (const g1 of GOALS_PROD) for (const g2 of GOALS_PROD) {
  const v = factorScores(80, [], [], { relationshipGoal: g1 }, { relationshipGoal: g2 }).relationshipGoals;
  vals.set(v, (vals.get(v) ?? 0) + 1);
}
L('  ' + [...vals.entries()].sort((a, b) => a[0] - b[0]).map(([v, c]) => `${v} × ${c}`).join('   '));
L('  …and coverage() still counts relationshipGoals as ANSWERED, so no confidence penalty applies.');
L(`  coverage(goal set both sides) = ${coverage({ relationshipGoal: 'Serious dating' }, { relationshipGoal: 'Casual dating' }).toFixed(3)}`);

// ═══════════════════════════════════════════════ P2 · tropical vs sidereal
H('P2 · TWO ZODIACS IN ONE PRODUCT (dating tropical vs Astrology Zone sidereal)');
// Lahiri ayanamsa ≈ 24.1° in 2000 ⇒ sidereal sign is the previous one for ~24 days of each 30.
const SIGNS12 = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];
const AYAN = 24.0;
function siderealSignApprox(d: Date): string {
  // tropical solar longitude ≈ (dayOfYear - 79.5) deg, good to ~1.5° — enough to
  // count agreements, and deliberately approximate rather than re-implementing
  // the astrology engine's ephemeris here.
  const start = Date.UTC(d.getUTCFullYear(), 0, 1);
  const doy = Math.floor((d.getTime() - start) / 86400000);
  const trop = ((doy - 79.5) * (360 / 365.2422) % 360 + 360) % 360;
  const sid = (trop - AYAN + 360) % 360;
  return SIGNS12[Math.floor(sid / 30)];
}
let agree = 0, tot = 0;
for (let m = 0; m < 12; m++) for (let d = 1; d <= 28; d++) {
  const dt = bd(1995, m + 1, d);
  tot++;
  if (zodiacSign(dt).name === siderealSignApprox(dt)) agree++;
}
L(`  dates where the DATING sun sign equals the VEDIC (sidereal) sun sign the`);
L(`  Astrology Zone shows the same user: ${agree}/${tot} = ${(100 * agree / tot).toFixed(1)}%`);
L(`  i.e. ${(100 - 100 * agree / tot).toFixed(1)}% of citizens are matched on a sign the rest of the app`);
L('  does not call theirs. Astrology is 0.50 of the weight.');

// ═══════════════════════════════════════════════ P3 · the score's raw material
H('P3 · WHAT THE 50%-WEIGHT TERM IS ACTUALLY MADE OF');
const elems = new Map<string, string>();
for (let m = 0; m < 12; m++) elems.set(zodiacSign(bd(1995, m + 1, 25)).name, '');
const affinities = new Set<number>();
const E = ['fire', 'earth', 'air', 'water'];
// probe AFFINITY through the public API: same interests, jitter removed by差
const probe = (d1: Date, d2: Date) => compatibilityScore(
  { userId: 'x', birthDate: d1, interests: [] }, { userId: 'y', birthDate: d2, interests: [] }).score;
const reps: Record<string, Date> = { fire: bd(1995, 4, 10), earth: bd(1995, 5, 10), air: bd(1995, 6, 10), water: bd(1995, 7, 10) };
for (const a of E) for (const b of E) affinities.add(probe(reps[a], reps[b]));
L(`  distinct element-pair base values in AFFINITY: 7  (58,60,62,64,86,88,92)`);
L(`  astrology score = base + min(8, shared×2) − 4 + hash(idA,idB) mod 9`);
L(`  ⇒ the pair-ID HASH contributes up to 8 points of astrology = ${(8 * WEIGHTS.astrology).toFixed(1)} points of the shown %`);
const goalRange = 100 - 15;
L(`  for comparison, the ENTIRE relationshipGoals factor spans ${goalRange} × ${WEIGHTS.relationshipGoals} = ${(goalRange * WEIGHTS.relationshipGoals).toFixed(1)} points`);
L(`  …and on the production vocabulary it spans 100−45 = 55 × 0.10 = 5.5, only for Marriage×Marriage.`);
L('');
L('  same two people, ids swapped for other ids (nothing else changed):');
for (const ids of [['a1', 'b1'], ['a2', 'b2'], ['a3', 'b3'], ['zz', 'yy'], ['q', 'r']]) {
  const s = score(P(ids[0], bd(1993, 5, 4), ['Travel'], { city: 'Pune', country: 'India' }),
    P(ids[1], bd(1994, 9, 9), ['Travel'], { city: 'Pune', country: 'India' }));
  L(`    ids ${ids.join('/')}: astrology ${s.astro}  →  shown ${s.s}%`);
}

// ═══════════════════════════════════════════════ P4 · extreme compatibility
H('P4 · EXTREME COMPATIBILITY, THEN ONE VARIABLE BROKEN');
const twinDX = (over: Partial<DXProfile> = {}): DXProfile => ({
  city: 'Pune', state: 'Maharashtra', country: 'India',
  personalityTraits: ['Calm', 'Ambitious', 'Creative'], values: ['Family', 'Honesty', 'Loyalty'],
  relationshipGoal: 'Marriage', diet: 'Vegetarian', smoking: 'Never', drinking: 'Never',
  fitnessLevel: 'Active', religion: 'Hindu', wantsChildren: 'Yes',
  prefDiet: 'Vegetarian', prefSmoking: 'Never', dealBreakers: [], heightCm: 170,
  prefAgeMin: null, prefAgeMax: null, prefDistanceKm: null, ...over,
});
const ints = ['Travel', 'Music', 'Reading', 'Cooking', 'Nature'];
const A = P('twinA', bd(1994, 5, 12), ints, twinDX());
const B = P('twinB', bd(1994, 5, 14), ints, twinDX());
const twin = score(A, B);
// Every variant below reuses id 'twinB' so the pair-jitter term is held constant
// and the delta is attributable to the field that changed, not to the hash.
L(`  identical soulmates, same city, same everything: ${twin.s}%  (astro ${twin.astro}, coverage ${(twin.c - 0.55) / 0.45 * 1 ? '' : ''}${(twin.c).toFixed(3)})`);
L(`    breakdown ${JSON.stringify(twin.f)}`);
const kidsBroken = score(A, P('twinB', bd(1994, 5, 14), ints, twinDX({ wantsChildren: 'No' })));
L(`  same pair, one wants children and the other does NOT: ${kidsBroken.s}%   (Δ ${kidsBroken.s - twin.s})`);
const goalBroken = score(A, P('twinB', bd(1994, 5, 14), ints, twinDX({ relationshipGoal: 'Casual dating' })));
L(`  same pair, Marriage vs Casual dating (as the form writes it): ${goalBroken.s}%   (Δ ${goalBroken.s - twin.s})`);
const goalBrokenEng = score(A, P('twinB', bd(1994, 5, 14), ints, twinDX({ relationshipGoal: 'Casual Dating' })));
L(`  …the same test in the engine's own Title-Case vocabulary:    ${goalBrokenEng.s}%   (Δ ${goalBrokenEng.s - twin.s})`);
const farAway = score(A, P('twinB', bd(1994, 5, 14), ints, twinDX({ city: 'Toronto', state: 'Ontario', country: 'Canada' })));
L(`  same pair, one moved to Toronto (12,000 km): ${farAway.s}%   (Δ ${farAway.s - twin.s})`);
const allBroken = score(A, P('twinB', bd(1994, 5, 14), ints, twinDX({ wantsChildren: 'No', relationshipGoal: 'Casual dating', city: 'Toronto', state: 'Ontario', country: 'Canada' })));
L(`  all three broken at once: ${allBroken.s}%   (Δ ${allBroken.s - twin.s})`);

// ═══════════════════════════════════════════════ P5 · deal-breaker compensation
H('P5 · CAN A DEAL-BREAKER BE OUT-SCORED BY SMALL SIMILARITIES?');
const wantsAll: DXProfile = { city: 'Mumbai', state: 'Maharashtra', country: 'India',
  personalityTraits: ['Funny', 'Adventurous', 'Creative'], values: ['Family', 'Adventure', 'Kindness'],
  relationshipGoal: 'Marriage', wantsChildren: 'Yes', diet: 'Non-vegetarian', smoking: 'Never',
  drinking: 'Socially', fitnessLevel: 'Active', religion: 'Hindu', dealBreakers: [], heightCm: 175 };
const wantsNone: DXProfile = { ...wantsAll, relationshipGoal: 'Casual dating', wantsChildren: 'No' };
const shared = ['Travel', 'Music', 'Movies', 'Fitness', 'Photography'];
const compensated = score(P('m1', bd(1993, 4, 15), shared, wantsAll), P('m2', bd(1993, 8, 20), shared, wantsNone));
L(`  A wants marriage + children. B wants casual + no children.`);
L(`  They share city, personality, values, habits, five interests, and complementary signs.`);
L(`  SHOWN SCORE: ${compensated.s}%`);
L(`  breakdown: ${JSON.stringify(compensated.f)}`);
L(`  frictions the card would print: ${JSON.stringify(frictions(compensated.f, wantsAll, wantsNone))}`);
L(`  hard filter with NO chips ticked: ${hardFilterReason(wantsAll, wantsNone, 33) ?? 'nothing removed'}`);
L(`  hard filter with BOTH relevant chips ticked: ${hardFilterReason({ ...wantsAll, dealBreakers: ['Marriage Intentions', 'Wants Children'] }, wantsNone, 33) ?? 'nothing removed'}`);
L(`  …with only "Marriage Intentions": ${hardFilterReason({ ...wantsAll, dealBreakers: ['Marriage Intentions'] }, wantsNone, 33) ?? 'nothing removed'}`);

// ═══════════════════════════════════════════════ P6 · symmetry
H('P6 · SYMMETRY');
let asym = 0, tested = 0, maxD = 0;
const rnd = (() => { let s = 7; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; })();
for (let i = 0; i < 20000; i++) {
  const mk = (k: number): DXProfile => ({
    city: ['Pune', 'Delhi', 'London', 'Lagos'][k % 4], country: ['India', 'India', 'United Kingdom', 'Nigeria'][k % 4],
    personalityTraits: TRAITS.slice(0, 1 + (k % 4)), values: VALUES.slice(0, 1 + (k % 3)),
    relationshipGoal: GOALS_PROD[k % 6], diet: DIETS[k % 6], smoking: 'Never', drinking: 'Socially',
    wantsChildren: CHILDREN[k % 4], religion: RELIGIONS[k % 13], dealBreakers: [], heightCm: 160 + (k % 30),
    prefDistanceKm: k % 3 === 0 ? 100 : null, prefDiet: k % 5 === 0 ? DIETS[(k + 1) % 6] : undefined,
  });
  const ka = Math.floor(rnd() * 1000), kb = Math.floor(rnd() * 1000);
  const x = P('p' + ka, bd(1990 + (ka % 15), 1 + (ka % 12), 1 + (ka % 28)), INTERESTS.slice(0, ka % 6), mk(ka));
  const y = P('p' + kb, bd(1990 + (kb % 15), 1 + (kb % 12), 1 + (kb % 28)), INTERESTS.slice(0, kb % 6), mk(kb));
  const s1 = score(x, y).s, s2 = score(y, x).s;
  tested++; if (s1 !== s2) { asym++; maxD = Math.max(maxD, Math.abs(s1 - s2)); }
}
L(`  A→B vs B→A over ${tested.toLocaleString()} random pairs: ${asym} differ (max Δ ${maxD}).`);
L('  The COMPATIBILITY number is symmetric by construction.');
L('  Reachability is not: unreachableReason resolves to the stricter side, and');
L('  learned-weights.ts makes the DISPLAYED figure viewer-relative once a citizen');
L('  has made 15 decisions — so the same pair can legitimately see two numbers.');

// ═══════════════════════════════════════════════ P7 · generic profile
H('P7 · THE GENERIC PROFILE, AND THE MAXIMALIST PROFILE');
const target: DXProfile = { city: 'Bengaluru', state: 'Karnataka', country: 'India',
  personalityTraits: ['Calm', 'Creative', 'Ambitious'], values: ['Family', 'Honesty', 'Career'],
  relationshipGoal: 'Serious dating', diet: 'Vegetarian', smoking: 'Never', drinking: 'Never',
  fitnessLevel: 'Active', religion: 'Hindu', wantsChildren: 'Yes', dealBreakers: [], heightCm: 168 };
const tInts = ['Travel', 'Reading', 'Music'];
const variants: [string, string[], DXProfile][] = [
  ['blank profile', [], { city: 'Bengaluru', country: 'India' }],
  ['3 traits / 3 values, honest', tInts, { ...target, personalityTraits: ['Funny', 'Adventurous', 'Spiritual'], values: ['Career', 'Adventure', 'Kindness'] }],
  ['perfectly matched twin', tInts, target],
  ['EVERY trait, EVERY value, EVERY interest', [...INTERESTS], { ...target, personalityTraits: [...TRAITS], values: [...VALUES], prefDiet: undefined, prefSmoking: undefined, dealBreakers: [] }],
  ['every trait, every value, no interests', [], { ...target, personalityTraits: [...TRAITS], values: [...VALUES] }],
];
for (const [name, vi, vd] of variants) {
  const s = score(P('t', bd(1994, 7, 2), tInts, target), P('v', bd(1994, 11, 2), vi, vd));
  L(`  ${name.padEnd(40)} → ${String(s.s).padStart(3)}%   personality ${String(s.f.personality).padStart(3)}  values ${String(s.f.values).padStart(3)}  interests ${String(s.f.interests).padStart(3)}  astro ${s.astro}`);
}
L('');
L('  Introvert+Extrovert on the SAME profile (the complement bonus fires against everyone):');
for (const t of [['Introvert'], ['Extrovert'], ['Introvert', 'Extrovert'], [...TRAITS]]) {
  const s = score(P('t', bd(1994, 7, 2), tInts, { ...target, personalityTraits: ['Introvert'] }),
    P('v', bd(1994, 11, 2), tInts, { ...target, personalityTraits: t }));
  L(`    candidate traits ${JSON.stringify(t).padEnd(46)} personality ${s.f.personality}`);
}

// ═══════════════════════════════════════════════ P8 · missing data
H('P8 · MISSING DATA — WHAT AN UNANSWERED PROFILE IS WORTH');
const full = twinDX();
const tiers: [string, DXProfile, string[]][] = [
  ['100% complete', full, ints],
  ['~75%', { city: 'Pune', state: 'Maharashtra', country: 'India', personalityTraits: ['Calm', 'Ambitious', 'Creative'], values: ['Family', 'Honesty', 'Loyalty'], relationshipGoal: 'Marriage', diet: 'Vegetarian' }, ints],
  ['~50%', { city: 'Pune', state: 'Maharashtra', country: 'India', relationshipGoal: 'Marriage', diet: 'Vegetarian' }, ints],
  ['~25%', { city: 'Pune', state: 'Maharashtra', country: 'India', diet: 'Vegetarian' }, []],
  ['name + birth date only', { city: 'Pune', state: 'Maharashtra', country: 'India' }, []],
];
for (const [name, dxx, ii] of tiers) {
  const s = score(P('f', bd(1994, 5, 12), ints, full), P('g', bd(1994, 5, 14), ii, dxx));
  const raw = overallScore(s.f, 1);
  L(`  ${name.padEnd(26)} coverage ${(coverage(full, dxx, ints, ii)).toFixed(2)}  ×${s.c.toFixed(3)}   raw ${raw} → shown ${s.s}%`);
}
L('  Two entirely empty profiles against each other:');
for (const [d1, d2, lbl] of [[bd(1994, 5, 12), bd(1994, 9, 12), 'complementary elements'], [bd(1994, 5, 12), bd(1994, 11, 12), 'clashing elements']] as [Date, Date, string][]) {
  const s = score(P('e1', d1, [], { city: 'Pune', country: 'India' }), P('e2', d2, [], { city: 'Pune', country: 'India' }));
  L(`    ${lbl.padEnd(26)} → ${s.s}%   (nothing is known about either person)`);
}

// ═══════════════════════════════════════════════ P9 · geography
H('P9 · GEOGRAPHY — THE COORDINATE TABLE AT GLOBAL SCALE');
const ladder = [['Pune', 'Maharashtra', 'India'], ['Mumbai', 'Maharashtra', 'India'], ['Nashik', 'Maharashtra', 'India'],
  ['Hyderabad', 'Telangana', 'India'], ['Delhi', 'Delhi', 'India'], ['Dubai', 'Dubai', 'United Arab Emirates'],
  ['London', 'England', 'United Kingdom'], ['Toronto', 'Ontario', 'Canada'], ['Sao Paulo', 'Sao Paulo', 'Brazil']];
const home = { city: 'Pune', state: 'Maharashtra', country: 'India' };
L('  place                          engine km    location factor   shown %');
for (const [c, st, co] of ladder) {
  const dxx = twinDX({ city: c, state: st, country: co });
  const km = distanceBetween(home as DXProfile, dxx);
  const s = score(P('h', bd(1994, 5, 12), ints, twinDX()), P('t', bd(1994, 5, 14), ints, dxx));
  L(`  ${(c + ', ' + co).padEnd(30)} ${(km === null ? 'unmeasured' : String(km)).padStart(10)}   ${String(s.f.location).padStart(8)}          ${s.s}%`);
}
L('');
L('  Cities the engine CANNOT place (distance filter cannot fire, location = 30):');
const unplaceable = [['Sao Paulo', 'Sao Paulo', 'Brazil'], ['Lagos', 'Lagos', 'Nigeria'], ['Jakarta', 'Jakarta', 'Indonesia'],
  ['Seoul', 'Seoul', 'South Korea'], ['Berlin', 'Berlin', 'Germany'], ['Nairobi', 'Nairobi', 'Kenya'],
  ['Mexico City', 'CDMX', 'Mexico'], ['Manila', 'Metro Manila', 'Philippines'], ['Riyadh', 'Riyadh', 'Saudi Arabia'],
  ['Melbourne', 'Victoria', 'Australia'], ['Bagalkot', 'Karnataka', 'India'], ['Fargo', 'North Dakota', 'United States']];
for (const [c, st, co] of unplaceable) {
  const r = cityCoords(c, st, co);
  L(`    ${(c + ', ' + co).padEnd(34)} ${r ? `RESOLVED to ${r.lat},${r.lng}` : 'null — unplaceable'}`);
}
L('');
L('  Cities the engine places WRONGLY (regex collision):');
const collisions: [string, string, string, string][] = [
  ['London', 'Ontario', 'Canada', 'London UK'],
  ['Kochi', 'Kochi', 'Japan', 'Kochi, Kerala'],
  ['Salem', 'Oregon', 'United States', 'Salem, Tamil Nadu'],
  ['Jerusalem', 'Jerusalem', 'Israel', 'Salem, Tamil Nadu (substring)'],
  ['Fargo', 'North Dakota', 'United States', 'Kota, Rajasthan (substring "kota")'],
  ['Hyderabad', 'Sindh', 'Pakistan', 'Hyderabad, Telangana'],
  ['Springfield', 'Illinois', 'United States', '—'],
];
for (const [c, st, co, expect] of collisions) {
  const r = cityCoords(c, st, co);
  L(`    ${(c + ', ' + st).padEnd(28)} → ${r ? `${r.lat},${r.lng}` : 'null'}   (would be: ${expect})`);
}

// ═══════════════════════════════════════════════ P10 · religion / children equality
H('P10 · EQUALITY AS A PROXY FOR COMPATIBILITY');
L('  Religion deal-breaker is exact string equality over 13 lookup labels:');
for (const [a, b] of [['Atheist', 'Agnostic'], ['Christian', 'Christian'], ['Prefer not to say', 'Prefer not to say'],
  ['Other', 'Other'], ['Spiritual', 'Hindu'], ['Muslim', 'Christian']] as [string, string][]) {
  const r = hardFilterReason({ religion: a, dealBreakers: ['Religion'] }, { religion: b }, 30);
  L(`    ${a.padEnd(20)} vs ${b.padEnd(20)} → ${r ? 'REMOVED' : 'kept'}`);
}
L('  Wants Children deal-breaker, same shape over 4 labels:');
for (const [a, b] of [['Yes', 'Maybe'], ['Yes', 'Prefer not to say'], ['Maybe', 'Maybe'], ['Prefer not to say', 'Prefer not to say'], ['Yes', 'No']] as [string, string][]) {
  const r = hardFilterReason({ wantsChildren: a, dealBreakers: ['Wants Children'] }, { wantsChildren: b }, 30);
  L(`    ${a.padEnd(20)} vs ${b.padEnd(20)} → ${r ? 'REMOVED' : 'kept'}`);
}
L('  Diet: Vegetarian vs Vegan / Jain — three ways of not eating meat:');
for (const [a, b] of [['Vegetarian', 'Vegan'], ['Vegetarian', 'Jain'], ['Vegan', 'Vegetarian'], ['Vegetarian', 'Non-vegetarian']] as [string, string][]) {
  const r = hardFilterReason({ prefDiet: a, dealBreakers: ['Diet'] }, { diet: b }, 30);
  L(`    prefers ${a.padEnd(14)} candidate eats ${b.padEnd(16)} → ${r ? 'REMOVED' : 'kept'}`);
}

// ═══════════════════════════════════════════════ P11 · language
H('P11 · LANGUAGE');
L(`  matching.ts reads these DXProfile fields: personalityTraits, values, relationshipGoal,`);
L(`  diet, smoking, drinking, fitnessLevel, prefDiet, prefSmoking, prefDrinking, city, state,`);
L(`  country, prefAge*, prefDistanceKm, heightCm, prefHeight*, dealBreakers, wantsChildren, religion.`);
L(`  'languages' is collected (completion.ts weights it 4 points) and read by NOTHING in the`);
L(`  scoring path. A monolingual Japanese speaker and a monolingual Brazilian can score:`);
const jp = twinDX({ city: 'Tokyo', state: 'Tokyo', country: 'Japan' });
const br = twinDX({ city: 'Sao Paulo', state: 'Sao Paulo', country: 'Brazil' });
const lang = score(P('jp', bd(1994, 5, 12), ints, jp), P('br', bd(1994, 5, 14), ints, br));
L(`    ${lang.s}%  — location ${lang.f.location} (both unplaceable ⇒ "no location in common" ⇒ 30)`);

// ═══════════════════════════════════════════════ P12 · false precision
H('P12 · HOW MANY DISTINCT ANSWERS DOES THE SCORE ACTUALLY HAVE?');
{
  const rr = (() => { let s = 99; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; })();
  const mkp = (k: number) => {
    const dxx: DXProfile = {
      city: ['Pune', 'Mumbai', 'Delhi', 'London', 'Lagos', 'Tokyo'][k % 6],
      state: ['Maharashtra', 'Maharashtra', 'Delhi', 'England', 'Lagos', 'Tokyo'][k % 6],
      country: ['India', 'India', 'India', 'United Kingdom', 'Nigeria', 'Japan'][k % 6],
      personalityTraits: TRAITS.filter(() => rr() < 0.3), values: VALUES.filter(() => rr() < 0.35),
      relationshipGoal: GOALS_PROD[Math.floor(rr() * 6)], diet: DIETS[Math.floor(rr() * 6)],
      smoking: 'Never', drinking: 'Socially', fitnessLevel: 'Active',
      religion: RELIGIONS[Math.floor(rr() * 13)], wantsChildren: CHILDREN[Math.floor(rr() * 4)],
      dealBreakers: [], heightCm: 160 + Math.floor(rr() * 30),
    };
    return P('z' + k, bd(1988 + Math.floor(rr() * 15), 1 + Math.floor(rr() * 12), 1 + Math.floor(rr() * 28)),
      INTERESTS.filter(() => rr() < 0.3), dxx);
  };
  const pool = Array.from({ length: 3000 }, (_, k) => mkp(k));
  const ss: number[] = [];
  for (let i = 0; i < 200000; i++) {
    const a = pool[Math.floor(rr() * pool.length)], b = pool[Math.floor(rr() * pool.length)];
    if (a.id === b.id) continue;
    ss.push(score(a, b).s);
  }
  ss.sort((a, b) => a - b);
  const hist = new Map<number, number>();
  for (const v of ss) hist.set(v, (hist.get(v) ?? 0) + 1);
  let Hbits = 0;
  for (const c of hist.values()) { const p = c / ss.length; Hbits -= p * Math.log2(p); }
  const qq = (p: number) => ss[Math.floor(p * (ss.length - 1))];
  L(`  n = ${ss.length.toLocaleString()} scored pairs, complete-ish profiles, mixed globally`);
  L(`  min ${ss[0]} · p05 ${qq(.05)} · p25 ${qq(.25)} · median ${qq(.5)} · p75 ${qq(.75)} · p95 ${qq(.95)} · max ${ss[ss.length - 1]}`);
  L(`  distinct integer values used: ${hist.size} of 101`);
  L(`  Shannon entropy of the displayed % : ${Hbits.toFixed(2)} bits  ⇒ ~${Math.round(2 ** Hbits)} effectively distinguishable levels`);
  L(`  share ≥90%: ${(100 * ss.filter((x) => x >= 90).length / ss.length).toFixed(2)}%   ≥80%: ${(100 * ss.filter((x) => x >= 80).length / ss.length).toFixed(2)}%   ≥75%: ${(100 * ss.filter((x) => x >= 75).length / ss.length).toFixed(2)}%`);
  L(`  ≥70%: ${(100 * ss.filter((x) => x >= 70).length / ss.length).toFixed(2)}%   ≥60%: ${(100 * ss.filter((x) => x >= 60).length / ss.length).toFixed(2)}%   <60%: ${(100 * ss.filter((x) => x < 60).length / ss.length).toFixed(2)}%`);
  L(`  the ±4 points contributed by the ID hash spans ${(100 * ss.filter((x) => x >= qq(.5) - 2 && x <= qq(.5) + 2).length / ss.length).toFixed(1)}% of the whole population`);
}

// ═══════════════════════════════════════════════ P13 · what the card says
H('P13 · WHAT THE CARD SAYS ABOUT THE 87% MARRIAGE-vs-CASUAL PAIR');
{
  const s = compensated;
  L('  explain(): ' + JSON.stringify(explain(s.f, ['Travel', 'Music', 'Movies'], [], 'In your city.')));
  L('  frictions(): ' + JSON.stringify(frictions(s.f, wantsAll, wantsNone)));
  L('  breakdown printed on the card: ' + JSON.stringify(s.f));
  L('  Note relationshipGoals reads 45 — which the UI has no vocabulary for, and which');
  L('  is the SAME 45 an unanswered field produces.');
}
