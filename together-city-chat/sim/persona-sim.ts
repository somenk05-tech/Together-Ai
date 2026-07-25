/**
 * 250-persona simulation against the REAL dating engine code
 * (matching.ts + astrology.ts + completion.ts). No mocks of scoring.
 */
import { compatibilityScore, zodiacSign } from '../src/dating/astrology';
import { factorScores, overallScore, hardFilterReason, WEIGHTS, type DXProfile } from '../src/dating/matching';
import { profileCompletion } from '../src/dating/completion';

// ---------- deterministic RNG ----------
let seed = 42;
function rnd(): number { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }
function pick<T>(arr: T[]): T { return arr[Math.floor(rnd() * arr.length)]; }
function maybe<T>(v: T, p: number): T | undefined { return rnd() < p ? v : undefined; }

const CITIES = [
  ['Mumbai', 'Maharashtra'], ['Pune', 'Maharashtra'], ['Bengaluru', 'Karnataka'], ['Delhi', 'Delhi'],
  ['Hyderabad', 'Telangana'], ['Chennai', 'Tamil Nadu'], ['Kolkata', 'West Bengal'], ['Jaipur', 'Rajasthan'],
  ['Ahmedabad', 'Gujarat'], ['Kochi', 'Kerala'], ['Chandigarh', 'Punjab'], ['Lucknow', 'Uttar Pradesh'],
  ['London', 'UK'], ['Dubai', 'UAE'], ['New York', 'NY'], ['Singapore', 'SG'],
];
const GOALS = ['Friendship First', 'Casual Dating', 'Serious Dating', 'Long-term Relationship', 'Marriage'];
const DIETS = ['Vegetarian', 'Non-vegetarian', 'Vegan', 'Eggetarian', 'Jain'];
const SMOKE = ['Never', 'Socially', 'Regularly'];
const DRINK = ['Never', 'Socially', 'Regularly'];
const FIT = ['Sedentary', 'Light', 'Moderate', 'Active'];
const TRAITS = ['Funny', 'Calm', 'Ambitious', 'Romantic', 'Adventurous', 'Introvert', 'Extrovert', 'Creative', 'Family-Oriented', 'Spiritual'];
const VALUES = ['Family', 'Honesty', 'Loyalty', 'Kindness', 'Career', 'Adventure', 'Personal Growth', 'Financial Stability'];
const INTERESTS = ['Travel', 'Movies', 'Music', 'Reading', 'Cooking', 'Fitness', 'Sports', 'Photography', 'Gaming', 'Art', 'Pets', 'Technology', 'Fashion', 'Nature'];
const CHILDREN = ['Yes', 'No', 'Maybe'];

interface Persona {
  id: string; label: string; gender: 'male' | 'female' | 'nonbinary'; seeking: string;
  birthDate: Date; interests: string[]; dx: DXProfile & { city?: string; state?: string };
  age: number;
}

function mkPersona(i: number): Persona {
  const gender = i % 21 === 20 ? 'nonbinary' : (i % 2 === 0 ? 'male' : 'female');
  const seeking = gender === 'nonbinary' ? 'any' : (gender === 'male' ? 'female' : 'male');
  // age buckets: 21-27 young pro, 28-35, 36-50 divorced/parent, some 50+
  const bucket = i % 10;
  const age = bucket < 4 ? 22 + Math.floor(rnd() * 6) : bucket < 8 ? 28 + Math.floor(rnd() * 8) : 36 + Math.floor(rnd() * 15);
  const year = 2026 - age;
  const birthDate = new Date(Date.UTC(year, Math.floor(rnd() * 12), 1 + Math.floor(rnd() * 28)));
  const [city, state] = pick(CITIES);
  const nInt = 3 + Math.floor(rnd() * 5);
  const interests = [...new Set(Array.from({ length: nInt }, () => pick(INTERESTS)))];
  const goal = pick(GOALS);
  const dx: Persona['dx'] = {
    personalityTraits: [...new Set(Array.from({ length: 3 }, () => pick(TRAITS)))],
    values: [...new Set(Array.from({ length: 3 }, () => pick(VALUES)))],
    relationshipGoal: goal,
    diet: maybe(pick(DIETS), 0.85), smoking: maybe(pick(SMOKE), 0.8), drinking: maybe(pick(DRINK), 0.8),
    fitnessLevel: maybe(pick(FIT), 0.7),
    city, state,
    prefAgeMin: maybe(age - 5, 0.6) ?? null, prefAgeMax: maybe(age + 5, 0.6) ?? null,
    dealBreakers: rnd() < 0.3 ? ['Smoking'] : rnd() < 0.15 ? ['Wants Children'] : [],
    wantsChildren: maybe(pick(CHILDREN), 0.5),
  };
  return { id: `u${String(i).padStart(3, '0')}`, label: `p${i}`, gender, seeking, birthDate, interests, dx, age };
}

const people: Persona[] = Array.from({ length: 250 }, (_, i) => mkPersona(i));

// ---------- replicate matches() logic exactly ----------
function pairScore(a: Persona, b: Persona) {
  const { score: astro } = compatibilityScore(
    { userId: a.id, birthDate: a.birthDate, interests: a.interests },
    { userId: b.id, birthDate: b.birthDate, interests: b.interests },
  );
  const f = factorScores(astro, a.interests, b.interests, a.dx, b.dx);
  return { f, overall: overallScore(f), astro };
}

function reachable(a: Persona, b: Persona) {
  const iWant = a.seeking === 'any' || a.seeking === b.gender;
  const theyWant = b.seeking === 'any' || b.seeking === a.gender;
  return iWant && theyWant;
}

// 1) score distribution across ALL reachable pairs (viewer-side hard filter, like matches())
const allScores: number[] = [];
let filteredByViewer = 0, wouldBeFilteredByCandidate = 0, asymmetric = 0;
const perUserMatches: number[] = [];
for (const me of people) {
  let mine = 0;
  for (const cand of people) {
    if (cand.id === me.id) continue;
    if (!reachable(me, cand)) continue;
    const viewerBlocks = hardFilterReason(me.dx, cand.dx, cand.age) !== null;
    const candBlocks = hardFilterReason(cand.dx, me.dx, me.age) !== null;
    if (viewerBlocks) { filteredByViewer++; continue; }
    if (candBlocks) { wouldBeFilteredByCandidate++; asymmetric++; }
    const { overall } = pairScore(me, cand);
    allScores.push(overall);
    if (overall >= 75) mine++;
  }
  perUserMatches.push(mine);
}
allScores.sort((x, y) => x - y);
const q = (p: number) => allScores[Math.floor(p * (allScores.length - 1))];
const mean = allScores.reduce((s, x) => s + x, 0) / allScores.length;
console.log('=== SCORE DISTRIBUTION (real engine, viewer-side filters, n=' + allScores.length + ' directed pairs) ===');
console.log(`min ${allScores[0]} | p10 ${q(0.1)} | p25 ${q(0.25)} | median ${q(0.5)} | p75 ${q(0.75)} | p90 ${q(0.9)} | max ${allScores[allScores.length - 1]} | mean ${mean.toFixed(1)}`);
console.log(`share >=75%: ${(100 * allScores.filter((s) => s >= 75).length / allScores.length).toFixed(1)}%`);
console.log(`share >=85%: ${(100 * allScores.filter((s) => s >= 85).length / allScores.length).toFixed(1)}%`);
console.log(`ASYMMETRY: candidate-side hard filter would reject viewer in ${asymmetric} shown directed pairs (matches() does NOT check this)`);

perUserMatches.sort((a, b) => a - b);
console.log(`\n=== MATCHES >=75 PER USER (cap 24 in prod) ===`);
console.log(`min ${perUserMatches[0]} | median ${perUserMatches[125]} | p90 ${perUserMatches[225]} | max ${perUserMatches[249]}`);
console.log(`users with 0 curated matches: ${perUserMatches.filter((n) => n === 0).length}/250`);
console.log(`users with >24 (list truncated): ${perUserMatches.filter((n) => n > 24).length}/250`);

// 2) astrology dominance: correlation of overall with astro vs values overlap
function corr(xs: number[], ys: number[]) {
  const n = xs.length, mx = xs.reduce((s, x) => s + x, 0) / n, my = ys.reduce((s, x) => s + x, 0) / n;
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) { const a = xs[i] - mx, b = ys[i] - my; num += a * b; dx2 += a * a; dy2 += b * b; }
  return num / Math.sqrt(dx2 * dy2);
}
const ov: number[] = [], as_: number[] = [], go: number[] = [], va: number[] = [];
for (let k = 0; k < 4000; k++) {
  const a = pick(people), b = pick(people);
  if (a.id === b.id) continue;
  const { f, overall } = pairScore(a, b);
  ov.push(overall); as_.push(f.astrology); go.push(f.relationshipGoals); va.push(f.values);
}
console.log(`\n=== WHAT DRIVES THE SCORE (correlation with overall) ===`);
console.log(`astrology r=${corr(as_, ov).toFixed(2)} | relationshipGoals r=${corr(go, ov).toFixed(2)} | values r=${corr(va, ov).toFixed(2)} (weights: astro ${WEIGHTS.astrology}, goals ${WEIGHTS.relationshipGoals}, values ${WEIGHTS.values})`);

// 3) marriage-seeker vs casual dater pairs scoring >=75 (serious-intent mismatch)
let marriageCasual75 = 0, marriageCasualTotal = 0;
for (const a of people.filter((p) => p.dx.relationshipGoal === 'Marriage')) {
  for (const b of people.filter((p) => p.dx.relationshipGoal === 'Casual Dating')) {
    if (!reachable(a, b)) continue;
    if (hardFilterReason(a.dx, b.dx, b.age)) continue;
    marriageCasualTotal++;
    if (pairScore(a, b).overall >= 75) marriageCasual75++;
  }
}
console.log(`\n=== INTENT MISMATCH ===`);
console.log(`Marriage-seeker x Casual-dater reachable pairs: ${marriageCasualTotal}; scoring >=75 (shown as "curated"): ${marriageCasual75} (${(100 * marriageCasual75 / Math.max(1, marriageCasualTotal)).toFixed(1)}%)`);

// 4) dietary: Jain/vegetarian x non-veg pairs >=75
let dietMismatch75 = 0, dietTotal = 0;
for (const a of people.filter((p) => p.dx.diet === 'Vegetarian' || p.dx.diet === 'Jain')) {
  for (const b of people.filter((p) => p.dx.diet === 'Non-vegetarian')) {
    if (!reachable(a, b) || hardFilterReason(a.dx, b.dx, b.age)) continue;
    dietTotal++;
    if (pairScore(a, b).overall >= 75) dietMismatch75++;
  }
}
console.log(`Veg/Jain x Non-veg pairs >=75: ${dietMismatch75}/${dietTotal} (${(100 * dietMismatch75 / Math.max(1, dietTotal)).toFixed(1)}%) — no diet preference filter exists`);

// 5) long distance: different-country pairs >=75 (no distance filter)
let farPairs75 = 0, farTotal = 0;
for (const a of people.filter((p) => ['Mumbai', 'Delhi', 'Bengaluru'].includes(p.dx.city!))) {
  for (const b of people.filter((p) => ['London', 'New York', 'Dubai', 'Singapore'].includes(p.dx.city!))) {
    if (!reachable(a, b) || hardFilterReason(a.dx, b.dx, b.age)) continue;
    farTotal++;
    if (pairScore(a, b).overall >= 75) farPairs75++;
  }
}
console.log(`India-metro x overseas pairs >=75: ${farPairs75}/${farTotal} (${(100 * farPairs75 / Math.max(1, farTotal)).toFixed(1)}%) — prefDistanceKm is collected but never used`);

// 6) jitter effect: identical twins except userId
const twinA = { userId: 'twin-a', birthDate: new Date(Date.UTC(1995, 4, 10)), interests: ['Travel', 'Music'] };
const twinTargets = Array.from({ length: 200 }, (_, i) => ({ userId: `t${i}`, birthDate: new Date(Date.UTC(1996, 7, 2)), interests: ['Travel', 'Music'] }));
const jitterScores = twinTargets.map((t) => compatibilityScore(twinA, t).score);
console.log(`\n=== PSEUDO-RANDOM JITTER (identical profiles, only userId differs) ===`);
console.log(`astro scores span ${Math.min(...jitterScores)}–${Math.max(...jitterScores)} for IDENTICAL birthdays/interests (pairJitter adds 0–8)`);

// 7) element floor/ceiling: best & worst possible astro
console.log(`\n=== ASTRO BOUNDS === fire-water base 58 → floor astro ~54; earth-water base 92 + bonuses → ~99`);

// 8) empty profile: minimum-viable profile score vs rich profile
const bare: DXProfile = {};
const rich = people[3].dx;
const bareF = factorScores(70, [], [], bare, bare);
console.log(`\n=== EMPTY-EXTRAS PROFILE (no personality/values/lifestyle answered) ===`);
console.log(`factors: personality ${bareF.personality}, goals ${bareF.relationshipGoals}, values ${bareF.values}, lifestyle ${bareF.lifestyle}, interests ${bareF.interests}, location ${bareF.location} → overall ${overallScore(bareF)} with astro 70`);
const bareHigh = factorScores(92, [], [], bare, bare);
console.log(`same but astro 92 (earth-water): overall ${overallScore(bareHigh)} → two blank profiles can be a "curated 75%+ match" on star signs alone: ${overallScore(bareHigh) >= 75}`);

// 9) completion: what % does a fully-blank prefill show
console.log(`\n=== COMPLETION ===`);
console.log('blank profile completion:', JSON.stringify(profileCompletion({}).percent) + '%');
const noBirthTime = profileCompletion({ bio: 'a'.repeat(30), interests: ['a', 'b', 'c'], photos: ['1', '2', '3', '4', '5'], personalityTraits: ['a', 'b', 'c'], values: ['a'], languages: ['en'], city: 'Mumbai', relationshipGoal: 'Marriage', diet: 'Veg', smoking: 'Never', drinking: 'Never', fitnessLevel: 'Active', prefAgeMin: 25, prefAgeMax: 30 });
console.log(`everything except birthTime: ${noBirthTime.percent}% (birthTime alone withholds ${100 - noBirthTime.percent}%)`);

// 10) zodiac boundary sanity
console.log(`\n=== ZODIAC EDGE ===`);
console.log('Jan 1 =', zodiacSign(new Date(Date.UTC(1990, 0, 1))).name, '| Dec 31 =', zodiacSign(new Date(Date.UTC(1990, 11, 31))).name, '| Jan 20 =', zodiacSign(new Date(Date.UTC(1990, 0, 20))).name, '| Feb 18 =', zodiacSign(new Date(Date.UTC(1990, 1, 18))).name);
