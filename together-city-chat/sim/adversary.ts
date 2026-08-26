/**
 * §13 — the gaming attack, held to what the FORM allows.
 *
 * DatingProfile.tsx caps trait selection at 8 of 10 (capToggle, :804), values at
 * 5 of 8 (:806), interests at 10 of 14 (:802) and deal-breaker chips at 5 of 7
 * (:858). `extras` itself is validated only as `z.string().max(2_000_000)` and
 * the JSON inside is never schema-checked (parseDX is a bare JSON.parse), so a
 * crafted POST is not bound by any of them — both versions are measured.
 */
import { compatibilityScore } from '../src/dating/astrology';
import { factorScores, overallScore, confidenceFor, unreachableReason, type DXProfile } from '../src/dating/matching';
import { profileCompletion } from '../src/dating/completion';
import { buildPopulation, TRAITS, VALUES, INTERESTS, type GP } from './global-pop';

const N = Number(process.argv[2] ?? 200000);
const people = buildPopulation(N, 4242);
const bd = new Date(Date.UTC(1999, 4, 12));   // 26, an earth sign

const mk = (name: string, traits: string[], vals: string[], ints: string[], extra: Partial<DXProfile> = {}): [string, GP] => {
  const dx: DXProfile = {
    city: 'Mumbai', state: 'Maharashtra', country: 'India',
    personalityTraits: traits, values: vals, relationshipGoal: 'Marriage',
    dealBreakers: [], prefAgeMin: null, prefAgeMax: null, prefDistanceKm: null,
    heightCm: null, prefHeightMinCm: null, prefHeightMaxCm: null, ...extra,
  };
  return [name, {
    id: 'adv-' + name, market: 'IN', city: 'Mumbai', state: 'Maharashtra', country: 'India',
    lat: 19.08, lng: 72.88, tier: 'metro', gender: 'female', seeking: 'any', orientation: 'bi',
    age: 26, statedAge: 26, birthDate: bd, languages: ['English', 'Hindi'], interests: ints,
    complete: 'full', archetype: 'optimal', dx, appeal: 0.5, trueCommitted: true,
  } as GP];
};

const HONEST: [string, GP] = mk('honest', ['Calm', 'Ambitious', 'Creative'], ['Family', 'Honesty', 'Loyalty'],
  ['Travel', 'Music', 'Reading'], { diet: 'Vegetarian', smoking: 'Never', drinking: 'Socially', fitnessLevel: 'Active', religion: 'Hindu', wantsChildren: 'Yes', heightCm: 165, prefAgeMin: 24, prefAgeMax: 33, prefDistanceKm: 100, dealBreakers: ['Smoking'] });
const CANDIDATES: [string, GP][] = [
  HONEST,
  mk('honest, but no filters of their own', ['Calm', 'Ambitious', 'Creative'], ['Family', 'Honesty', 'Loyalty'], ['Travel', 'Music', 'Reading'], { diet: 'Vegetarian', smoking: 'Never', drinking: 'Socially', fitnessLevel: 'Active', religion: 'Hindu', wantsChildren: 'Yes', heightCm: 165 }),
  mk('UI-legal optimal (8 traits / 5 values / 10 interests, everything filterable left blank)',
    TRAITS.slice(0, 8), VALUES.slice(0, 5), INTERESTS.slice(0, 10)),
  mk('API-only optimal (10 / 8 / 14 — extras is never schema-validated)', [...TRAITS], [...VALUES], [...INTERESTS]),
];

const wants = (a: GP, b: GP) => (a.seeking === 'any' || a.seeking === b.gender) && (b.seeking === 'any' || b.seeking === a.gender);
const comp = (p: GP) => profileCompletion({ ...(p.dx as Record<string, unknown>), bio: 'x'.repeat(40), interests: p.interests, photos: ['a', 'b', 'c'], languages: p.languages, birthTime: null }).percent;

console.log(`  viewers: ${N.toLocaleString('en-IN')} · candidate completion %: ` +
  CANDIDATES.map(([n, c]) => `${n.split(' ')[0]}=${comp(c)}`).join(' '));
console.log('');
console.log('  candidate shape                                                              seen by   passes filters   ≥75%    ≥80%   mean score');
for (const [name, cand] of CANDIDATES) {
  let seen = 0, pass = 0, ge75 = 0, ge80 = 0, sum = 0;
  for (const me of people) {
    if (!wants(me, cand)) continue;
    seen++;
    if (unreachableReason(me.dx, cand.dx, me.statedAge, cand.statedAge)) continue;
    if (comp(cand) < 40) continue;
    pass++;
    const { score: astro } = compatibilityScore(
      { userId: me.id, birthDate: me.birthDate, interests: me.interests },
      { userId: cand.id, birthDate: cand.birthDate, interests: cand.interests });
    const f = factorScores(astro, me.interests, cand.interests, me.dx, cand.dx);
    const s = overallScore(f, confidenceFor(me.dx, cand.dx, me.interests, cand.interests));
    sum += s; if (s >= 75) ge75++; if (s >= 80) ge80++;
  }
  const P = (n: number) => ((100 * n) / Math.max(1, seen)).toFixed(2) + '%';
  console.log(`  ${name.slice(0, 74).padEnd(76)}${String(seen).padStart(8)}   ${P(pass).padStart(10)}   ${P(ge75).padStart(7)} ${P(ge80).padStart(7)}   ${(sum / Math.max(1, pass)).toFixed(1)}`);
}
