import type { RecommendedProduct } from './beauty-engine';
import { lastsLabel, monthlyCostInr, monthsOfUse, packLabel } from './monthly-cost';

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

/**
 * The range the sliders offer, and zero is inside it.
 *
 * ZERO IS AN ANSWER, NOT AN UNSET VALUE. Somebody who already has a body wash
 * and a lotion they like should be able to say "spend nothing here" and be
 * taken at their word — no body band, no body products, no nagging. It reads
 * differently from `null`, which still means the budget has never been set and
 * gates the routine entirely.
 */
export const BUDGET_MIN = 0;
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
  /** The citizen set this category to zero. Not "we found nothing" — they said
   *  not to. Nothing is planned, nothing is listed, nothing is suggested. */
  skipped: boolean;
  picks: Pick_[];
  monthlyInr: number;
  remainingInr: number;
  /** How far over the budget itself the routine went, inside the 5% headroom.
   *  Zero almost always; never more than `ceilingInr - budgetInr`. */
  overInr: number;
  /** B × 0.90 — under this the routine is lean and has to say why. */
  targetLowInr: number;
  /** B × 1.05 — the hard stop. Nothing is chosen that crosses it. */
  ceilingInr: number;
  /** Set only when the budget cannot carry the essentials: what it would take. */
  minimumInr: number | null;
  /** The best compatible routine we could build if the ceiling were lifted, set
   *  ONLY when that costs more than the ceiling allows. Offered, never taken. */
  idealInr: number | null;
  /** Set when the routine finished under the target floor: the sentence saying
   *  why nothing else was added. */
  leanReason: string | null;
  /** Roles deliberately not included, each with the sentence to show. */
  leftOut: LeftOut[];
  /** Things worth considering with money left over — never auto-added. */
  upgrades: Pick_[];
}

/**
 * ── THE BUDGET IS A TARGET, NOT ONLY A CEILING ──────────────────────────────
 *
 * The first version of this planner treated the number as a limit and nothing
 * else: cheapest compatible product for every role, stop. It was never over
 * budget and it was frequently absurd — a ₹5,000 face budget answered with a
 * ₹1,108 routine, twenty-two per cent of what somebody had set aside, while
 * better-matched products for the very same steps sat on the shelf unbought.
 * "Never over" is only half of a budget. The other half is that the money was
 * put aside to be used.
 *
 * SO THE OBJECTIVE IS A RANGE, and it is applied to face, hair and body
 * separately — a face budget never covers for a hair one:
 *
 *     TARGET   B × 0.90 … B                as close to B as the shelf allows
 *     HEADROOM up to B × 1.05              only for a meaningfully better match
 *     CEILING  B × 1.05                    never crossed, for any reason
 *
 * AND THE ORDER OF THE OBJECTIVES IS NOT NEGOTIABLE. Compatibility, then
 * effectiveness, then whether the step is needed at all, then using the budget,
 * then value for money. Budget utilisation is FOURTH. A compatible ₹3,200
 * routine beats an incompatible ₹4,900 one and the arithmetic must never be
 * allowed to argue otherwise — which is why every candidate here comes from the
 * matched pool and no rule below ever relaxes that.
 *
 * WHAT THIS DOES NOT DO is buy things to flatten the number. Reaching the target
 * has exactly two honest instruments: a BETTER PRODUCT for a step already in the
 * routine, and a COMPATIBLE STEP the routine does not have yet. If both run out
 * before B × 0.90, the plan stops there and says so in `leanReason` rather than
 * padding itself to look thorough. A twenty-five per cent floor is named below
 * as the point at which stopping deserves an explanation — never as a quota.
 */
export const TARGET_LOW = 0.90;
export const TARGET_CEILING = 1.05;
/**
 * Under a quarter of the budget, "we found something cheaper" stops being an
 * answer and starts being a failure to look. It changes no arithmetic — passes
 * 4 and 5 already push toward 0.90 — but it marks the line under which the plan
 * owes the citizen a sentence, and it is what the test asserts against.
 */
export const MIN_UTILISATION = 0.25;

const cost = (p: RecommendedProduct) => monthlyCostInr(p);

/** Cheapest per month first; a tie goes to the better profile match. Used for
 *  the floor, where the only question is whether a routine is possible at all. */
const byValue = (a: RecommendedProduct, b: RecommendedProduct) =>
  cost(a) - cost(b) || b.matchScore - a.matchScore;

const toPick = (product: RecommendedProduct, role: string, tier: Tier): Pick_ =>
  ({ product, role, tier, monthlyInr: cost(product), monthsOfUse: monthsOfUse(product) });

/**
 * Plan one category against one monthly budget.
 *
 * SIX PASSES, in this order, and the order IS the policy — it is the objective
 * ranking written as control flow, so budget utilisation cannot get in front of
 * compatibility by accident:
 *
 *   1. FLOOR      the cheapest compatible product for every essential role. Its
 *                 only job is to establish that a routine is possible at all and
 *                 what the minimum costs; passes 4 and 5 improve on it. If it
 *                 does not fit, the budget is short and the plan says so.
 *   2. TREAT      the high-value role, at the BEST-matched product that answers
 *                 something the assessment actually found.
 *   3. NEED       optional roles that answer a need nothing chosen covers. Still
 *                 necessity, not utilisation — these go in at any budget.
 *   4. BETTER     upgrade what is already there to the most effective compatible
 *                 product for the same step. Effectiveness outranks value for
 *                 money, so this runs before anything is ADDED and it runs
 *                 whether or not the routine is under target.
 *   5. FULLER     and only now, and only while under B × 0.90: add compatible
 *                 steps the routine does not have yet, best-matched first. This
 *                 is the one pass the budget target drives, it is last, and it
 *                 stops the moment the target is reached.
 *   6. HONEST     if the result is still under target, work out whether that is
 *                 because the shelf ran out — and say so instead of padding.
 *
 * Nothing in 4 or 5 may cross B × 1.05. Where the best possible routine costs
 * more than that, `idealInr` carries the figure and the citizen is asked.
 */
export function planCategory(
  all: RecommendedProduct[], category: BudgetCategory, budgetInr: number, needs: Set<string>,
): CategoryPlan {
  const budget = clampBudget(budgetInr);

  // A ZERO BUDGET IS A DECISION AND IT IS OBEYED IN FULL. Not "the cheapest
  // thing we could find", not a list of what they are missing out on — an
  // empty plan, and the page leaves the whole band out. Offering products to
  // somebody who has just said they do not want to spend anything here is the
  // shop reflex this feature exists to refuse.
  if (budget === 0) {
    return {
      category, budgetInr: 0, skipped: true, picks: [], monthlyInr: 0,
      remainingInr: 0, overInr: 0, targetLowInr: 0, ceilingInr: 0,
      minimumInr: null, idealInr: null, leanReason: null, leftOut: [], upgrades: [],
    };
  }

  const targetLow = Math.round(budget * TARGET_LOW);
  const ceiling = Math.round(budget * TARGET_CEILING);

  // COMPATIBILITY IS THE GATE AND NOTHING BELOW REOPENS IT. Everything from
  // here is chosen out of `pool`, which is this category's matched products and
  // only those. No pass widens it to reach a number.
  const pool = all.filter((p) => categoryOf(p.group) === category && p.matched);
  const defs = ROLES[category];
  const forRole = (d: RoleDef) => pool.filter((p) => d.match.test(p.category));

  /**
   * EFFECTIVENESS FIRST, MONEY LAST — the comparator that carries the whole
   * objective ranking. How many of THIS person's findings the product answers,
   * then how well it matches their profile, and only then the price. The old
   * comparator led with cost, which is how a ₹5,000 budget produced a ₹1,108
   * routine: every tie, and there are many, went to the cheaper bottle.
   */
  const answers = (p: RecommendedProduct) => p.profileKeys.filter((k) => needs.has(k)).length;
  const byEffect = (a: RecommendedProduct, b: RecommendedProduct) =>
    answers(b) - answers(a) || b.matchScore - a.matchScore || cost(a) - cost(b);
  /** Strictly more effective — not "different", and not "dearer". */
  const better = (cand: RecommendedProduct, cur: RecommendedProduct) =>
    answers(cand) > answers(cur) || (answers(cand) === answers(cur) && cand.matchScore > cur.matchScore);

  const picks: Pick_[] = [];
  const leftOut: LeftOut[] = [];
  let spent = 0;
  const left = () => budget - spent;
  /** What is still spendable, which is against the CEILING, not the budget. */
  const room = () => ceiling - spent;
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
      .sort(byEffect);
    const p = candidates.find((c) => cost(c) <= room());
    if (p) take(p, d.role, d.tier);
    else if (candidates.length) {
      const cheapest = [...candidates].sort(byValue)[0];
      leftOut.push({ role: d.role, tier: d.tier, why: `We haven't included a ${d.role.toLowerCase()} step — the cheapest one that suits you is about ₹${cost(cheapest).toLocaleString('en-IN')} a month and would push you over.` });
    }
  }

  // ── 3. an optional step that answers something nothing else does ────────
  for (const d of defs.filter((x) => x.tier === 'optional')) {
    const already = covered();
    const unmet = (p: RecommendedProduct) => p.profileKeys.some((k) => needs.has(k) && !already.has(k));
    const candidates = [...forRole(d)].filter(unmet).sort(byEffect);
    const p = candidates.find((c) => cost(c) <= room());
    if (p) take(p, d.role, d.tier);
  }

  // ── 4. better before more ───────────────────────────────────────────────
  //
  // THE MONEY GOES ON THE STEPS YOU ARE ALREADY TAKING BEFORE IT GOES ON NEW
  // ONES. A better-matched sunscreen for a step you use every morning is worth
  // more than a fifth product, and this ordering is what stops a generous budget
  // turning into a longer list rather than a better one.
  //
  // A swap must be STRICTLY more effective — more of this person's findings
  // answered, or the same number at a better profile match. Equal effectiveness
  // never justifies a higher price: that is value for money, ranked fifth, and
  // it is the tie-breaker inside `byEffect`. The greedy takes the biggest gain
  // first and, between equal gains, the cheaper one.
  for (let guard = 0; guard < 24; guard++) {
    let best: { at: number; to: RecommendedProduct; gain: number; extra: number } | null = null;
    picks.forEach((pick, at) => {
      const d = defs.find((x) => x.role === pick.role);
      if (!d) return;
      for (const cand of forRole(d)) {
        if (cand.id === pick.product.id) continue;
        const extra = cost(cand) - pick.monthlyInr;
        if (extra > room()) continue;
        if (!better(cand, pick.product)) continue;
        // Findings answered dominate; profile match breaks ties within them.
        const gain = (answers(cand) - answers(pick.product)) * 1000 + (cand.matchScore - pick.product.matchScore);
        if (!best || gain > best.gain || (gain === best.gain && extra < best.extra)) best = { at, to: cand, gain, extra };
      }
    });
    if (!best) break;
    const { at, to } = best as { at: number; to: RecommendedProduct };
    const was = picks[at];
    spent += cost(to) - was.monthlyInr;
    picks[at] = toPick(to, was.role, was.tier);
  }

  // ── 5. and only now, fuller ─────────────────────────────────────────────
  //
  // THE ONLY PASS THE TARGET DRIVES, and it is last on purpose. It adds
  // compatible steps this routine does not have — a toner, a weekly mask, a
  // hand cream — best-matched first, and it stops the instant the routine
  // reaches B × 0.90. It cannot invent a step that isn't in ROLES, it cannot
  // take anything outside the matched pool, and it cannot cross the ceiling.
  //
  // If it runs out of roles before it reaches the target, that is the answer.
  // Pass 6 explains it; nothing here pads.
  const openRoles = () => defs.filter((d) => !picks.some((x) => x.role === d.role));
  while (spent < targetLow) {
    let added = false;
    for (const d of openRoles()) {
      const cand = [...forRole(d)].sort(byEffect).find((c) => cost(c) <= room());
      if (cand) { take(cand, d.role, d.tier); added = true; break; }
    }
    if (!added) break;
  }

  // ── 5b. the premium alternative ─────────────────────────────────────────
  //
  // THE SECOND HONEST WAY TO USE A BUDGET, and the only one left once every
  // compatible step is already in the routine. The catalogue carries the
  // owner's own price grade — Budget, Mid-range, Premium — and a higher grade
  // is a better-made version of the same step: a formulation with more in it,
  // a cleaner base, a brand that stands behind it. Somebody who set aside
  // ₹5,000 for their face and is being handed a ₹1,437 routine of budget-grade
  // products has not been served well by "we found something cheaper".
  //
  // THREE CONDITIONS, ALL OF THEM, and they are what keep this from being
  // spending for its own sake:
  //   · UNDER TARGET. The moment the routine reaches B × 0.90 this stops. A
  //     budget that is being used does not get upgraded to be used harder.
  //   · NEVER LESS SUITABLE. The candidate must answer at least as many of this
  //     person's findings and match their profile at least as well. A premium
  //     product that suits them less is not an upgrade at any price — this is
  //     the clause that stops the target dragging the shelf out of shape.
  //   · A REAL GRADE JUMP. Dearer is not the test; the grade is. Two Mid-range
  //     moisturisers at ₹196 and ₹640 are the same class of product and the
  //     ₹444 buys a bigger bottle of the same idea.
  //
  // THE SMALLEST QUALIFYING STEP IS TAKEN, EVERY TIME, and that rule is worth
  // more than it looks. Choosing whichever single swap landed CLOSEST TO THE
  // BUDGET — the obvious greedy, and the first thing written here — put a
  // ₹3,300-a-month sunscreen in a ₹5,000 face routine, because one enormous
  // move hits the number faster than five sensible ones. Climbing in the
  // smallest increments available spreads the money across the steps somebody
  // actually uses and stops the instant the target is met, which is the
  // difference between a better routine and an expensive one.
  //
  // NO STEP MAY TAKE MORE THAN HALF THE CATEGORY. A routine where one product
  // is most of the bill is not a routine, it is a purchase with four accessories
  // — and it is precisely what an optimiser aiming at a number will produce if
  // nothing forbids it. The floor passes are exempt: if the only compatible
  // sunscreen costs that much, that is the routine, and it is not this pass's
  // doing.
  const GRADE: Record<string, number> = { Budget: 0, 'Mid-range': 1, Premium: 2 };
  const grade = (p: RecommendedProduct) => GRADE[p.tier] ?? 0;
  const shareCap = budget * 0.5;
  for (let guard = 0; guard < 24 && spent < targetLow; guard++) {
    let best: { at: number; to: RecommendedProduct; step: number } | null = null;
    picks.forEach((pick, at) => {
      const d = defs.find((x) => x.role === pick.role);
      if (!d) return;
      for (const cand of forRole(d)) {
        if (cand.id === pick.product.id) continue;
        if (grade(cand) <= grade(pick.product)) continue;
        if (answers(cand) < answers(pick.product) || cand.matchScore < pick.product.matchScore) continue;
        if (cost(cand) > shareCap) continue;
        const after = spent - pick.monthlyInr + cost(cand);
        if (after > ceiling || after <= spent) continue;
        const step = after - spent;
        if (!best || step < best.step) best = { at, to: cand, step };
      }
    });
    if (!best) break;
    const { at, to } = best as { at: number; to: RecommendedProduct };
    const was = picks[at];
    spent += cost(to) - was.monthlyInr;
    picks[at] = toPick(to, was.role, was.tier);
  }

  // ── 6. what is not here, and why ────────────────────────────────────────
  //
  // Written AFTER everything, because a role talked about in pass 2 or 3 may
  // well have gone in during pass 5 and a plan that lists a product it also
  // contains is a plan nobody will trust again.
  for (const d of openRoles()) {
    if (leftOut.some((l) => l.role === d.role)) continue;
    const any = forRole(d);
    if (!any.length) continue;
    const cheapest = [...any].sort(byValue)[0];
    leftOut.push({
      role: d.role, tier: d.tier,
      why: cost(cheapest) > room()
        ? `A ${d.role.toLowerCase()} step would fit your profile but not this budget.`
        : `You don't need a separate ${d.role.toLowerCase()} step — what you already have covers it.`,
    });
  }
  const stale = new Set(picks.map((x) => x.role));
  const trimmed = leftOut.filter((l) => !stale.has(l.role));

  /**
   * THE BEST ROUTINE THERE IS, priced — the most effective compatible product
   * for every role this shelf can fill. Reported ONLY when it costs more than
   * the ceiling allows, and even then only as a question: "your ideal routine
   * is ₹5,400, your budget is ₹5,000". Never taken. Crossing B × 1.05 is
   * something only the citizen can authorise, and they authorise it by moving
   * the number themselves.
   */
  const idealInr = (() => {
    if (short) return null;   // one ask at a time; the short budget owns this card
    const full = defs.reduce((n, d) => {
      const best = [...forRole(d)].sort(byEffect)[0];
      return n + (best ? cost(best) : 0);
    }, 0);
    return full > ceiling ? full : null;
  })();

  /**
   * WHY IT STOPPED SHORT — and it has to be a real reason, not a shrug. By the
   * time this runs, passes 4 and 5 have both run out: there is no compatible
   * product for any step that is more effective than the one chosen, and no
   * compatible step left to add. Saying that plainly is the alternative to
   * spending the rest on things this person does not need.
   */
  const leanReason = !short && spent < targetLow
    ? `Your ${category} routine comes to ₹${spent.toLocaleString('en-IN')}/month against a ₹${budget.toLocaleString('en-IN')} budget. We haven't added more — nothing else that suits your profile would add enough to be worth the money.`
    : null;

  // What somebody could consider anyway, offered and never taken.
  const chosen = new Set(picks.map((x) => x.product.id));
  const upgrades = openRoles()
    .flatMap((d) => [...forRole(d)].filter((p) => !chosen.has(p.id)).sort(byEffect).slice(0, 1).map((p) => toPick(p, d.role, d.tier)))
    .filter((u) => u.monthlyInr <= room());

  return {
    category, budgetInr: budget, skipped: false, picks,
    monthlyInr: spent,
    remainingInr: Math.max(0, budget - spent),
    overInr: Math.max(0, spent - budget),
    targetLowInr: targetLow,
    ceilingInr: ceiling,
    minimumInr: short ? floorCost : null,
    idealInr,
    leanReason,
    leftOut: trimmed, upgrades,
  };
}

export interface BudgetPlan {
  face: CategoryPlan; hair: CategoryPlan; body: CategoryPlan;
  totalBudgetInr: number; totalMonthlyInr: number; totalRemainingInr: number;
}

/**
 * ── THE PLAN AS IT GOES OVER THE WIRE ───────────────────────────────────────
 *
 * A `Pick_` holds the whole `RecommendedProduct` because the planner needs it —
 * tags, profileKeys, match score, price. None of that is any use to the page,
 * and sending it means every chosen product is serialised twice: once inside
 * the plan and once inside the routine band that shows it.
 *
 * Worse than the weight, it was a LIE ABOUT THE SHAPE. The client's type said
 * `{ productId }` and the server sent `{ product: {...} }`; nothing broke only
 * because the one field the page read was `skipped`. The moment anything tried
 * to join the plan to a step it would have joined on `undefined` and quietly
 * shown nothing — the same failure as the budget-key collision, one layer up.
 * So the shape the client declares is the shape the server builds, here, in one
 * function, with a test that fails if a `product` object ever reappears.
 *
 * THE TWO PHRASES TRAVEL WITH IT. "≈ 3 months" and "100 ml" are judgements made
 * in monthly-cost.ts — weeks below two months, halves above, the pack size read
 * off the product's own name. Recomputing them in the browser would be a second
 * copy of that judgement, and the two would disagree the first time either was
 * corrected. The client formats rupees and nothing else.
 */
export interface WirePick {
  productId: string; name: string; role: string; tier: Tier;
  monthlyInr: number; monthsOfUse: number;
  /** "100 ml" — what is printed on the pack, or '' if the name never said. */
  packLabel: string;
  /** "about 6 weeks" · "about 2½ months" — how long one pack lasts. */
  lastsLabel: string;
}

export interface WireCategoryPlan {
  category: BudgetCategory; budgetInr: number; skipped: boolean;
  monthlyInr: number; remainingInr: number; overInr: number;
  targetLowInr: number; ceilingInr: number;
  minimumInr: number | null; idealInr: number | null; leanReason: string | null;
  picks: WirePick[]; leftOut: LeftOut[]; upgrades: WirePick[];
}

export interface WireBudgetPlan {
  face: WireCategoryPlan; hair: WireCategoryPlan; body: WireCategoryPlan;
  totalBudgetInr: number; totalMonthlyInr: number; totalRemainingInr: number;
}

const wirePick = (x: Pick_): WirePick => ({
  productId: x.product.id,
  name: x.product.name,
  role: x.role,
  tier: x.tier,
  monthlyInr: x.monthlyInr,
  monthsOfUse: x.monthsOfUse,
  packLabel: packLabel(x.product.name),
  lastsLabel: lastsLabel(x.monthsOfUse),
});

const wireCategory = (c: CategoryPlan): WireCategoryPlan => ({
  category: c.category, budgetInr: c.budgetInr, skipped: c.skipped,
  monthlyInr: c.monthlyInr, remainingInr: c.remainingInr, overInr: c.overInr,
  targetLowInr: c.targetLowInr, ceilingInr: c.ceilingInr,
  minimumInr: c.minimumInr, idealInr: c.idealInr, leanReason: c.leanReason,
  picks: c.picks.map(wirePick),
  leftOut: c.leftOut,
  upgrades: c.upgrades.map(wirePick),
});

export function planForWire(plan: BudgetPlan): WireBudgetPlan {
  return {
    face: wireCategory(plan.face),
    hair: wireCategory(plan.hair),
    body: wireCategory(plan.body),
    totalBudgetInr: plan.totalBudgetInr,
    totalMonthlyInr: plan.totalMonthlyInr,
    totalRemainingInr: plan.totalRemainingInr,
  };
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
