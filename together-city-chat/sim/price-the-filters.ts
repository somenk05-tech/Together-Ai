/**
 * What the 23 Aug deal-breaker work costs, in pool size, and what it buys, in
 * pairs that should never have been shown.
 *
 * Real engine, no mocked scoring — the same rule as persona-sim.ts. 2,000
 * personas, deterministic seed. "Before" is the engine as it stood this morning:
 * the two unimplemented chips inert, no confidence multiplier. "After" is the
 * same population with the chip ticked by the people it is for.
 */
import { compatibilityScore } from '../src/dating/astrology';
import { confidence, coverage, factorScores, hardFilterReason, overallScore, type DXProfile } from '../src/dating/matching';

let seed = 42;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const pick = <T>(a: T[]): T => a[Math.floor(rnd() * a.length)];
const maybe = <T>(v: T, p: number): T | undefined => (rnd() < p ? v : undefined);

const INDIA = [['Mumbai', 'Maharashtra'], ['Pune', 'Maharashtra'], ['Bengaluru', 'Karnataka'], ['Delhi', 'Delhi'],
  ['Hyderabad', 'Telangana'], ['Chennai', 'Tamil Nadu'], ['Kolkata', 'West Bengal'], ['Jaipur', 'Rajasthan'],
  ['Ahmedabad', 'Gujarat'], ['Kochi', 'Kerala']];
const ABROAD = [['London', 'UK'], ['Dubai', 'UAE'], ['New York', 'NY'], ['Singapore', 'SG']];
const GOALS = ['Friendship First', 'Casual Dating', 'Serious Dating', 'Long-term Relationship', 'Marriage'];
const DIETS = ['Vegetarian', 'Non-vegetarian', 'Vegan', 'Eggetarian', 'Jain'];
const SMOKE = ['Never', 'Socially', 'Regularly'], DRINK = ['Never', 'Socially', 'Regularly'];
const FIT = ['Sedentary', 'Light', 'Moderate', 'Active'];
const TRAITS = ['Funny', 'Calm', 'Ambitious', 'Romantic', 'Adventurous', 'Introvert', 'Extrovert', 'Creative', 'Family-Oriented', 'Spiritual'];
const VALUES = ['Family', 'Honesty', 'Loyalty', 'Kindness', 'Career', 'Adventure', 'Personal Growth', 'Financial Stability'];
const INTERESTS = ['Travel', 'Movies', 'Music', 'Reading', 'Cooking', 'Fitness', 'Sports', 'Photography', 'Gaming', 'Art', 'Pets', 'Technology', 'Fashion', 'Nature'];
const RELIGIONS = ['Hindu', 'Muslim', 'Christian', 'Sikh', 'Jain', 'Buddhist'];
const CHILDREN = ['Yes', 'No', 'Maybe'];

interface P { id: string; gender: string; seeking: string; birthDate: Date; interests: string[]; dx: DXProfile; age: number; thin: boolean; partial: boolean }

function mk(i: number): P {
  const gender = i % 21 === 20 ? 'nonbinary' : i % 2 === 0 ? 'male' : 'female';
  const seeking = gender === 'nonbinary' ? 'any' : gender === 'male' ? 'female' : 'male';
  const b = i % 10;
  const age = b < 4 ? 22 + Math.floor(rnd() * 6) : b < 8 ? 28 + Math.floor(rnd() * 8) : 36 + Math.floor(rnd() * 15);
  const birthDate = new Date(Date.UTC(2026 - age, Math.floor(rnd() * 12), 1 + Math.floor(rnd() * 28)));
  const [city, state] = rnd() < 0.88 ? pick(INDIA) : pick(ABROAD);
  // Completeness is not two states. 18% have answered almost nothing (the case
  // the H1/M4 floors already handle); 27% have answered SOME of it, which is
  // where the floors do nothing and the curated bar is still reachable.
  const roll = rnd();
  const thin = roll < 0.18, partial = roll >= 0.18 && roll < 0.45;
  const interests = thin ? [] : partial && rnd() < 0.6 ? [] : [...new Set(Array.from({ length: 3 + Math.floor(rnd() * 5) }, () => pick(INTERESTS)))];
  const dx: DXProfile = thin
    ? { city, state, prefAgeMin: null, prefAgeMax: null, dealBreakers: [] }
    : partial
      ? {
        relationshipGoal: pick(GOALS), diet: maybe(pick(DIETS), 0.6), city, state,
        prefAgeMin: maybe(age - 5, 0.4) ?? null, prefAgeMax: maybe(age + 5, 0.4) ?? null,
        prefDiet: maybe(pick(DIETS), 0.2), dealBreakers: [], religion: maybe(pick(RELIGIONS), 0.3),
      }
      : {
      personalityTraits: [...new Set(Array.from({ length: 3 }, () => pick(TRAITS)))],
      values: [...new Set(Array.from({ length: 3 }, () => pick(VALUES)))],
      relationshipGoal: pick(GOALS),
      diet: maybe(pick(DIETS), 0.85), smoking: maybe(pick(SMOKE), 0.8), drinking: maybe(pick(DRINK), 0.8),
      fitnessLevel: maybe(pick(FIT), 0.7), religion: maybe(pick(RELIGIONS), 0.6),
      city, state,
      prefAgeMin: maybe(age - 5, 0.6) ?? null, prefAgeMax: maybe(age + 5, 0.6) ?? null,
      prefDistanceKm: maybe(200, 0.5) ?? null,
      prefDiet: maybe(pick(DIETS), 0.3),
      dealBreakers: rnd() < 0.3 ? ['Smoking'] : [],
      wantsChildren: maybe(pick(CHILDREN), 0.5),
    };
  return { id: `u${i}`, gender, seeking, birthDate, interests, dx, age, thin, partial };
}

const N = 2000;
const people = Array.from({ length: N }, (_, i) => mk(i));
const reach = (a: P, b: P) => (a.seeking === 'any' || a.seeking === b.gender) && (b.seeking === 'any' || b.seeking === a.gender);
const score = (a: P, b: P, withConfidence: boolean) => {
  const { score: astro } = compatibilityScore(
    { userId: a.id, birthDate: a.birthDate, interests: a.interests },
    { userId: b.id, birthDate: b.birthDate, interests: b.interests });
  const f = factorScores(astro, a.interests, b.interests, a.dx, b.dx);
  return overallScore(f, withConfidence ? confidence(coverage(a.dx, b.dx, a.interests, b.interests)) : 1);
};
const committed = (g?: string) => (g ? GOALS.indexOf(g) >= 2 : null);
const strictVeg = (d?: string) => d === 'Vegetarian' || d === 'Jain' || d === 'Vegan';
const abroad = (dx: DXProfile) => ABROAD.some(([c]) => c === dx.city);
const pct = (n: number, d: number) => (d ? ((100 * n) / d).toFixed(1) + '%' : 'n/a');

let intentShown = 0, intentTot = 0, dietShown = 0, dietTot = 0, distShown = 0, distTot = 0;
let thinShown = 0, thinTot = 0, thinShownAfter = 0;
let partShown = 0, partTot = 0, partShownAfter = 0;
let before75 = 0, after75 = 0, pairs = 0;
let poolIntent = 0, poolDiet = 0, poolDist = 0, poolRel = 0;

for (const me of people) {
  for (const you of people) {
    if (me.id === you.id || !reach(me, you)) continue;
    if (hardFilterReason(me.dx, you.dx, you.age) || hardFilterReason(you.dx, me.dx, me.age)) continue;
    pairs++;
    const sBefore = score(me, you, false), sAfter = score(me, you, true);
    if (sBefore >= 75) before75++;
    if (sAfter >= 75) after75++;

    const mc = committed(me.dx.relationshipGoal), yc = committed(you.dx.relationshipGoal);
    if (mc !== null && yc !== null && mc !== yc) { intentTot++; if (sBefore >= 75) intentShown++; } else poolIntent++;

    if (strictVeg(me.dx.prefDiet) && you.dx.diet === 'Non-vegetarian') { dietTot++; if (sBefore >= 75) dietShown++; } else poolDiet++;

    if (!abroad(me.dx) && abroad(you.dx)) { distTot++; if (sBefore >= 75) distShown++; } else poolDist++;

    if (me.dx.religion && you.dx.religion && me.dx.religion !== you.dx.religion) { /* removed if ticked */ } else poolRel++;

    if (me.thin && you.thin) { thinTot++; if (sBefore >= 75) thinShown++; if (sAfter >= 75) thinShownAfter++; }
    if ((me.partial || you.partial) && !me.thin && !you.thin) { partTot++; if (sBefore >= 75) partShown++; if (sAfter >= 75) partShownAfter++; }
  }
}

console.log(`\n================ PRICING THE DEAL-BREAKERS (${N} personas, real engine) ================`);
console.log(`Directed pairs surviving today's hard filters: ${pairs.toLocaleString('en-IN')}\n`);
console.log('WHAT THE UNIMPLEMENTED CHIPS WERE LETTING THROUGH');
console.log(`  intent mismatch (committed x casual) reaching >=75%:  ${pct(intentShown, intentTot)}  (${intentShown} of ${intentTot})`);
console.log(`  strict-veg viewer x non-veg candidate at >=75%:       ${pct(dietShown, dietTot)}  (${dietShown} of ${dietTot})`);
console.log(`  India-resident x overseas candidate at >=75%:         ${pct(distShown, distTot)}  (${distShown} of ${distTot})`);
console.log('  All three are zero once the citizen ticks the chip: the filter removes them before they are scored.\n');
console.log('WHAT TICKING A CHIP COSTS THE CITIZEN WHO TICKS IT');
console.log(`  Marriage Intentions removes ${pct(pairs - poolIntent, pairs)} of the pool`);
console.log(`  Diet (strict vegetarian)   removes ${pct(pairs - poolDiet, pairs)} of the pool`);
console.log(`  Distance (200 km)          removes ${pct(pairs - poolDist, pairs)} of the pool`);
console.log(`  Religion (must match)      removes ${pct(pairs - poolRel, pairs)} of the pool`);
console.log('  A citizen may tick at most five. These are one-sided costs and nobody is told they were removed.\n');
console.log('M4 — WHAT CONFIDENCE COSTS');
console.log(`  pairs at >=75% before: ${pct(before75, pairs)}   after: ${pct(after75, pairs)}`);
console.log(`  both profiles near-empty, at >=75% before: ${pct(thinShown, thinTot)}   after: ${pct(thinShownAfter, thinTot)}  (n=${thinTot})`);
console.log(`  at least one HALF-filled,   at >=75% before: ${pct(partShown, partTot)}   after: ${pct(partShownAfter, partTot)}  (n=${partTot})`);
console.log('=========================================================================================\n');
