import type { RecommendedProduct } from './beauty-engine';
import { monthlyCostInr, monthsOfUse } from './monthly-cost';

/**
 * Choosing a routine that fits what somebody can spend.
 *
 * THE ORDER OF OPERATIONS IS THE WHOLE DESIGN, and it is the opposite of the
 * obvious one. The obvious one builds the ideal routine, prices it, and tells
 * the person it costs more than they have — which is a shop pretending to be an
 * advisor. This works the other way round: understand the need, establish the
 * minimum that actually treats it, apply the budget, and choose within it. The
 * budget is an input to selection, never a filter applied to a finished answer.
 *
 * LEAN IS THE DEFAULT, NOT THE FALLBACK. More products is not better skin. A
 * step is included because something in the assessment asks for it, not because
 * a category exists to be filled — which is why `leftOut` is part of the output
 * and says "your moisturiser already covers this" rather than quietly shipping
 * a shorter list.
 *
 * AND IT DOES NOT SPEND WHAT IS LEFT. Given ₹15,000 and a ₹6,000 routine that
 * is right, the answer is a ₹6,000 routine and ₹9,000 untouched. Optional steps
 * enter only when they answer a need nothing else in the routine covers.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * THE THREE TIERS
 *
 *   ESSENTIAL   the routine is not a routine without it. Cleanse, moisturise
 *               and protect for the face; wash and condition for hair; a body
 *               moisturiser. If the budget will not carry these, the budget is
 *               too low and the plan says so rather than quietly dropping one.
 *   HIGH VALUE  the step that treats what the assessment actually found. This
 *               is the one worth spending an upgrade on, and the first thing to
 *               add when there is room.
 *   OPTIONAL    everything else, and only if it answers a need that no chosen
 *               product already covers.
 * ────────────────────────────────────────────────────────────────────────────
 */

export type BudgetCategory = 'face' | 'hair' | 'body';
export type Tier = 'essential' | 'high-value' | 'optional';

export interface CategoryBudgets { face: number; hair: number; body: number }

/**
 * What is saved on the profile.
 *
 * `setAt` is here so the routine can say what it was built against and so an
 * old budget can be noticed; `currency` because a number without one is a bug
 * waiting for the second market; `preference` for a note the citizen leaves
 * themselves ("keep it lean", "happy to spend on the serum").
 */
export interface StoredBudget extends CategoryBudgets {
  setAt: string | null;
  currency: string;
  preference: string | null;
}

/** The smallest and largest monthly figure the sliders offer. */
export const BUDGET_MIN = 1000;
export const BUDGET_MAX = 60000;

export const clampBudget = (n: number): number =>
  Math.min(BUDGET_MAX, Math.max(BUDGET_MIN, Math.round(Number.isFinite(n) ? n : BUDGET_MIN)));

/** Which budget a product is charged to — its group, never the band it lands in.
 *  A face mask and a shampoo share the weekly band and nothing else. */
export const categoryOf = (group: string): BudgetCategory =>
  group === 'Hair Care' ? 'hair' : group === 'Body Care' ? 'body' : 'face';

/**
 * The ROLE a product plays, and what that role is worth.
 *
 * Roles are one-per-routine by construction: a plan holds at most one cleanser,
 * one moisturiser, one treatment. That single fact is what stops the
 * cleanser-toner-essence-serum-serum-serum-eye-cream pile-up, and it does it
 * without a rule anywhere that says "no more than N products".
 */
interface RoleDef {
  role: string; tier: Tier; match: RegExp;
  /** Lower goes in first when the budget cannot carry every essential. This is
   *  a clinical ordering, not a declaration order: sunscreen is the one step
   *  with no substitute, and cleansing with water is at least possible. */
  floor?: number;
}

const ROLES: Record<BudgetCategory, RoleDef[]> = {
  face: [
    { role: 'Cleanse', tier: 'essential', match: /^Cleanser$/i, floor: 3 },
    { role: 'Moisturise', tier: 'essential', match: /^Moisturiser$/i, floor: 2 },
    { role: 'Protect', tier: 'essential', match: /^Sunscreen$/i, floor: 1 },
    { role: 'Treat', tier: 'high-value', match: /^Serum$/i },
    { role: 'Prep', tier: 'optional', match: /^Toner$/i },
    { role: 'Weekly', tier: 'optional', match: /^Face mask$/i },
  ],
  hair: [
    { role: 'Wash', tier: 'essential', match: /^Shampoo$/i, floor: 1 },
    { role: 'Condition', tier: 'essential', match: /^Conditioner$/i, floor: 2 },
    { role: 'Treat', tier: 'high-value', match: /^(Hair mask|Hair oil)$/i },
    { role: 'Finish', tier: 'optional', match: /^Hair serum$/i },
  ],
  body: [
    { role: 'Moisturise', tier: 'essential', match: /^Body lotion$/i },
    { role: 'Wash', tier: 'high-value', match: /^Body wash$/i },
    { role: 'Lips', tier: 'optional', match: /^Lip balm$/i },
    { role: 'Hands', tier: 'optional', match: /^Hand cream$/i },
    { role: 'Exfoliate', tier: 'optional', match: /^Body scrub$/i },
  ],
};

/** Why a role that could have been in the plan is not. */
export interface LeftOut { role: string; tier: Tier; why: string }

export interface Pick_ {
  product: RecommendedProduct;
  role: string;
  tier: Tier;
  monthlyInr: number;
  monthsOfUse: number;
}

export interface CategoryPlan {
  category: BudgetCategory;
  budgetInr: number;
  picks: Pick_[];
  monthlyInr: number;
  remainingInr: number;
  /** Set only when the budget cannot carry the essentials: what it would take. */
  minimumInr: number | null;
  /** Roles deliberately not included, each with the sentence to show. */
  leftOut: LeftOut[];
  /** Things worth considering with money left over — never auto-added. */
  upgrades: Pick_[];
}

const cost = (p: RecommendedProduct) => monthlyCostInr(p);

/** Cheapest per month first; a tie goes to the better profile match. */
const byValue = (a: RecommendedProduct, b: RecommendedProduct) =>
  cost(a) - cost(b) || b.matchScore - a.matchScore;

/** Best match first; a tie goes to the cheaper. Used when upgrading. */
const byMatch = (a: RecommendedProduct, b: RecommendedProduct) =>
  b.matchScore - a.matchScore || cost(a) - cost(b);

const toPick = (product: RecommendedProduct, role: string, tier: Tier): Pick_ =>
  ({ product, role, tier, monthlyInr: cost(product), monthsOfUse: monthsOfUse(product) });

/**
 * Plan one category against one monthly budget.
 *
 * FOUR PASSES, in this order, and the order is the policy:
 *   1. FLOOR — the cheapest product for every essential role. If that does not
 *      fit, the budget is short: fill what fits in role order and report the
 *      figure that would work.
 *   2. TREAT — the high-value role, at the cheapest product that answers the
 *      strongest unmet need.
 *   3. UPGRADE — spend remaining money on making the picks BETTER before making
 *      them MORE. Greedy on match-points per rupee, so the money goes where it
 *      changes the most.
 *   4. ADD — optional roles, and only where they answer a need no chosen
 *      product already covers.
 */
export function planCategory(
  all: RecommendedProduct[], category: BudgetCategory, budgetInr: number, needs: Set<string>,
): CategoryPlan {
  const budget = clampBudget(budgetInr);
  const pool = all.filter((p) => categoryOf(p.group) === category && p.matched);
  const defs = ROLES[category];
  const forRole = (d: RoleDef) => pool.filter((p) => d.match.test(p.category));

  const picks: Pick_[] = [];
  const leftOut: LeftOut[] = [];
  let spent = 0;
  const left = () => budget - spent;
  const take = (p: RecommendedProduct, role: string, tier: Tier) => {
    const pick = toPick(p, role, tier);
    picks.push(pick); spent += pick.monthlyInr;
  };

  // ── 1. the floor ────────────────────────────────────────────────────────
  const essentials = defs.filter((d) => d.tier === 'essential');
  const floorPicks = essentials
    .map((d) => ({ d, p: [...forRole(d)].sort(byValue)[0] }))
    .filter((x) => x.p)
    // In clinical order, so a short budget drops the most substitutable step
    // rather than whichever happened to be declared last.
    .sort((a, b) => (a.d.floor ?? 9) - (b.d.floor ?? 9));
  const floorCost = floorPicks.reduce((n, x) => n + cost(x.p), 0);
  const short = floorCost > budget;

  for (const { d, p } of floorPicks) {
    if (cost(p) <= left()) take(p, d.role, d.tier);
    else leftOut.push({ role: d.role, tier: d.tier, why: `A ${d.role.toLowerCase()} step needs about ₹${cost(p).toLocaleString('en-IN')} a month, which this budget cannot carry alongside the rest.` });
  }
  for (const d of essentials) {
    if (!floorPicks.some((x) => x.d.role === d.role)) {
      leftOut.push({ role: d.role, tier: d.tier, why: 'Nothing on the shelf matches your profile for this step yet.' });
    }
  }

  // ── 2. the step that treats the thing ───────────────────────────────────
  const covered = () => new Set(picks.flatMap((x) => x.product.profileKeys));
  for (const d of defs.filter((x) => x.tier === 'high-value')) {
    const candidates = [...forRole(d)]
      .filter((p) => p.profileKeys.some((k) => needs.has(k)))
      .sort(byValue);
    const p = candidates.find((c) => cost(c) <= left());
    if (p) take(p, d.role, d.tier);
    else if (candidates.length) {
      leftOut.push({ role: d.role, tier: d.tier, why: `We haven't included a ${d.role.toLowerCase()} step — the cheapest one that suits you is about ₹${cost(candidates[0]).toLocaleString('en-IN')} a month and would push you over.` });
    }
  }

  // ── 3. better before more ───────────────────────────────────────────────
  //
  // AN UPGRADE HAS TO BUY SOMETHING MEASURABLE, and the measure is how many of
  // THIS PERSON'S needs the product answers. Not the match score — those tie
  // constantly, because two moisturisers for the same skin type score the same
  // and should. Not the price, obviously. If a ₹900-a-month moisturiser and a
  // ₹570 one both answer hydration and nothing else, the extra ₹330 buys a
  // nicer bottle, and refusing to spend it is the entire premise of this file.
  //
  // Greedy on needs-gained per rupee, one swap at a time, until nothing
  // affordable gains anything. Optional steps are never upgraded: money that
  // could improve a sunscreen does not go on a better toner.
  const answers = (p: RecommendedProduct) => p.profileKeys.filter((k) => needs.has(k)).length;
  for (let guard = 0; guard < 12; guard++) {
    let best: { at: number; to: RecommendedProduct; value: number } | null = null;
    picks.forEach((pick, at) => {
      const d = defs.find((x) => x.role === pick.role);
      if (!d || d.tier === 'optional') return;
      const have = answers(pick.product);
      for (const cand of forRole(d)) {
        const extra = cost(cand) - pick.monthlyInr;
        const gain = answers(cand) - have;
        if (cand.id === pick.product.id || extra <= 0 || gain <= 0 || extra > left()) continue;
        const value = gain / extra;
        if (!best || value > best.value) best = { at, to: cand, value };
      }
    });
    if (!best) break;
    const { at, to } = best as { at: number; to: RecommendedProduct };
    const was = picks[at];
    spent += cost(to) - was.monthlyInr;
    picks[at] = toPick(to, was.role, was.tier);
  }

  // ── 4. optional, only where it answers something ────────────────────────
  for (const d of defs.filter((x) => x.tier === 'optional')) {
    const already = covered();
    const unmet = (p: RecommendedProduct) => p.profileKeys.some((k) => needs.has(k) && !already.has(k));
    const candidates = [...forRole(d)].filter(unmet).sort(byValue);
    const p = candidates.find((c) => cost(c) <= left());
    if (p) take(p, d.role, d.tier);
    else if (forRole(d).length) {
      leftOut.push({
        role: d.role, tier: d.tier,
        why: candidates.length
          ? `A ${d.role.toLowerCase()} step would fit your profile but not this budget.`
          : `You don't need a separate ${d.role.toLowerCase()} step — what you already have covers it.`,
      });
    }
  }

  // What somebody with room to spare could consider, offered and never taken.
  const chosen = new Set(picks.map((x) => x.product.id));
  const upgrades = defs
    .filter((d) => !picks.some((x) => x.role === d.role))
    .flatMap((d) => [...forRole(d)].filter((p) => !chosen.has(p.id)).sort(byMatch).slice(0, 1).map((p) => toPick(p, d.role, d.tier)))
    .filter((u) => u.monthlyInr <= left());

  return {
    category, budgetInr: budget, picks,
    monthlyInr: spent,
    remainingInr: Math.max(0, budget - spent),
    minimumInr: short ? floorCost : null,
    leftOut, upgrades,
  };
}

export interface BudgetPlan {
  face: CategoryPlan; hair: CategoryPlan; body: CategoryPlan;
  totalBudgetInr: number; totalMonthlyInr: number; totalRemainingInr: number;
}

export function planWithinBudget(
  all: RecommendedProduct[], budgets: CategoryBudgets, needs: Iterable<string>,
): BudgetPlan {
  const need = new Set(needs);
  const face = planCategory(all, 'face', budgets.face, need);
  const hair = planCategory(all, 'hair', budgets.hair, need);
  const body = planCategory(all, 'body', budgets.body, need);
  return {
    face, hair, body,
    totalBudgetInr: face.budgetInr + hair.budgetInr + body.budgetInr,
    totalMonthlyInr: face.monthlyInr + hair.monthlyInr + body.monthlyInr,
    totalRemainingInr: face.remainingInr + hair.remainingInr + body.remainingInr,
  };
}
