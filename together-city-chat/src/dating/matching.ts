/**
 * Together City AI matching — weighted compatibility over hard-filtered
 * candidates. Astrology-led (50%) with personality, goals, values, lifestyle,
 * interests and location. Returns a per-factor breakdown + a short explanation.
 *
 * H3: three preferences the citizen states — diet, smoking, drinking — were
 * collected by the form and never read here. They now move the lifestyle factor
 * and are named in the explanation, so a stated preference visibly counts
 * instead of silently doing nothing. They do not hide anybody: a preference is
 * not a deal-breaker, and `dealBreakers[]` is the list that removes people.
 *
 * H1/M4: astrology stays at 0.50 — it is what this product is — but the other
 * six factors used to sit on high floors (personality 55, goals 60, lifestyle
 * 65, location 45) and so could barely separate one candidate from another.
 * Two profiles that had answered almost nothing could clear the 75% "curated"
 * bar on favourable star signs alone. The floors are lower now: a blank answer
 * costs score, which is the only way a filled-in profile can be worth filling in.
 */


import { distanceBetween } from '../shared/geo';

export interface DXProfile {
  personalityTraits?: string[]; values?: string[]; relationshipGoal?: string;
  diet?: string; smoking?: string; drinking?: string; fitnessLevel?: string;
  /** What they said they'd prefer in someone else. Empty = "Any", which is not
   *  a preference and must never be scored as one. The form writes these from
   *  the SAME lookup categories as the attributes above and stores the same
   *  labels, so they compare directly — checked, because §15.1 was two
   *  vocabularies that looked like one. */
  prefDiet?: string; prefSmoking?: string; prefDrinking?: string;
  city?: string; state?: string; country?: string;
  prefAgeMin?: number | null; prefAgeMax?: number | null; prefDistanceKm?: number | null;
  dealBreakers?: string[]; wantsChildren?: string;
}

export interface FactorBreakdown {
  astrology: number; personality: number; relationshipGoals: number;
  values: number; lifestyle: number; interests: number; location: number;
}

export const WEIGHTS: Record<keyof FactorBreakdown, number> = {
  astrology: 0.50, personality: 0.15, relationshipGoals: 0.10,
  values: 0.10, lifestyle: 0.05, interests: 0.05, location: 0.05,
};

const lc = (s: string) => s.toLowerCase();
function overlapPct(a: string[] = [], b: string[] = []): number {
  const A = new Set(a.map(lc)), B = new Set(b.map(lc));
  if (!A.size || !B.size) return 0;
  const inter = [...A].filter((x) => B.has(x)).length;
  const uni = new Set([...A, ...B]).size || 1;
  return Math.round((inter / uni) * 100);
}
export function sharedItems(a: string[] = [], b: string[] = []): string[] {
  const B = new Set(b.map(lc));
  return a.filter((x) => B.has(lc(x)));
}

const GOAL_ORDER = ['Friendship First', 'Casual Dating', 'Serious Dating', 'Long-term Relationship', 'Marriage'];
function goalScore(a?: string, b?: string): number {
  // Unanswered is 45, not 60. Two people who have not said what they want are
  // not a better prospect than two who said different things.
  if (!a || !b) return 45;
  const i = GOAL_ORDER.indexOf(a), j = GOAL_ORDER.indexOf(b);
  if (i < 0 || j < 0) return 45;
  return Math.max(15, 100 - Math.abs(i - j) * 25);
}

/** Which stated preference governs which attribute. */
const PREFERRED: [keyof DXProfile, keyof DXProfile][] = [
  ['prefDiet', 'diet'], ['prefSmoking', 'smoking'], ['prefDrinking', 'drinking'],
];

/** Every stated preference on this pair that was met, in the citizen's words. */
export function preferenceNotes(a: DXProfile, b: DXProfile): string[] {
  const out: string[] = [];
  for (const [pref, attr] of PREFERRED) {
    const want = a[pref], got = b[attr];
    if (want && got && want === got) out.push(`${String(got)} — the ${String(attr)} you asked for.`);
  }
  return out;
}

function lifestyleScore(a: DXProfile, b: DXProfile): number {
  let s = 0, n = 0;
  // Alignment: do our own habits look alike.
  const attrs: (keyof DXProfile)[] = ['diet', 'smoking', 'drinking', 'fitnessLevel'];
  for (const k of attrs) { const av = a[k], bv = b[k]; if (av && bv) { n++; s += av === bv ? 100 : 40; } }
  // Preference: is the other person what I said I wanted, and am I what they
  // said they wanted. Both directions — a preference honoured one way is
  // honoured neither way, the same lesson as unreachableReason.
  //
  // A missed preference costs more than mere misalignment (25 vs 40) because
  // somebody actually asked for this, and less than a deal-breaker costs,
  // because they did not put it on that list.
  for (const [pref, attr] of PREFERRED) {
    for (const [me, them] of [[a, b], [b, a]] as [DXProfile, DXProfile][]) {
      const want = me[pref], got = them[attr];
      if (!want || !got) continue;   // "Any" is not a preference
      n++; s += want === got ? 100 : 25;
    }
  }
  return n ? Math.round(s / n) : 45;
}
function personalityScore(a: string[] = [], b: string[] = []): number {
  const A = new Set(a), B = new Set(b);
  const shared = [...A].filter((x) => B.has(x)).length;
  const complement = (A.has('Introvert') && B.has('Extrovert')) || (A.has('Extrovert') && B.has('Introvert')) ? 8 : 0;
  return Math.min(100, 35 + shared * 13 + complement);
}
/**
 * Distance bands, in kilometres.
 *
 * Bands rather than a decay curve, because the score has to survive being
 * turned into a sentence — "you are both in Pune", "you are 1,150 km apart".
 * Shaped to the distances this city actually spans, checked against real pairs
 * rather than round numbers: Mumbai-Pune is 120 km and is a drive people make
 * for lunch; Delhi-Jaipur is 240 and is a weekend; Mumbai-Delhi is 1,150 and is
 * a flight. A first guess at 25/100/300/1000 put all three one band too low.
 */
function bandFor(km: number): number {
  if (km <= 30) return 100;      // the same city, give or take a suburb
  if (km <= 150) return 85;      // an easy day out
  if (km <= 400) return 70;      // a weekend
  if (km <= 1500) return 50;     // a domestic flight
  if (km <= 4000) return 35;
  return 25;
}

/**
 * How close they are, measured where we can measure it.
 *
 * This was exact city-string equality, which is why M7 recorded that
 * "Bengaluru" and "Bangalore" were strangers to each other and prefDistanceKm
 * could not be honoured at all. The coordinate table in shared/geo.ts resolves
 * both spellings to one point, so the aliasing fixes itself.
 *
 * When either person cannot be placed, this falls back to exactly what it did
 * before — same city, same state, neither — and prefDistanceKm is left out of
 * the calculation rather than applied to a distance nobody measured. The table
 * is ~140 cities; everyone outside it keeps the old behaviour, which is a
 * stated bound rather than a silent one.
 */
function locationScore(a: DXProfile, b: DXProfile): number {
  const km = distanceBetween(a, b);
  if (km === null) {
    if (a.city && b.city && lc(a.city) === lc(b.city)) return 100;
    if (a.state && b.state && lc(a.state) === lc(b.state)) return 70;
    // Two people with no location in common share no location.
    return 30;
  }
  const base = bandFor(km);
  // A stated distance preference, honoured in both directions — the same rule
  // as every other preference here. Beyond what somebody asked for costs them,
  // and it costs the same whether they are 10 km over or 10,000: they said no.
  const limits = [a.prefDistanceKm, b.prefDistanceKm].filter((n): n is number => typeof n === 'number' && n > 0);
  const beyond = limits.some((limit) => km > limit);
  return beyond ? Math.min(base, 30) : base;
}

/** The distance, in the words a card can print, or null when unmeasured. */
export function distanceNote(a: DXProfile, b: DXProfile): string | null {
  const km = distanceBetween(a, b);
  if (km === null) return null;
  if (km <= 30) return 'In your city.';
  if (km <= 150) return `About ${km} km away — an easy day out.`;
  return `About ${km.toLocaleString('en-IN')} km away.`;
}
export function factorScores(astrology: number, aInterests: string[], bInterests: string[], aD: DXProfile, bD: DXProfile): FactorBreakdown {
  return {
    astrology: Math.round(astrology),
    personality: personalityScore(aD.personalityTraits, bD.personalityTraits),
    relationshipGoals: goalScore(aD.relationshipGoal, bD.relationshipGoal),
    // Floor low, reach the whole way to 100. The old 40 + 0.6x and 30 + 0.7x
    // could not reward a real overlap OR punish none of it — every pair landed
    // in the same narrow band, which is how astrology came to decide the order
    // on its own.
    values: Math.min(100, 20 + overlapPct(aD.values, bD.values)),
    lifestyle: lifestyleScore(aD, bD),
    interests: Math.min(100, 15 + overlapPct(aInterests, bInterests)),
    location: locationScore(aD, bD),
  };
}

export function overallScore(f: FactorBreakdown): number {
  let sum = 0;
  (Object.keys(WEIGHTS) as (keyof FactorBreakdown)[]).forEach((k) => { sum += f[k] * WEIGHTS[k]; });
  return Math.round(sum);
}

/** Hard filters. Returns a rejection reason, or null if the candidate passes. */
export function hardFilterReason(myD: DXProfile, theirD: DXProfile, theirAge: number): string | null {
  if (myD.prefAgeMin && theirAge < myD.prefAgeMin) return 'age';
  if (myD.prefAgeMax && theirAge > myD.prefAgeMax) return 'age';
  const db = myD.dealBreakers ?? [];
  if (db.includes('Smoking') && theirD.smoking === 'Regularly') return 'smoking';
  if (db.includes('Drinking') && theirD.drinking === 'Regularly') return 'drinking';
  if (db.includes('Wants Children') && myD.wantsChildren && theirD.wantsChildren && myD.wantsChildren !== theirD.wantsChildren) return 'children';
  return null;
}

/**
 * Whether these two can reach each other AT ALL — both sides' filters, not just
 * the viewer's.
 *
 * `hardFilterReason` answers "does this candidate pass MY filters", and three of
 * the four places that listed candidates asked only that. So you were shown, and
 * could like, people whose own age range or deal-breakers excluded you. They got
 * "You have a new like 💛", went looking, and you were not in their matches —
 * because their own filters had removed you. Neither of you could see why.
 *
 * `reindexAfterChange()` has always checked both directions, so the live-match
 * notifier and the list disagreed about who was even a candidate. This resolves
 * that towards the stricter answer: a filter somebody set is a decision they
 * made, and honouring it in one direction only honours it in neither.
 *
 * `by` says whose filter closed the door. Both are hidden today — surfacing
 * "outside the range THEY set" would leak a stranger's settings — but the two
 * are not the same fact, and a caller that wants to explain your own filter back
 * to you should not have to work it out a second time.
 */
export function unreachableReason(
  myD: DXProfile, theirD: DXProfile, myAge: number, theirAge: number,
): { by: 'you' | 'them'; reason: string } | null {
  const mine = hardFilterReason(myD, theirD, theirAge);
  if (mine) return { by: 'you', reason: mine };
  const theirs = hardFilterReason(theirD, myD, myAge);
  if (theirs) return { by: 'them', reason: theirs };
  return null;
}

/** Short, human explanation of why this is a good match. */
export function explain(
  f: FactorBreakdown, sharedInterests: string[], prefsMet: string[] = [], distance: string | null = null,
): string[] {
  const r: string[] = [];
  // A preference the citizen stated, named first when it was met. Anything
  // collected has to visibly change the answer, or it should not be collected.
  for (const p of prefsMet) r.push(p);
  // Where they are, when we could work it out. Omitted rather than hedged when
  // we could not — "distance unknown" is noise on a card.
  if (distance) r.push(distance);
  // Where they are, when we could work it out. Omitted rather than hedged when
  // we could not — "distance unknown" is noise on a card.
  if (f.astrology >= 85) r.push('Excellent astrological compatibility.');
  else if (f.astrology >= 70) r.push('Strong astrological alignment.');
  if (f.relationshipGoals >= 85) r.push('Similar relationship goals.');
  if (f.values >= 70) r.push('Strong shared values.');
  if (f.personality >= 72) r.push('Complementary personalities.');
  if (f.lifestyle >= 80) r.push('Well-matched lifestyles.');
  if (sharedInterests.length) r.push(`Shared interests in ${sharedInterests.slice(0, 3).join(' and ')}.`);
  return r.slice(0, 5);
}
