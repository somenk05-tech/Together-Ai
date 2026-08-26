/**
 * What one call to dating.service.matches() costs per candidate, measured.
 * The query is unbounded (`findMany` with no take, no city scope, selecting the
 * whole row including `extras`), so this multiplies straight by pool size.
 */
import { compatibilityScore } from '../src/dating/astrology';
import { factorScores, overallScore, confidenceFor, unreachableReason, type DXProfile } from '../src/dating/matching';
import { profileCompletion } from '../src/dating/completion';

/**
 * Two shapes coexist in `extras.photos` (dating.service.ts:109-113):
 *   · post-M3  — a private object-storage KEY, ~40 bytes
 *   · pre-M3   — a base64 data URL, the whole image, still there because there
 *                is no migration ("there is no migration and there does not
 *                need to be one", dating.service.ts:225-233)
 * LEGACY_SHARE is the share of profiles still carrying inline photo bytes.
 */
const LEGACY_SHARE = Number(process.env.LEGACY_SHARE ?? 0.10);
const modernPhoto = 'dating/8f2c1e90-0a11-4c7e-9f21-7d3b5c88aa10/1a2b3c4d.jpg';
const legacyPhoto = 'data:image/jpeg;base64,' + 'A'.repeat(120_000);   // ~90KB JPEG inline
const photo = modernPhoto;
const extrasObj = {
  city: 'Bengaluru', state: 'Karnataka', country: 'India',
  personalityTraits: ['Calm', 'Ambitious', 'Creative'], values: ['Family', 'Honesty', 'Loyalty'],
  relationshipGoal: 'Serious dating', diet: 'Vegetarian', smoking: 'Never', drinking: 'Socially',
  fitnessLevel: 'Active', religion: 'Hindu', wantsChildren: 'Yes', dealBreakers: ['Smoking'],
  heightCm: 172, prefAgeMin: 25, prefAgeMax: 34, prefDistanceKm: 100,
  photos: [photo, photo, photo],
  bio: 'x'.repeat(400), languages: ['English', 'Kannada'],
};
const extras = JSON.stringify(extrasObj);
const legacyExtras = JSON.stringify({ ...extrasObj, photos: [legacyPhoto, legacyPhoto, legacyPhoto] });
const meanBytes = (1 - LEGACY_SHARE) * extras.length + LEGACY_SHARE * legacyExtras.length;
console.log(`extras per POST-M3 profile (storage keys): ${(extras.length / 1024).toFixed(1)} KB`);
console.log(`extras per PRE-M3 profile (inline base64):  ${(legacyExtras.length / 1024).toFixed(0)} KB`);
console.log(`assumed legacy share ${(100 * LEGACY_SHARE).toFixed(0)}%  ⇒ mean ${(meanBytes / 1024).toFixed(0)} KB per row  (DTO ceiling is 1,953 KB)`);

const me: DXProfile = { ...extrasObj, photos: undefined } as unknown as DXProfile;
const bdA = new Date(Date.UTC(1994, 4, 12)), bdB = new Date(Date.UTC(1993, 8, 3));
const ints = ['Travel', 'Music', 'Reading'];

const N = 60000;
let t = Date.now(); let sink = 0;
for (let i = 0; i < N; i++) {
  const parsed = JSON.parse(extras) as DXProfile & { photos: string[]; bio: string; languages: string[] };
  const comp = profileCompletion({ ...(parsed as Record<string, unknown>), bio: parsed.bio, interests: ints, photos: parsed.photos, languages: parsed.languages });
  if (comp.percent < 40) continue;
  if (unreachableReason(me, parsed, 31, 32)) continue;
  const { score: astro } = compatibilityScore({ userId: 'a', birthDate: bdA, interests: ints }, { userId: 'b' + i, birthDate: bdB, interests: ints });
  const f = factorScores(astro, ints, ints, me, parsed);
  sink += overallScore(f, confidenceFor(me, parsed, ints, ints));
}
const ms = Date.now() - t;
const per = ms / N;
console.log(`per-candidate CPU on a post-M3 row (parse + completion + filters + score): ${(per * 1000).toFixed(1)} µs   [sink ${sink}]`);
for (const pool of [10_000, 100_000, 500_000, 1_000_000]) {
  const cpuS = (per * pool) / 1000;
  const bytes = pool * meanBytes;
  console.log(`  pool ${pool.toLocaleString('en-IN').padStart(11)}  →  ${cpuS.toFixed(1).padStart(7)} s of single-core CPU per request · ${(bytes / 1e9).toFixed(1).padStart(6)} GB read from Postgres per request`);
}
console.log('  (matches(), discover() and stack() each run this query. Nothing is cached, paginated or city-scoped.)');
