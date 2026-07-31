import { WEIGHTS, type FactorBreakdown } from './matching';

/**
 * WHAT THE CITY LEARNS FROM WHO YOU CHOOSE (H2).
 *
 * Recommendations never learned anything. Every citizen was scored with the same
 * seven weights — astrology 0.50, personality 0.15, goals 0.10, values 0.10, and
 * 0.05 each for lifestyle, interests and location — no matter how many people
 * they had liked or passed on, and no matter what those people had in common.
 * The hub asked for a decision on every card and did nothing with the answer.
 *
 * WHAT MOVES, AND WHAT DELIBERATELY DOES NOT. The owner's ruling is that the
 * WEIGHTS are what adapts, per person. Astrology stays pinned at 0.50 — a
 * product decision from an earlier round that this does not relitigate — and the
 * other six share the remaining half between them. It is that half this
 * redistributes.
 *
 * THE SCORE IS NOW VIEWER-RELATIVE, AND THAT HAS TO BE SAID OUT LOUD. Once the
 * weights differ per person, so does the percentage: you and the person you are
 * looking at can see different numbers for the same pair. That is a real change
 * in what "87%" means — from "how well the two of you fit" to "how well they fit
 * what you keep choosing" — and a screen that shows the new number with the old
 * sentence would be lying quietly. `headline` exists to be rendered, not logged.
 *
 * WHAT DECIDES WHO IS ELIGIBLE DOES NOT MOVE. Reachability, the hard filters and
 * the match threshold are all judged on the STANDARD weights, and only the
 * ordering and the displayed figure use yours. Two reasons, both load-bearing.
 * A citizen's own swiping must never remove somebody from their list — that is
 * how a recommender narrows a world without anybody deciding to. And the cached
 * pair score, which is the evidence this learns from, has to stay the unlearned
 * one: score the cache with learned weights and the next round learns from its
 * own output, which is a feedback loop wearing a lab coat.
 *
 * THE SIGNAL IS ALREADY IN THE DATABASE. Every pair's seven factor scores are
 * cached in CompatibilityScore, and every like and pass is on DatingMatch. So
 * for each decision a citizen has made, the factors behind it can be recovered
 * exactly. Nothing new is collected, nothing is inferred from a conversation
 * anybody thought was private, and no third party is involved.
 *
 * HOW A LEAN IS READ. For one factor, compare its mean score among the profiles
 * you LIKED against its mean among the ones you PASSED. If shared values ran ten
 * points higher on the people you liked, values is telling us something about
 * you and earns more weight. If lifestyle scored the same either way, it did not
 * separate anybody and earns less. That is the whole idea, and it is deliberately
 * the simplest thing that could work: a difference of means, per factor, with no
 * model, no training loop, and nothing that cannot be said in one sentence to
 * the person it is about.
 *
 * WHY IT IS SLOW ON PURPOSE. Below MIN_DECISIONS, or with fewer than MIN_EACH of
 * either kind, this returns the standard weights unchanged and says so. A run of
 * five passes is not a preference, and a dating hub that concludes one from
 * near-noise quietly deprioritises a whole group of people on no evidence. The
 * cost of being cautious is that it helps later. The cost of being eager falls
 * on the people who stop being shown.
 *
 * WHAT IT WILL NOT DO. It never removes anybody from the list — reachability and
 * the hard filters are decided elsewhere and this only reorders what already got
 * through. It never drives a weight to zero, so no factor is ever switched off
 * behind somebody's back. And it never moves a weight more than MAX_SHIFT, so
 * one strong run cannot collapse the ranking onto a single dimension.
 */

export interface Decision {
  /** true = liked, false = passed. */
  liked: boolean;
  factors: FactorBreakdown;
}

/** Total likes + passes before anything is learned. */
export const MIN_DECISIONS = 15;
/** …and at least this many of EACH, because a mean over one pass is not a mean. */
export const MIN_EACH = 5;
/** Points of difference between the two means before a factor counts as leaning. */
export const CLEAR_LEAN = 8;
/** The most any factor's share may move, relative to where it started. */
export const MAX_SHIFT = 0.5;
/** No factor is ever switched off. */
export const WEIGHT_FLOOR = 0.02;
/**
 * How far back the evidence goes.
 *
 * Bounded so somebody who has been here two years is ranked by who they are now
 * rather than who they were, and so this stays one indexed read rather than
 * growing with the account. Most-recently-decided first.
 */
export const LEARNING_WINDOW = 200;

/** Pinned by an earlier product decision; this module does not reopen it. */
export const PINNED: keyof FactorBreakdown = 'astrology';

const LABEL: Record<keyof FactorBreakdown, string> = {
  astrology: 'astrology',
  personality: 'personality',
  relationshipGoals: 'what you each want',
  values: 'shared values',
  lifestyle: 'lifestyle',
  interests: 'shared interests',
  location: 'how close by',
};

export interface FactorNote {
  key: keyof FactorBreakdown;
  label: string;
  /** Mean among likes minus mean among passes, in points. */
  lean: number;
  direction: 'up' | 'down';
  note: string;
}

export interface LearnedWeights {
  weights: Record<keyof FactorBreakdown, number>;
  /** False when the weights are the standard ones, for whatever reason. */
  learned: boolean;
  decisions: number;
  likes: number;
  passes: number;
  /** One line, for the citizen, always true of what actually happened. */
  headline: string;
  /** Only the factors that actually moved. */
  notes: FactorNote[];
}

const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

const base = (): Record<keyof FactorBreakdown, number> => ({ ...WEIGHTS });

const unlearned = (
  decisions: number, likes: number, passes: number, headline: string,
): LearnedWeights => ({ weights: base(), learned: false, decisions, likes, passes, headline, notes: [] });

/**
 * The whole decision, as a function of what somebody has actually done.
 *
 * Deterministic: same decisions in, same weights out, in any order.
 */
export function learnWeights(decisions: readonly Decision[]): LearnedWeights {
  const liked = decisions.filter((d) => d.liked).map((d) => d.factors);
  const passed = decisions.filter((d) => !d.liked).map((d) => d.factors);
  const n = decisions.length;

  if (n < MIN_DECISIONS) {
    return unlearned(n, liked.length, passed.length,
      `Ranked the standard way — ${MIN_DECISIONS - n} more decision${MIN_DECISIONS - n === 1 ? '' : 's'} before your matches start following what you pick.`);
  }
  if (liked.length < MIN_EACH || passed.length < MIN_EACH) {
    return unlearned(n, liked.length, passed.length,
      'Ranked the standard way — we need a few more of both, likes and passes, before your choices can tell us anything.');
  }

  const keys = (Object.keys(WEIGHTS) as (keyof FactorBreakdown)[]).filter((k) => k !== PINNED);

  // A factor's lean: how much higher it ran on the people you liked.
  const leans = new Map<keyof FactorBreakdown, number>();
  for (const k of keys) leans.set(k, mean(liked.map((f) => f[k])) - mean(passed.map((f) => f[k])));

  const moving = keys.filter((k) => Math.abs(leans.get(k) ?? 0) >= CLEAR_LEAN);
  if (moving.length === 0) {
    return unlearned(n, liked.length, passed.length,
      'Ranked the standard way — nothing you have picked leans clearly enough in one direction yet.');
  }

  // Shift each factor's share by its lean, capped, then renormalise the six so
  // they still add up to exactly what they had between them before.
  const pinned = WEIGHTS[PINNED];
  const share = keys.reduce((s, k) => s + WEIGHTS[k], 0); // the other half
  const raw = new Map<keyof FactorBreakdown, number>();
  for (const k of keys) {
    const lean = leans.get(k) ?? 0;
    // 50 points of separation is the most anybody gets credit for; beyond that
    // the factor is already doing all the work it can be trusted with.
    const shift = Math.max(-MAX_SHIFT, Math.min(MAX_SHIFT, lean / 50));
    raw.set(k, Math.max(WEIGHT_FLOOR, WEIGHTS[k] * (1 + shift)));
  }
  const rawTotal = [...raw.values()].reduce((a, b) => a + b, 0);

  const weights = base();
  weights[PINNED] = pinned;
  for (const k of keys) weights[k] = ((raw.get(k) ?? 0) / rawTotal) * share;

  const notes: FactorNote[] = moving
    .map((k) => {
      const lean = Math.round(leans.get(k) ?? 0);
      return {
        key: k,
        label: LABEL[k],
        lean,
        direction: (lean > 0 ? 'up' : 'down') as 'up' | 'down',
        note: lean > 0
          ? `${LABEL[k]} ran ${lean} points higher on the people you liked, so it counts for more.`
          : `${LABEL[k]} was much the same either way, so it counts for less.`,
      };
    })
    .sort((a, b) => Math.abs(b.lean) - Math.abs(a.lean));

  const up = notes.filter((x) => x.direction === 'up').map((x) => x.label);
  const headline = up.length
    ? `Ranked from your ${n} decisions — you lean toward ${listOf(up)}.`
    : `Ranked from your ${n} decisions — ${listOf(notes.map((x) => x.label))} matter less to you than to most people.`;

  return { weights, learned: true, decisions: n, likes: liked.length, passes: passed.length, headline, notes };
}

const listOf = (xs: readonly string[]): string =>
  xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;

/** Score a pair against one citizen's own weights. Mirrors overallScore. */
export function overallScoreWith(
  f: FactorBreakdown, weights: Record<keyof FactorBreakdown, number>,
): number {
  let sum = 0;
  (Object.keys(weights) as (keyof FactorBreakdown)[]).forEach((k) => { sum += f[k] * weights[k]; });
  return Math.round(sum);
}
