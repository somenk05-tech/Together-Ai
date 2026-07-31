/**
 * Together City AI matching — weighted compatibility over hard-filtered
 * candidates. Astrology-led (50%) with personality, goals, values, lifestyle,
 * interests and location. Returns a per-factor breakdown + a short explanation.
 */

export interface DXProfile {
  personalityTraits?: string[]; values?: string[]; relationshipGoal?: string;
  diet?: string; smoking?: string; drinking?: string; fitnessLevel?: string;
  city?: string; state?: string;
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
  if (!a || !b) return 60;
  const i = GOAL_ORDER.indexOf(a), j = GOAL_ORDER.indexOf(b);
  if (i < 0 || j < 0) return 60;
  return Math.max(20, 100 - Math.abs(i - j) * 22);
}
function lifestyleScore(a: DXProfile, b: DXProfile): number {
  const attrs: (keyof DXProfile)[] = ['diet', 'smoking', 'drinking', 'fitnessLevel'];
  let s = 0, n = 0;
  for (const k of attrs) { const av = a[k], bv = b[k]; if (av && bv) { n++; s += av === bv ? 100 : 55; } }
  return n ? Math.round(s / n) : 65;
}
function personalityScore(a: string[] = [], b: string[] = []): number {
  const A = new Set(a), B = new Set(b);
  const shared = [...A].filter((x) => B.has(x)).length;
  const complement = (A.has('Introvert') && B.has('Extrovert')) || (A.has('Extrovert') && B.has('Introvert')) ? 8 : 0;
  return Math.min(100, 55 + shared * 10 + complement);
}
function locationScore(a: DXProfile, b: DXProfile): number {
  if (a.city && b.city && lc(a.city) === lc(b.city)) return 100;
  if (a.state && b.state && lc(a.state) === lc(b.state)) return 70;
  return 45;
}

export function factorScores(astrology: number, aInterests: string[], bInterests: string[], aD: DXProfile, bD: DXProfile): FactorBreakdown {
  return {
    astrology: Math.round(astrology),
    personality: personalityScore(aD.personalityTraits, bD.personalityTraits),
    relationshipGoals: goalScore(aD.relationshipGoal, bD.relationshipGoal),
    values: 40 + Math.round(0.6 * overlapPct(aD.values, bD.values)),
    lifestyle: lifestyleScore(aD, bD),
    interests: 30 + Math.round(0.7 * overlapPct(aInterests, bInterests)),
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
export function explain(f: FactorBreakdown, sharedInterests: string[]): string[] {
  const r: string[] = [];
  if (f.astrology >= 85) r.push('Excellent astrological compatibility.');
  else if (f.astrology >= 70) r.push('Strong astrological alignment.');
  if (f.relationshipGoals >= 85) r.push('Similar relationship goals.');
  if (f.values >= 70) r.push('Strong shared values.');
  if (f.personality >= 72) r.push('Complementary personalities.');
  if (f.lifestyle >= 80) r.push('Well-matched lifestyles.');
  if (sharedInterests.length) r.push(`Shared interests in ${sharedInterests.slice(0, 3).join(' and ')}.`);
  return r.slice(0, 5);
}
