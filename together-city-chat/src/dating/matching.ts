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
 * H1/M4 (as first fixed, when astrology held 0.50): the other six factors
 * used to sit on high floors (personality 55, goals 60, lifestyle 65,
 * location 45) and so could barely separate one candidate from another.
 * Two profiles that had answered almost nothing could clear the 75% "curated"
 * bar on favourable star signs alone. The floors are lower now: a blank answer
 * costs score, which is the only way a filled-in profile can be worth filling in.
 */


import { cityCoords, haversineKm, type Coords } from '../shared/geo';

export interface DXProfile {
  /**
   * Who they seek, said precisely (P3, 26 Aug). The `seeking` COLUMN stays
   * the coarse value SQL can narrow on — a single gender, or 'any' — and
   * this optional list refines it in JS: ['male','female'] is bisexual said
   * exactly, without pretending 'any' means it. Absent = the column speaks.
   */
  seekingList?: string[];
  /** The name they chose to be seen under — read only through shownName(),
   *  which tidies it and falls back to the account name. On the interface so
   *  every parsed-extras intersection carries it (and so the weak-type check
   *  lets those intersections reach shownName at all). */
  firstName?: string;
  personalityTraits?: string[]; values?: string[]; relationshipGoal?: string;
  /**
   * The lenses they chose to appear under — 'dating', 'intentional',
   * 'marriage', any combination (owner, 1 Sep). ABSENT IS NOT EMPTY: absent
   * means they have never been asked, and `intentsOf` reads their stated
   * `relationshipGoal` instead, so every profile written before this existed
   * keeps a place. An empty ARRAY is a citizen who unticked everything, and
   * `intentsOf` returns nothing for them, which is what they asked for.
   */
  openTo?: string[];
  diet?: string; smoking?: string; drinking?: string; fitnessLevel?: string;
  /** What they said they'd prefer in someone else. Empty = "Any", which is not
   *  a preference and must never be scored as one. The form writes these from
   *  the SAME lookup categories as the attributes above and stores the same
   *  labels, so they compare directly — checked, because §15.1 was two
   *  vocabularies that looked like one. */
  prefDiet?: string; prefSmoking?: string; prefDrinking?: string;
  city?: string; state?: string; country?: string;
  prefAgeMin?: number | null; prefAgeMax?: number | null; prefDistanceKm?: number | null;
  /**
   * WHERE THE DISTANCE IS MEASURED FROM (owner, 27 Aug). Two settings and no
   * third: 'any' is Anywhere, where distance still orders the deck but never
   * excludes anybody; anything else is the citizen's current location, which is
   * the default. `searchLat/Lng` is the point their browser gave us when they
   * asked for that — absent, the city on their profile stands in, which is
   * exactly what this file measured before there was a mode at all.
   */
  partnerLocationMode?: 'any' | 'around';
  searchLat?: number | null; searchLng?: number | null;
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
  /** Languages the citizen speaks. Collected by the form since the beginning,
   *  weighted 4 points by `completion.ts`, echoed onto every card — and, until
   *  the 1M global run, read by no scoring or filtering code at all. Two people
   *  with no language in common reached 92%. See `languageBarrier`. */
  languages?: string[];
}

export interface FactorBreakdown {
  astrology: number; personality: number; relationshipGoals: number;
  values: number; lifestyle: number; interests: number; location: number;
}

/**
 * H1 — the weights, and what follows from leaving them alone.
 *
 * OWNER DECISION, 23 Aug: astrology stays at 0.50.
 * OWNER DECISION, 26 Aug: astrology goes to 0.90, the other six factors share
 * the remaining 0.10.
 *
 * WHAT 0.90 MEANS, WRITTEN DOWN SO NOBODY HAS TO REDISCOVER IT. The astrology
 * term is `AFFINITY[elemA][elemB]`, a 4x4 matrix with seven distinct values,
 * plus an interest bonus capped at 8 and a deterministic per-pair hash of 0-8.
 * At 0.90 the displayed percentage is that expression and almost nothing else:
 * the 1M global run measured astrology at r = 0.68 with the final score when it
 * held 0.50, and above 0.85 the correlation is effectively 1. The number on the
 * card is an ASTROLOGICAL READING, and the surfaces that print it say so.
 *
 * What follows from the decision is the rest of this file. At 0.15 a mismatched
 * intent can be out-scored by a good chart and the damage is a bad ranking; at
 * 0.90 it is out-scored always and by everything, so the ONLY thing standing
 * between a citizen and somebody whose star sign flatters the arithmetic is a
 * filter that REMOVES people. That is why every chip the form offers is
 * implemented in `hardFilterReason` below, why the three fundamental questions
 * now filter for everybody who has answered them, why a shared language is a
 * filter and not a score, and why two chips silently doing nothing was a far
 * worse bug here than the same bug would have been in a balanced model.
 *
 * The remaining 0.10 is split so that the factor a citizen is most likely to be
 * hurt by — what each of them is looking for — keeps the largest share of it.
 *
 * Two alternative tables are kept whole behind one env var, so reversing is a
 * deploy setting rather than a rewrite:
 *   DATING_WEIGHTS=retuned           the audit's balanced table (astrology 0.15)
 *   DATING_WEIGHTS=astro-personality astrology 0.75 + personality 0.15 = 0.90
 * `confidence()` below is deliberately independent of which table is in use —
 * see the note there, which is what stops a 0.90 weight from silently switching
 * the confidence penalty off.
 */
export const ASTROLOGY_LED_WEIGHTS: Record<keyof FactorBreakdown, number> = {
  astrology: 0.90, relationshipGoals: 0.04, values: 0.02,
  personality: 0.015, lifestyle: 0.01, interests: 0.01, location: 0.005,
};
/** astrology + personality together at 0.90, if that is the reading intended. */
export const ASTRO_PERSONALITY_WEIGHTS: Record<keyof FactorBreakdown, number> = {
  astrology: 0.75, personality: 0.15, relationshipGoals: 0.04,
  values: 0.02, lifestyle: 0.02, interests: 0.01, location: 0.01,
};
export const RETUNED_WEIGHTS: Record<keyof FactorBreakdown, number> = {
  relationshipGoals: 0.22, values: 0.18, lifestyle: 0.15,
  personality: 0.15, astrology: 0.15, interests: 0.10, location: 0.05,
};
export const WEIGHTS: Record<keyof FactorBreakdown, number> =
  process.env.DATING_WEIGHTS === 'retuned' ? RETUNED_WEIGHTS
    : process.env.DATING_WEIGHTS === 'astro-personality' ? ASTRO_PERSONALITY_WEIGHTS
      : ASTROLOGY_LED_WEIGHTS;

/** Every table must sum to 1. A weight table that does not is a silent rescale. */
for (const [name, table] of Object.entries({ ASTROLOGY_LED_WEIGHTS, ASTRO_PERSONALITY_WEIGHTS, RETUNED_WEIGHTS })) {
  const sum = Object.values(table).reduce((a, b) => a + b, 0);
  if (Math.abs(sum - 1) > 1e-9) throw new Error(`dating weights ${name} sum to ${sum}, not 1`);
}

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
 * THE BUG THIS CLOSES, AND IT IS THE LARGEST ONE THE 1M RUN FOUND.
 *
 * `lookup.data.ts` seeds the dropdown the citizen actually uses:
 *
 *   ['Marriage', 'Long-term relationship', 'Serious dating',
 *    'Casual dating', 'Friendship first', 'Still figuring it out']
 *
 * `GOAL_ORDER` above is what this file could parse. **One of the six matched.**
 * `DatingProfile.tsx` writes `o.label` straight from the lookup, nothing
 * normalises it, and the Title-Case spellings existed in exactly two places:
 * this file and its own unit tests. The tests passed against a vocabulary
 * production had never sent.
 *
 * Measured consequences, enumerated over all 36 ordered pairs of served labels:
 *   · `goalScore` returned 45 — the unanswered value — in 35 of 36;
 *   · `committed()` returned true for 'Marriage' and null for the other five,
 *     never false, so the "Marriage Intentions" condition was unsatisfiable and
 *     **the deal-breaker could not fire at all**;
 *   · `coverage()` still counted the field as answered, so no confidence
 *     penalty applied to a goal the engine could not read.
 *
 * Normalising HERE rather than editing the lookup is deliberate: the seed uses
 * `createMany({ skipDuplicates: true })` over a lower-cased code, so relabelling
 * the seed would leave every existing row exactly as it is. This reads whatever
 * is already in the database.
 *
 * 'Still figuring it out' has no place on the ladder and is not forced onto one.
 * It normalises to `null` — an honest "not stated" — which is what it is.
 */
const GOAL_ALIASES = new Map<string, string>();
for (const g of GOAL_ORDER) GOAL_ALIASES.set(g.toLowerCase().replace(/[^a-z]/g, ''), g);
GOAL_ALIASES.set('longterm', 'Long-term Relationship');
GOAL_ALIASES.set('longtermrelationship', 'Long-term Relationship');
GOAL_ALIASES.set('friendship', 'Friendship First');
GOAL_ALIASES.set('friendshipfirst', 'Friendship First');
/** Deliberately absent: 'stillfiguringitout' — see above. */

export function canonicalGoal(goal?: string | null): string | null {
  if (!goal) return null;
  return GOAL_ALIASES.get(goal.toLowerCase().replace(/[^a-z]/g, '')) ?? null;
}

/**
 * ── THE THREE LENSES (owner, 1 Sep) ───────────────────────────────────────
 *
 * "Apart from dating, add dating with intention and marriage." Three ways to
 * look at ONE pool — not three pools. The likes, the daily allowance and the
 * chats stay shared; what changes is who a list is willing to show you.
 *
 * They are not a new vocabulary. Every profile has been picking a
 * `relationshipGoal` from six labels since the hub opened, and GOAL_ORDER
 * above is the ladder those labels sit on. A lens is a RUNG RANGE on that
 * ladder, which is why nobody has to be asked anything for this to work:
 * a profile that said 'Marriage' is already in the marriage lens.
 *
 * `Still figuring it out` normalises to null and therefore belongs to no
 * lens. That is the honest answer rather than a gap: a lens is a heading
 * that says what someone is here for, and they have said they do not know.
 * It does not hide them — the unfiltered list is unchanged, and that is the
 * list they are on today.
 */
export const INTENTS = ['dating', 'intentional', 'marriage'] as const;
export type Intent = (typeof INTENTS)[number];

/** What a citizen is shown, in their own words. */
export const INTENT_LABELS: Record<Intent, string> = {
  dating: 'Dating',
  intentional: 'Dating with intention',
  marriage: 'Marriage',
};

/** Which rungs of GOAL_ORDER each lens covers. Exhaustive over the ladder. */
const INTENT_GOALS: Record<Intent, readonly string[]> = {
  dating: ['Friendship First', 'Casual Dating'],
  intentional: ['Serious Dating', 'Long-term Relationship'],
  marriage: ['Marriage'],
};

export function isIntent(v: unknown): v is Intent {
  return typeof v === 'string' && (INTENTS as readonly string[]).includes(v);
}

/** The one lens a stated goal sits in, or null when the goal says nothing. */
export function intentOfGoal(goal?: string | null): Intent | null {
  const g = canonicalGoal(goal);
  if (!g) return null;
  for (const i of INTENTS) if (INTENT_GOALS[i].includes(g)) return i;
  /* Unreachable while INTENT_GOALS covers GOAL_ORDER, which
     `every-rung-has-a-lens` pins. Null rather than a guess if a rung is ever
     added without one: an unclassified goal must not silently become 'dating'. */
  return null;
}

/**
 * The lenses this profile appears under.
 *
 * A citizen may be open to any combination (owner, 1 Sep) — looking for
 * marriage and willing to date is a real answer, and the old single dropdown
 * could not say it. `openTo` is that answer once they give it. Until they do,
 * their stated goal answers for them, which is why no existing profile has to
 * be asked anything and none of them leaves the hub.
 *
 * An empty result is "they have not said", NOT "they refuse everyone" — the
 * same reading this file already gives an empty preference, and the reason no
 * unfiltered list may filter on this.
 */
export function intentsOf(d: Pick<DXProfile, 'relationshipGoal' | 'openTo'>): Intent[] {
  /* PRESENT, not non-empty. Reading `openTo: []` as "never asked" would send
     somebody who deliberately unticked all three straight back to the lens
     their old goal implies — their answer discarded by the code that asked
     for it. The upsert DTO refuses an empty list from our own form, so this
     case is a row written some other way, and the honest reading of it is
     the one it states. */
  if (d.openTo !== undefined) {
    const declared = d.openTo.filter(isIntent);
    return INTENTS.filter((i) => declared.includes(i));
  }
  const derived = intentOfGoal(d.relationshipGoal);
  return derived ? [derived] : [];
}

/**
 * Is this profile shown under this lens?
 *
 * BOTH SIDES ARE ASKED, always, and that is the whole rule. A lens that only
 * filtered candidates would put somebody who is here for marriage in front of
 * a person browsing casually — a door locked from the other side, which is
 * what `unreachableReason` exists to stop happening on age and distance and
 * what H3 had to close on `?kind=platonic`. There is no `?intent=` that opens
 * a list you are not yourself on.
 */
export function underLens(d: Pick<DXProfile, 'relationshipGoal' | 'openTo'>, lens: Intent): boolean {
  return intentsOf(d).includes(lens);
}

/** What two people are both open to. Empty is a real answer here. */
export function sharedIntents(
  a: Pick<DXProfile, 'relationshipGoal' | 'openTo'>,
  b: Pick<DXProfile, 'relationshipGoal' | 'openTo'>,
): Intent[] {
  const B = new Set(intentsOf(b));
  return intentsOf(a).filter((i) => B.has(i));
}

/**
 * The line the "Marriage Intentions" deal-breaker draws.
 *
 * Not a distance along GOAL_ORDER — a side. Serious Dating and Marriage are two
 * steps apart and belong together; Casual Dating and Serious Dating are one step
 * apart and do not. Somebody looking for a spouse and somebody looking for a
 * fortnight are not a near miss that a good chart should be able to close.
 */
const COMMITTED_FROM = 2; // index of 'Serious Dating'
export function committed(goal?: string): boolean | null {
  const g = canonicalGoal(goal);
  if (!g) return null;
  return GOAL_ORDER.indexOf(g) >= COMMITTED_FROM;
}

/** Which lens sits on which side of that line. */
const INTENT_COMMITTED: Record<Intent, boolean> = {
  dating: false, intentional: true, marriage: true,
};

/**
 * THE SIDES THIS PROFILE IS ON — plural since the lenses (owner, 1 Sep).
 *
 * `committed()` above answers for ONE goal, because until today a citizen
 * could only have one. "Open to any combination" makes that a set: somebody
 * who ticks Dating and Marriage is on both sides and means it, and reading
 * only their old single goal would let the Marriage Intentions deal-breaker
 * quietly delete half the pool they had just asked for. The screen would
 * show three ticked boxes and the engine would honour one.
 *
 * A profile that has never touched the control still answers with exactly one
 * side — its stated goal's — so this is the same filter it has always been for
 * everyone already in the hub. Empty is "not stated", which filters nobody,
 * and that rule does not bend here either.
 */
export function committedSides(d: Pick<DXProfile, 'relationshipGoal' | 'openTo'>): boolean[] {
  const sides = new Set(intentsOf(d).map((i) => INTENT_COMMITTED[i]));
  if (sides.size) return [...sides];
  /* NO LENS, BUT POSSIBLY STILL A STATED GOAL — which is a citizen who
     unticked every box. They have said "put me under no heading"; they have
     not withdrawn what they are looking for, and this filter reads the
     latter. Dropping to nothing here would quietly remove the protection
     from the one person who fiddled with the control most, and from the
     marriage-seeker on the other side of it, who said nothing at all. The
     house rule is that a stated answer counts and an unstated one filters
     nobody: their goal is stated, so it counts. */
  const one = committed(d.relationshipGoal ?? undefined);
  return one === null ? [] : [one];
}
function goalScore(a?: string, b?: string): number {
  // Unanswered is 45, not 60. Two people who have not said what they want are
  // not a better prospect than two who said different things.
  const ca = canonicalGoal(a), cb = canonicalGoal(b);
  if (!ca || !cb) return 45;
  const i = GOAL_ORDER.indexOf(ca), j = GOAL_ORDER.indexOf(cb);
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

/**
 * The lifestyle comparison, and HOW MANY THINGS IT ACTUALLY COMPARED.
 *
 * The count is not bookkeeping: 45 is what this returns when it compared
 * nothing at all, and 45 is below the threshold at which a card tells two
 * people their habits look different. Without the count, "we could not look"
 * and "we looked and they differ" are the same number, and `frictions` printed
 * a sentence about the first as though it were the second. One function knows
 * the answer, so one function reports it.
 */
function lifestyleParts(a: DXProfile, b: DXProfile): { score: number; measured: number } {
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
  return { score: n ? Math.round(s / n) : 45, measured: n };
}

function lifestyleScore(a: DXProfile, b: DXProfile): number {
  return lifestyleParts(a, b).score;
}
/**
 * ANTI-GAMING, from the 1M run's §13.
 *
 * This was `35 + 13 x shared`, a RAW COUNT with no denominator, so a profile
 * that ticked every trait the form offers scored against everybody: eight
 * traits beat three honest ones by 34 points, and the form's cap of eight was
 * no defence because the old formula saturated at five. Values and interests
 * were already ratios (`overlapPct`) and were never gameable this way; this now
 * matches them. Two people who ticked the same three traits score 100; a
 * maximalist who ticked everything scores what the overlap actually is.
 *
 * The Introvert/Extrovert complement also required one side to be exclusively
 * one of them. Listing BOTH used to fire the bonus against the whole city.
 */
function personalityScore(a: string[] = [], b: string[] = []): number {
  const A = new Set(a.map(lc)), B = new Set(b.map(lc));
  if (!A.size || !B.size) return 35;
  const only = (S: Set<string>, x: string, y: string) => S.has(x) && !S.has(y);
  const complement =
    (only(A, 'introvert', 'extrovert') && only(B, 'extrovert', 'introvert'))
    || (only(A, 'extrovert', 'introvert') && only(B, 'introvert', 'extrovert')) ? 8 : 0;
  return Math.min(100, 35 + Math.round(0.65 * overlapPct([...A], [...B])) + complement);
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
 * Where somebody stands.
 *
 * The point their browser handed us when they chose "current location", and
 * otherwise the centroid of the city they typed — so a profile that has never
 * shared a location keeps precisely the behaviour it had before this existed.
 */
export function standCoords(d: DXProfile): Coords | null {
  const { searchLat: lat, searchLng: lng } = d;
  if (typeof lat === 'number' && typeof lng === 'number') return coarseCoords(lat, lng);
  return cityCoords(d.city, d.state, d.country);
}

/**
 * NOBODY CAN BE PLACED CLOSER THAN ABOUT FIVE KILOMETRES (fifth audit, 31 Aug,
 * H2; owner decision the same day).
 *
 * `searchLat/Lng` is the exact point a browser reported, and it was used
 * exactly. The viewer's own point is equally theirs to set. So: save your
 * profile from three invented positions, read "About 47 km away" on the
 * target's card each time, intersect three circles — the target's browser
 * position to the kilometre `haversineKm` rounds to. The distance
 * deal-breaker gave the same answer as a 200/404 on the detail page. This is
 * the 2014 Tinder trilateration, on a product whose promise is that nobody
 * can find you.
 *
 * Every coordinate is snapped to a 0.05° grid — about 5.5 km north–south,
 * 5.5 km × cos(latitude) east–west — at BOTH ends: on write, so the exact
 * point is never stored, and here on read, so rows written before this
 * existed are just as coarse. Distances are then between grid nodes, the
 * sentence below prints a band rather than a number, and the finest thing
 * any oracle can recover is the cell. Matching loses nothing it used: the
 * score bands start at 30 km.
 */
export const COORD_GRID_DEG = 0.05;
export function coarseCoords(lat: number, lng: number): Coords {
  const snap = (v: number) => Math.round(v / COORD_GRID_DEG) * COORD_GRID_DEG;
  // Rounded to two decimals so a stored value reads as the node it is.
  return { lat: Number(snap(lat).toFixed(2)), lng: Number(snap(lng).toFixed(2)) };
}

/** Kilometres between where these two stand, or null when either cannot be
 *  placed. Unmeasured distance ranks nobody and excludes nobody. */
export function searchDistanceKm(a: DXProfile, b: DXProfile): number | null {
  const pa = standCoords(a), pb = standCoords(b);
  return pa && pb ? haversineKm(pa, pb) : null;
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
  const km = searchDistanceKm(a, b);
  if (km === null) {
    if (a.city && b.city && lc(a.city) === lc(b.city)) return 100;
    if (a.state && b.state && lc(a.state) === lc(b.state)) return 70;
    if (a.country && b.country && lc(a.country) === lc(b.country)) return 55;
    // Two people with no location in common share no location.
    //
    // This was 30, which is MORE than the 25 a measured 4,000 km earns — so at
    // 1M global scale, where three quarters of pairs could not be placed at all,
    // being unlocatable scored better than being far away. 20 puts an unknown
    // below every distance the table can actually measure.
    return 20;
  }
  const base = bandFor(km);
  // A stated distance preference, honoured in both directions — the same rule
  // as every other preference here. Beyond what somebody asked for costs them,
  // and it costs the same whether they are 10 km over or 10,000: they said no.
  // Anywhere is a stated absence of a limit, so the radius they left on the
  // slider is not one. Only somebody searching from a place is held to it.
  const limits = [a, b]
    .filter((p) => p.partnerLocationMode !== 'any')
    .map((p) => p.prefDistanceKm)
    .filter((n): n is number => typeof n === 'number' && n > 0);
  const beyond = limits.some((limit) => km > limit);
  return beyond ? Math.min(base, 30) : base;
}

/**
 * WHETHER THESE TWO CAN TALK TO EACH OTHER.
 *
 * `languages` was collected by the form from the first version, weighted four
 * points by `completion.ts`, printed on every card — and read by no scoring or
 * filtering code at all. At 1M global users that produced 39.4% of curated deck
 * slots between people with no language in common, and a direct probe of a
 * monolingual Japanese speaker against a monolingual Brazilian scored 92%.
 *
 * This is a FILTER and not a factor, deliberately. "How many languages do you
 * share" is not a compatibility gradient — one is enough and zero is fatal — and
 * a factor worth 0.01 of the weight could not express that at any value.
 *
 * The file's standing rule holds: a field neither side filled in filters nobody.
 * If either person has listed no languages we do not know, and we do not guess.
 */
export function languageBarrier(a: DXProfile, b: DXProfile): boolean {
  const mine = (a.languages ?? []).map(lc).filter(Boolean);
  const theirs = (b.languages ?? []).map(lc).filter(Boolean);
  if (!mine.length || !theirs.length) return false;
  const T = new Set(theirs);
  return !mine.some((l) => T.has(l));
}

/**
 * The distance, in the words a card can print, or null when unmeasured.
 *
 * A BAND, NEVER A NUMBER (H2). "About 47 km away" was one of three
 * measurements a trilateration needs, and the grid above only bounds what a
 * number can say — it does not stop it being said. The bands are the score's
 * own (`bandFor`), so the sentence and the points agree.
 */
export function distanceNote(a: DXProfile, b: DXProfile): string | null {
  const km = searchDistanceKm(a, b);
  if (km === null) return null;
  if (km <= 30) return 'In your city.';
  if (km <= 50) return 'Within 50 km.';
  if (km <= 150) return '50–150 km away — an easy day out.';
  if (km <= 400) return '150–400 km away — a weekend.';
  if (km <= 1500) return '400–1,500 km away — a flight.';
  return 'Over 1,500 km away.';
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
  // Astrology is deliberately NOT in this list. It is computed from a birth date
  // that is mandatory at sign-up, so it is answered for everybody and counting it
  // would only dilute the measure. What is left is the six things a citizen
  // actually chooses to tell us, weighted equally.
  //
  // THIS USED TO BE A SHARE OF THE WEIGHT, and that broke the moment astrology
  // went past 0.50: at 0.90 a pair who had answered NOTHING scored coverage 0.90
  // and a confidence multiplier of 0.995, so the penalty that exists to stop a
  // stranger being oversold quietly switched itself off exactly when it was
  // needed most. An unweighted share cannot be disabled by a weight table.
  const answered = [
    some(aD.personalityTraits) && some(bD.personalityTraits),
    !!canonicalGoal(aD.relationshipGoal) && !!canonicalGoal(bD.relationshipGoal),
    some(aD.values) && some(bD.values),
    lifestyleKeys.some((k) => !!aD[k]) && lifestyleKeys.some((k) => !!bD[k]),
    some(aInterests) && some(bInterests),
    searchDistanceKm(aD, bD) !== null || (!!aD.city && !!bD.city),
  ];
  return answered.filter(Boolean).length / answered.length;
}

/**
 * A penalty, not a demolition — and now a smaller one than it was.
 *
 * It was `0.55 + 0.45 x coverage`. Two things changed underneath it. `coverage`
 * is stricter than it was — six real answers rather than a share of the weight
 * astrology dominates — so the same multiplier would bite far harder than it
 * used to. And the curated bar is a percentile of the viewer's own list now, so
 * a low score no longer means an empty shelf, which is what the old, heavier
 * penalty was really being used to prevent.
 *
 * The floor is 0.70 and not higher because of M4. At astrology 0.90 a pair who
 * have answered NOTHING still arrive with 0.90 of the model filled in by the
 * calendar: raw 93 on a favourable chart. `matching.spec.ts` asserts that such a
 * pair cannot reach 75 on any elemental pairing, and 0.70 + 0.30 x coverage is
 * what keeps that true — a blank pair lands at 70, a half-answered one at 0.85
 * of its raw score, and two complete profiles are untouched at x1.000.
 *
 * The honesty this was standing in for belongs in words, not in arithmetic:
 * `coverage` is returned to the client and rendered next to the number.
 */
export function confidence(cov: number): number {
  return 0.70 + 0.30 * Math.max(0, Math.min(1, cov));
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
  const mine = canonicalGoal(aD.relationshipGoal), theirs = canonicalGoal(bD.relationshipGoal);
  if (mine && theirs && mine !== theirs) out.push(`You said ${aD.relationshipGoal}; they said ${bD.relationshipGoal}.`);
  // "Still figuring it out" is an ANSWER (fifth audit, 31 Aug, medium 9):
  // canonicalGoal deliberately maps it to null, and this sentence then told
  // the viewer they had said nothing — a friction printed about a person who
  // answered the question. The two states get their own true sentences.
  else if (mine && !theirs && bD.relationshipGoal) out.push('They are still figuring out what they are looking for.');
  else if (mine && !theirs) out.push('They have not said what they are looking for yet.');
  if (childrenConflict(aD.wantsChildren, bD.wantsChildren)) {
    // THEIR ANSWER IS NOT QUOTED (audit finding 17). `wantsChildren` is the
    // one factor here that appears NOWHERE on a profile — matchDetail shows
    // goal, diet, smoking, drinking, height, education; it has never shown
    // this. So the old line, "Different answers on children — X and Y",
    // narrated a stranger's most private form answer onto every card, to
    // every viewer, at every score. The module already has the precedent:
    // the height filter refuses to say it fired "because saying so would
    // leak a stranger's settings". Same rule. The viewer gets their OWN
    // answer and the fact of a conflict — which is what the friction is.
    out.push(`Different answers on children — you said ${aD.wantsChildren}.`);
  }
  /**
   * A FRICTION IS A DIFFERENCE, NOT A SILENCE (launch audit, 28 Aug).
   *
   * All four of these read a SCORE, and all four of the scores have a default
   * that sits inside the band being tested: an unplaceable pair scores 20 for
   * location, a pair with nothing comparable scores 45 for lifestyle, empty
   * values are 20 and empty traits are 35. Every one of those defaults is below
   * its own threshold, so the sentences fired hardest on the pairs the engine
   * knew least about — and on launch day that is every pair.
   *
   * Measured, on two profiles that had entered no location and no lifestyle at
   * all: "You are a long way apart." and "Your day-to-day habits look quite
   * different." Both are assertions of fact about two strangers, generated from
   * the absence of an answer.
   *
   * `distanceNote`, one function below, already gets this right and returns
   * null when nothing could be measured, with the comment "Omitted rather than
   * hedged". Same rule, applied to the four that did not have it: each says
   * what was answered before it says what it means.
   */
  const answered = (v?: string[] | null) => Array.isArray(v) && v.length > 0;
  // Stricter than `coverage`'s idea of an answered location, deliberately.
  // Coverage asks "did they tell us where they are", which two unrecognised
  // city names satisfy. A sentence about the distance BETWEEN them needs the
  // distance, and outside the coordinate table there is not one.
  if (searchDistanceKm(aD, bD) !== null && f.location <= 50) out.push('You are a long way apart.');
  if (lifestyleParts(aD, bD).measured > 0 && f.lifestyle < 50) out.push('Your day-to-day habits look quite different.');
  if (answered(aD.values) && answered(bD.values) && f.values < 45) out.push('Not much overlap in what you each said you value.');
  if (answered(aD.personalityTraits) && answered(bD.personalityTraits) && f.personality < 45) out.push('Very different temperaments.');
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
/**
 * The deal-breakers this profile is actually filtering on.
 *
 * MEASURED, 23 Aug (`sim/stress-100k.ts`, 100,000 profiles, two seeds): a
 * fundamentally mismatched pair — different intent, different answer on
 * children, a diet the other side asked not to have — scores a mean of 64.4.
 * Everybody else scores 66.9. **2.5 points of separation**, on a number whose
 * interquartile range is 15 and which the card prints as a percentage.
 *
 * The score does not know. It cannot: relationship goals carry 0.10 of the
 * weight, and children and diet carry none at all. So no threshold drawn
 * anywhere on that distribution separates the two populations, and the curated
 * bar — at 75, at a percentile, anywhere — is a volume control that has been
 * asked to do a quality job for as long as this product has had one. 40.8% of
 * today's curated deck slots carry one of those three mismatches.
 *
 * The only thing that removes them is a filter. Today filters are an optional
 * chip section, and in the simulated population 62% of citizens never open it.
 *
 * DATING_CORE_FILTERS=on asks the counterfactual: the three fundamental
 * questions filter for everybody who has ANSWERED them. Measured with the
 * percentile bar, that is 0.00% mismatched deck slots — none, of 122,360 — and
 * complete profiles end up with MORE matches than today, not fewer, because the
 * bar opens the door wider than the filters close it.
 *
 * Off by default. It changes what every citizen sees, and the 62% it turns on
 * is this simulation's assumption rather than a number read off the real
 * `dealBreakers` column — check that before turning this on.
 *
 * An unanswered field still filters nobody, flag or no flag. That rule does not
 * bend: this makes a stated answer count, it does not invent one.
 */
export const DEAL_BREAKER_OFF = '-';
/** The three the engine turns on for an answered field, and the only three a
 *  citizen can turn back off with a `-` entry. */
export const CORE_DEAL_BREAKERS = ['Marriage Intentions', 'Wants Children', 'Diet'] as const;

export function effectiveDealBreakers(d: DXProfile): string[] {
  const stored = d.dealBreakers ?? [];
  // AN OPT-OUT IS AN ANSWER TOO (owner, 1 Sep). The three core filters stay on
  // by default for anybody who has answered the field and never touched the
  // chips — that is what the 26 Aug measurement bought and it does not change.
  // What changes is that the chip is a chip again: a citizen who unticks one is
  // stating that it should shape the score rather than empty the room, and the
  // form writes that as `-<label>`. Explicit beats default; silence still means
  // the filter is on.
  const off = new Set(
    stored.filter((v) => v.startsWith(DEAL_BREAKER_OFF)).map((v) => v.slice(1).trim()),
  );
  const on = new Set(stored.filter((v) => !v.startsWith(DEAL_BREAKER_OFF)));
  // DEFAULT ON since 26 Aug. Measured at 100K, with the percentile bar, this
  // takes curated slots carrying a fundamental mismatch from 45.4% to 15.8% and
  // triples the score's predictive validity, while complete profiles end up with
  // MORE matches than before because the bar opens the door wider than the
  // filters close it. At astrology 0.90 it is not a refinement: it is the only
  // mechanism left that can stop a good chart introducing a marriage-seeker to
  // somebody looking for a fortnight.
  //
  // DATING_CORE_FILTERS=off restores the opt-in-chips-only behaviour.
  // An unanswered field still filters nobody, flag or no flag. That rule does
  // not bend: this makes a stated answer count, it does not invent one.
  if (process.env.DATING_CORE_FILTERS !== 'off') {
    if (canonicalGoal(d.relationshipGoal) && !off.has('Marriage Intentions')) on.add('Marriage Intentions');
    if (d.wantsChildren && !off.has('Wants Children')) on.add('Wants Children');
    if (d.prefDiet && !off.has('Diet')) on.add('Diet');
  }
  return [...on];
}

/**
 * EQUALITY IS NOT COMPATIBILITY, and three filters were using it as if it were.
 *
 * The 1M run enumerated what exact string comparison does to the lookup
 * vocabularies: Atheist vs Agnostic removed; Yes vs Maybe on children removed;
 * a Vegetarian preference removed Vegans and Jains; and two people who both
 * answered "Prefer not to say" about religion counted as a match. Worse in the
 * other direction — a citizen who ticked Religion and answered "Prefer not to
 * say" excluded every candidate who had named one, turning a privacy answer into
 * the most exclusionary filter on the form.
 */

/** Diet, as a containment ladder rather than a string comparison. A preference
 *  is met by anything at least as restrictive as itself. */
const DIET_PERMITS: Record<string, string[]> = {
  jain: ['jain'],
  vegan: ['vegan', 'jain'],
  vegetarian: ['vegetarian', 'vegan', 'jain'],
  eggetarian: ['eggetarian', 'vegetarian', 'vegan', 'jain'],
  pescatarian: ['pescatarian', 'eggetarian', 'vegetarian', 'vegan', 'jain'],
  // Somebody who asked for a non-vegetarian partner is stating a preference, not
  // a restriction; a filter should remove less, not more, when it is unsure.
  'non-vegetarian': ['non-vegetarian', 'pescatarian', 'eggetarian', 'vegetarian', 'vegan', 'jain'],
};
export function dietConflicts(pref?: string, actual?: string): boolean {
  if (!pref || !actual) return false;
  const permitted = DIET_PERMITS[lc(pref)];
  if (!permitted) return false;               // a label we do not know filters nobody
  return !permitted.includes(lc(actual));
}

/** Children. Only Yes against No is a conflict. "Maybe" is a conversation and
 *  "Prefer not to say" is not an answer — neither is a reason to remove anyone. */
const KID_DECIDED = new Set(['yes', 'no']);
export function childrenConflict(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  const x = lc(a), y = lc(b);
  if (!KID_DECIDED.has(x) || !KID_DECIDED.has(y)) return false;
  return x !== y;
}

/** Religion. Non-answers state nothing and remove nobody in either direction;
 *  the three non-religious labels are compatible with each other. */
const RELIGION_SILENT = new Set(['prefer not to say', 'other', '']);
const NON_RELIGIOUS = new Set(['atheist', 'agnostic', 'spiritual']);
export function religionConflict(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  const x = lc(a), y = lc(b);
  if (RELIGION_SILENT.has(x) || RELIGION_SILENT.has(y)) return false;
  if (NON_RELIGIOUS.has(x) && NON_RELIGIOUS.has(y)) return false;
  return x !== y;
}

/**
 * Where the curated shelf starts, for THIS viewer.
 *
 * `fixed` is 75 and is what shipped. Measured at 100K it is unreachable for
 * anyone who has not finished their profile: not one of 45,115 partial or
 * near-empty profiles clears it with anybody, ever. 75 is also calibrated to
 * astrology's inflation — astrology scores 54–99 while the other six factors
 * sit far lower — which is why `DATING_WEIGHTS=retuned` takes the share of
 * pairs at ≥75% from 3.74% to 0.22% and cannot be shipped as a flag alone.
 *
 * `p90` draws the bar at the top tenth of the viewer's own candidate list.
 * Everybody has a top tenth, so empty decks fall from 25%/100%/100% by
 * completeness cohort to 1.3%/0.8%/0.1%, and the bar stops depending on what
 * the weight table happens to inflate to — which is what makes the astrology
 * decision genuinely reversible.
 *
 * The floor is the argument against a pure percentile: a top tenth of nothing
 * is still nothing worth showing. DATING_BAR_FLOOR sets it; 0 disables it.
 *
 * Taken off the sorted list rather than interpolated, so a viewer with four
 * candidates still has a top tenth of four.
 */
export function curatedBar(scores: number[], fixedBar = 75): number {
  // DEFAULT p90 since 26 Aug. A fixed 75 is unreachable for anyone who has not
  // finished their profile — measured at 1M, not one partially-filled profile
  // clears it with anybody, ever — and it is calibrated to whatever the weight
  // table happens to inflate to, which is why it could not survive astrology
  // moving from 0.50 to 0.90. A percentile is the same promise at any weight.
  // DATING_BAR=fixed restores the old behaviour.
  if (process.env.DATING_BAR === 'fixed') return fixedBar;
  if (!scores.length) return fixedBar;
  const sorted = [...scores].sort((a, b) => b - a);
  const p90 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.1))];
  // A floor that does not parse is no floor (31 Aug, sixth pass): a stray
  // character in DATING_BAR_FLOOR made this NaN, every comparison against the
  // bar false, and Browse silently empty with no error anywhere. Config typos
  // fall back to "no floor", which is the value the variable's absence means.
  const floor = Number(process.env.DATING_BAR_FLOOR ?? 0);
  return Math.max(Number.isFinite(floor) ? floor : 0, p90);
}

export function hardFilterReason(myD: DXProfile, theirD: DXProfile, theirAge: number): string | null {
  if (myD.prefAgeMin && theirAge < myD.prefAgeMin) return 'age';
  if (myD.prefAgeMax && theirAge > myD.prefAgeMax) return 'age';
  const height = heightFilterReason(myD, theirD);
  if (height) return height;

  const db = effectiveDealBreakers(myD);
  if (db.includes('Smoking') && theirD.smoking === 'Regularly') return 'smoking';
  if (db.includes('Drinking') && theirD.drinking === 'Regularly') return 'drinking';
  if (db.includes('Wants Children') && childrenConflict(myD.wantsChildren, theirD.wantsChildren)) return 'children';

  // Marriage Intentions — a side of the line, not a distance along it.
  //
  // SIDES, PLURAL, SINCE THE LENSES (1 Sep). The rule is unchanged for every
  // profile that states one goal: two people on opposite sides do not meet.
  // What changed is that a citizen may now say they are open to both, and
  // then they belong to both — no overlap is the rejection, not inequality.
  // Unstated on either side still filters nobody.
  if (db.includes('Marriage Intentions')) {
    const mine = committedSides(myD), theirs = committedSides(theirD);
    if (mine.length && theirs.length && !mine.some((s) => theirs.includes(s))) return 'intent';
  }

  // Distance — the limit they already stated, now honoured as the boundary they
  // wrote it as. Unmeasurable distance filters nobody: `searchDistanceKm` returns
  // null outside the coordinate table, and a filter must not fire on a guess.
  // Anywhere never excludes on geography, whatever the slider was left at.
  if (db.includes('Distance') && myD.partnerLocationMode !== 'any'
      && typeof myD.prefDistanceKm === 'number' && myD.prefDistanceKm > 0) {
    const km = searchDistanceKm(myD, theirD);
    if (km !== null && km > myD.prefDistanceKm) return 'distance';
  }

  // Diet — only against a preference they actually stated. "Any" is not a
  // preference and must never be scored, or filtered, as one.
  if (db.includes('Diet') && dietConflicts(myD.prefDiet, theirD.diet)) return 'diet';

  // Religion — same shape. Collected for a year, read for the first time here.
  if (db.includes('Religion') && religionConflict(myD.religion, theirD.religion)) return 'religion';

  // A shared language is not a chip and is not opt-in. Two people who cannot
  // talk to each other are not a match at any score, and at astrology 0.90 the
  // score will happily say otherwise. Neither side having listed a language
  // filters nobody — see `languageBarrier`.
  if (languageBarrier(myD, theirD)) return 'language';

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

/** The three genders a seekingList may name; anything else is dropped unread. */
const SEEKABLE = ['male', 'female', 'nonbinary'];

/**
 * Does this person seek `targetGender`? The column carries the coarse answer
 * ('any', or one gender); a `seekingList` in the extras overrides it with the
 * precise one. Pure, and used on BOTH sides of every reachability check, so
 * "I seek men and women" and "they seek women" stay one vocabulary.
 */
export function seeks(column: string, dx: { seekingList?: unknown } | null | undefined, targetGender: string): boolean {
  const raw = dx?.seekingList;
  const list = Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string' && SEEKABLE.includes(x)) : [];
  if (list.length) return list.includes(targetGender);
  return column === 'any' || column === targetGender;
}

/**
 * THE NAME A PERSON CHOSE TO BE SEEN UNDER (owner, 26 Aug: "let the user take
 * a name which is shown with the profile and the chat").
 *
 * `extras.firstName` has been the dating profile's own name field since the
 * form shipped — the detail page and the chat list already preferred it — but
 * the three list builders still sent the ACCOUNT name, so a citizen who chose
 * to date as "Maya" was "Mayassarī Venkataraghavan" on every card and "Maya"
 * only after you opened her. One helper, used at every site a person is
 * drawn, so the name cannot depend on which screen you met them on.
 *
 * Defensive at the read, like seeks(): whitespace collapsed, length capped,
 * anything that is not a non-empty string falls back to the account name —
 * a stored blob is never trusted to be tidy.
 */
export function shownName(dx: { firstName?: unknown } | null | undefined, fallback: string): string {
  const raw = dx?.firstName;
  const name = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim().slice(0, 40).trim() : '';
  const out = name || fallback;
  // The first letter stands up (owner, 27 Aug: a card leading with "somen"
  // reads as a typo). ONLY the first character — the rest of the name is
  // theirs, so "aditya McKenna" keeps its capitals and its choices.
  return out ? out.charAt(0).toUpperCase() + out.slice(1) : out;
}
