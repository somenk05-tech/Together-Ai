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
 * L2: the height preference was a free-text box nothing could read. It is a
 * min/max range now, and by owner decision it is a HARD filter alongside the
 * age range rather than a scoring nudge — see `heightFilterReason`, which is
 * also where to undo that if the pool cost turns out to bite.
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
  /** Their own height, and the range they asked for in somebody else. Both in
   *  centimetres. The height read here is the same number the card displays, so
   *  a candidate is filtered on exactly the figure they are shown by. */
  heightCm?: number | null;
  prefHeightMinCm?: number | null; prefHeightMaxCm?: number | null;
  dealBreakers?: string[]; wantsChildren?: string;
  /** Collected since the first version of this form and, until now, read by
   *  nothing at all (L1). It is a deal-breaker when the citizen says so and
   *  nothing when they do not — the same rule as every other chip. */
  religion?: string;
}

export interface FactorBreakdown {
  astrology: number; personality: number; relationshipGoals: number;
  values: number; lifestyle: number; interests: number; location: number;
}

/**
 * H1 — the weights, and what follows from leaving them alone.
 *
 * OWNER DECISION, 23 Aug: astrology stays at 0.50. The audit measured it at
 * r = 0.92 with the final score, which is another way of saying astrology IS
 * the sort order and the other six factors decorate it. That cost is accepted
 * and recorded here, rather than re-argued by whoever reads this next.
 *
 * What follows from the decision is the rest of this file. At 0.15 a mismatched
 * intent can be out-scored by a good chart and the damage is a bad ranking; at
 * 0.50 it is out-scored nearly always, so the only thing standing between a
 * citizen and somebody whose star sign flatters the arithmetic is a filter that
 * REMOVES people. That is why every chip the form offers is implemented in
 * `hardFilterReason` below — and why two of them silently doing nothing was a
 * worse bug here than the same bug would have been in a balanced model.
 *
 * The retune the audit suggested is kept whole, behind an env var. Setting
 * DATING_WEIGHTS=retuned is the entire change; nothing else reads the flag, and
 * `confidence()` below is deliberately independent of which table is in use.
 */
export const ASTROLOGY_LED_WEIGHTS: Record<keyof FactorBreakdown, number> = {
  astrology: 0.50, personality: 0.15, relationshipGoals: 0.10,
  values: 0.10, lifestyle: 0.05, interests: 0.05, location: 0.05,
};
export const RETUNED_WEIGHTS: Record<keyof FactorBreakdown, number> = {
  relationshipGoals: 0.22, values: 0.18, lifestyle: 0.15,
  personality: 0.15, astrology: 0.15, interests: 0.10, location: 0.05,
};
export const WEIGHTS: Record<keyof FactorBreakdown, number> =
  process.env.DATING_WEIGHTS === 'retuned' ? RETUNED_WEIGHTS : ASTROLOGY_LED_WEIGHTS;

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

export const GOAL_ORDER = ['Friendship First', 'Casual Dating', 'Serious Dating', 'Long-term Relationship', 'Marriage'];

/**
 * The line the "Marriage Intentions" deal-breaker draws.
 *
 * Not a distance along GOAL_ORDER — a side. Serious Dating and Marriage are two
 * steps apart and belong together; Casual Dating and Serious Dating are one step
 * apart and do not. Somebody looking for a spouse and somebody looking for a
 * fortnight are not a near miss that a good chart should be able to close.
 */
const COMMITTED_FROM = 2; // index of 'Serious Dating'
function committed(goal?: string): boolean | null {
  if (!goal) return null;
  const i = GOAL_ORDER.indexOf(goal);
  return i < 0 ? null : i >= COMMITTED_FROM;
}
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

export function overallScore(f: FactorBreakdown, confidenceFactor = 1): number {
  let sum = 0;
  (Object.keys(WEIGHTS) as (keyof FactorBreakdown)[]).forEach((k) => { sum += f[k] * WEIGHTS[k]; });
  return Math.round(sum * confidenceFactor);
}

/**
 * M4 — how much of this score is an answer, and how much is arithmetic.
 *
 * The floors came down in H1/M4 so that a blank answer costs score. It was not
 * enough. Astrology carries half the weight and is computed from a birth date
 * everybody gives at sign-up, so two profiles that have answered NOTHING ELSE
 * still arrive with 50% of the model filled in for them by the calendar. On
 * favourable signs that reached the 75% "curated" bar — the audit's M4 — and the
 * number on the card said "87% compatible" when the honest sentence was "we know
 * almost nothing about either of you".
 *
 * So the score is multiplied by how much of the model was actually answered.
 * A factor counts as answered when BOTH people supplied something it can read;
 * `coverage` is the share of the weight that reaches, and `confidence` turns it
 * into a multiplier that never falls below 0.775 — a penalty, not a demolition.
 *
 * Worked, on today's weights: two entirely blank profiles with a 99 astrology
 * score make 66 raw and 51 shown. The same pair could reach 77 before. Nothing
 * moves for a pair who have both filled the form in: coverage 1.0 is ×1.0.
 *
 * Deliberately independent of the weight table, so the flag in `WEIGHTS` above
 * cannot change what "answered" means.
 */
export function coverage(aD: DXProfile, bD: DXProfile, aInterests: string[] = [], bInterests: string[] = []): number {
  const some = (v?: string[] | null) => Array.isArray(v) && v.length > 0;
  const lifestyleKeys: (keyof DXProfile)[] = ['diet', 'smoking', 'drinking', 'fitnessLevel'];
  const answered: Record<keyof FactorBreakdown, boolean> = {
    astrology: true, // the birth date is mandatory at sign-up; this is always known
    personality: some(aD.personalityTraits) && some(bD.personalityTraits),
    relationshipGoals: !!aD.relationshipGoal && !!bD.relationshipGoal,
    values: some(aD.values) && some(bD.values),
    lifestyle: lifestyleKeys.some((k) => !!aD[k]) && lifestyleKeys.some((k) => !!bD[k]),
    interests: some(aInterests) && some(bInterests),
    location: distanceBetween(aD, bD) !== null || (!!aD.city && !!bD.city),
  };
  let reached = 0, total = 0;
  (Object.keys(WEIGHTS) as (keyof FactorBreakdown)[]).forEach((k) => {
    total += WEIGHTS[k];
    if (answered[k]) reached += WEIGHTS[k];
  });
  return total ? reached / total : 1;
}

export function confidence(cov: number): number {
  return 0.55 + 0.45 * Math.max(0, Math.min(1, cov));
}

/**
 * Both at once, and the one place the multiplier can be switched off.
 *
 * MEASURED COST, 23 Aug (`sim/stress-100k.ts`, 100,000 profiles): the multiplier
 * takes the partially-complete cohort — 27% of the city — from 0.43% of their
 * candidates clearing the 75% curated bar to **0.00%**, and from 87.8% empty
 * decks to **100%**. It does not cause that problem; a bar of 75 on an
 * astrology-inflated score already left seven of eight of them with nothing.
 * What it does is close the last of the door, and "rarely" and "never" are
 * different products.
 *
 * So it is reversible in one env var, exactly like the weight table above:
 * DATING_CONFIDENCE=off restores the previous arithmetic everywhere at once,
 * because every caller in the service asks this function and not `confidence`.
 *
 * The real fix is not this switch. It is that a fixed 75 cannot mean the same
 * thing to a complete profile and a half-finished one — the curated bar wants to
 * be a percentile of the viewer's own candidate distribution. Until that lands,
 * shipping this multiplier means deciding that a half-finished profile should
 * see nothing, and that should be a decision somebody makes rather than one that
 * arrives as arithmetic.
 */
export function confidenceFor(aD: DXProfile, bD: DXProfile, aInterests: string[] = [], bInterests: string[] = []): number {
  if (process.env.DATING_CONFIDENCE === 'off') return 1;
  return confidence(coverage(aD, bD, aInterests, bInterests));
}

/**
 * The sentence the card was missing.
 *
 * Every match already arrives with reasons to like it. None of them arrived
 * with a reason to be careful, and a screen that only ever agrees with itself
 * reads as a sales pitch rather than an assessment. `explain` says what fits;
 * this says what does not, in the same voice, from the same numbers — the
 * lowest-scoring factors that are low enough to be worth a sentence, plus the
 * two differences a person would rather hear now than on the evening.
 *
 * Returns at most two. A card with a friction is honest; a card with five is
 * an argument against the match, and if the match were that bad the filters
 * should have removed it.
 */
export function frictions(f: FactorBreakdown, aD: DXProfile, bD: DXProfile): string[] {
  const out: string[] = [];
  const goalGap = aD.relationshipGoal && bD.relationshipGoal && aD.relationshipGoal !== bD.relationshipGoal;
  if (goalGap) out.push(`You said ${aD.relationshipGoal}; they said ${bD.relationshipGoal}.`);
  if (aD.wantsChildren && bD.wantsChildren && aD.wantsChildren !== bD.wantsChildren) {
    out.push(`Different answers on children — ${aD.wantsChildren} and ${bD.wantsChildren}.`);
  }
  if (f.location <= 50) out.push('You are a long way apart.');
  if (f.lifestyle < 50) out.push('Your day-to-day habits look quite different.');
  if (f.values < 45) out.push('Not much overlap in what you each said you value.');
  if (f.personality < 45) out.push('Very different temperaments.');
  return out.slice(0, 2);
}

/** A number that can be a height or a bound, or undefined. Zero, negatives,
 *  NaN and nonsense outside human range are all "not stated". */
function cm(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) && v >= 100 && v <= 250 ? v : undefined;
}

/**
 * Whether a stated height range excludes this candidate.
 *
 * OWNER DECISION, 1 Aug (L2): a height range HIDES people, the way
 * `prefAgeMin`/`prefAgeMax` do — not scores them lower, the way a distance
 * limit does. The two numeric ranges on the form now behave alike, which is the
 * argument that decided it: a range somebody typed reads as a boundary.
 *
 * It costs pool size, and that cost is real and one-sided — neither person is
 * told a filter removed them, because saying so would leak a stranger's
 * settings. Reversible in one place: move this call out of `hardFilterReason`
 * and into `locationScore`'s style of penalty and it becomes a soft preference.
 *
 * Three things it will not do.
 *
 * It will not filter on a height nobody recorded. `undefined` is not "too
 * short". Excluding somebody over a field we never collected would quietly
 * empty the pool of every incomplete profile and tell neither side why — the
 * same reasoning that keeps `prefDistanceKm` off a distance nobody measured.
 *
 * It will not honour a nonsense range. `min > max` excludes everybody, which
 * cannot be what somebody meant; ignored, exactly as `locationScore` ignores a
 * non-positive distance limit rather than blocking the world.
 *
 * It will not read the legacy free-text `prefHeight`. That box was never
 * reliably parseable — that is what L2 recorded — and a guess about what
 * somebody typed must not be the thing that hides a stranger.
 *
 * OWNER DECISION, 2 AUG: THE FORM NO LONGER ASKS, AND THIS STILL FILTERS.
 *
 * The preferred-height section came off the dating form. Asked whether this
 * filter should come off with it, the answer was no. So every range already
 * saved keeps hiding people, and the citizen who set it has no screen left to
 * see it on or remove it — nor is the person it removes told, because saying so
 * would leak a stranger's settings.
 *
 * That is a one-way door and it is recorded as one rather than left to be
 * discovered. F.33 priced what is behind it: a typical range (165–185cm)
 * removes about 34.6% of the city for the viewer holding it, and height alone
 * accounts for 7.9% of all directed pairs that cannot reach each other.
 *
 * Undoing it is still one line — drop this call from `hardFilterReason` — and
 * that is the whole of what "reversible in one place" was for.
 */
export function heightFilterReason(myD: DXProfile, theirD: DXProfile): 'height' | null {
  const min = cm(myD.prefHeightMinCm), max = cm(myD.prefHeightMaxCm);
  if (min === undefined && max === undefined) return null;
  if (min !== undefined && max !== undefined && min > max) return null;
  const theirs = cm(theirD.heightCm);
  if (theirs === undefined) return null;
  if (min !== undefined && theirs < min) return 'height';
  if (max !== undefined && theirs > max) return 'height';
  return null;
}

/**
 * Every deal-breaker the form offers, and nothing it does not.
 *
 * THE BUG THIS CLOSES. The chip list on the profile form has read
 * `['Smoking', 'Drinking', 'Marriage Intentions', 'Wants Children', 'Distance']`
 * for as long as it has existed. Three of those five were implemented here.
 * **A citizen who ticked "Marriage Intentions" or "Distance" was told, by a
 * control that lit up and saved, that they had set a non-negotiable — and the
 * engine never read it.** That is H3's shape exactly, on the one list in the
 * product whose entire job is to remove people, and it survived H3 because H3
 * went looking at `prefDiet`/`prefSmoking`/`prefDrinking` and this list is a
 * different field.
 *
 * Two more are added, because both were already collected and neither was read:
 * `Diet` (the strict-vegetarian case the audit measured crossing 75% 29.8% of
 * the time) and `Religion` (L1 — collected since the first version of the form,
 * read by nothing).
 *
 * THREE RULES, THE SAME THREE EVERYWHERE IN THIS FILE.
 *
 * · A chip that is not ticked filters nobody. Absence is "no preference", never
 *   "exclude" — which is what keeps a hard filter from quietly emptying the pool
 *   of everyone who has not finished their profile.
 * · A field neither side filled in filters nobody. We do not exclude a stranger
 *   over an answer we never asked them for, the same reasoning that keeps
 *   `prefDistanceKm` off a distance nobody measured and `heightFilterReason`
 *   off a height nobody recorded.
 * · A filter is a decision, and no score overrides it. At astrology 0.50 that
 *   is the whole of the protection: an intent mismatch cannot be out-scored by
 *   a chart, because it is not scored at all.
 *
 * Both directions are `unreachableReason`'s job, not this one's.
 */
export function hardFilterReason(myD: DXProfile, theirD: DXProfile, theirAge: number): string | null {
  if (myD.prefAgeMin && theirAge < myD.prefAgeMin) return 'age';
  if (myD.prefAgeMax && theirAge > myD.prefAgeMax) return 'age';
  const height = heightFilterReason(myD, theirD);
  if (height) return height;

  const db = myD.dealBreakers ?? [];
  if (db.includes('Smoking') && theirD.smoking === 'Regularly') return 'smoking';
  if (db.includes('Drinking') && theirD.drinking === 'Regularly') return 'drinking';
  if (db.includes('Wants Children') && myD.wantsChildren && theirD.wantsChildren && myD.wantsChildren !== theirD.wantsChildren) return 'children';

  // Marriage Intentions — a side of the line, not a distance along it.
  if (db.includes('Marriage Intentions')) {
    const mine = committed(myD.relationshipGoal), theirs = committed(theirD.relationshipGoal);
    if (mine !== null && theirs !== null && mine !== theirs) return 'intent';
  }

  // Distance — the limit they already stated, now honoured as the boundary they
  // wrote it as. Unmeasurable distance filters nobody: `distanceBetween` returns
  // null outside the coordinate table, and a filter must not fire on a guess.
  if (db.includes('Distance') && typeof myD.prefDistanceKm === 'number' && myD.prefDistanceKm > 0) {
    const km = distanceBetween(myD, theirD);
    if (km !== null && km > myD.prefDistanceKm) return 'distance';
  }

  // Diet — only against a preference they actually stated. "Any" is not a
  // preference and must never be scored, or filtered, as one.
  if (db.includes('Diet') && myD.prefDiet && theirD.diet && myD.prefDiet !== theirD.diet) return 'diet';

  // Religion — same shape. Collected for a year, read for the first time here.
  if (db.includes('Religion') && myD.religion && theirD.religion && myD.religion !== theirD.religion) return 'religion';

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


/**
 * WHY A MATCH APPEARED — because "just joined" was not true most of the time.
 *
 * reindexAfterChange runs on EVERY profile save, and when a pair crosses the
 * threshold it sent: "A newly compatible member just joined your matches in the
 * Dating Hub." Saving a profile is overwhelmingly an existing member editing
 * theirs — a new photo, a corrected height, a changed preference — so the app
 * announced an arrival that had not happened. Somebody who reads that and goes
 * looking for the new arrival finds a person who has been in the city for weeks.
 *
 * Two things are actually known at that moment, and only two:
 *
 *  · there was no cached score for this pair (`prev == null`) — the two have
 *    never been scored together, because one is new to the pool, or a hard
 *    filter used to rule them out, or nothing had computed it yet. "New to your
 *    matches" is true of all three; "just joined" is true of only one.
 *  · there WAS a score and it was below the line — an existing member changed
 *    something and the pair now clears it.
 *
 * Nothing here guesses which of the first three it was, because the app cannot
 * tell and does not need to: the citizen's question is "why is this person on my
 * screen", and both answers below answer it.
 */
export type MatchAlertReason = 'new-to-you' | 'they-changed';

export function matchAlertReason(prev: number | null | undefined): MatchAlertReason {
  return prev == null ? 'new-to-you' : 'they-changed';
}

export function matchAlertBody(reason: MatchAlertReason): string {
  return reason === 'new-to-you'
    ? 'They’re new to your matches.'
    : 'They updated their profile, and the two of you are a match now.';
}
