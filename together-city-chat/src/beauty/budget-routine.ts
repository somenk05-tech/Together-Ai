import type { RecommendedProduct } from './beauty-engine';
import { lastsLabel, monthlyCostInr, monthsOfUse, packLabel } from './monthly-cost';
import { FAMILY_LABEL, overlapRefusal } from './active-families';

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
/**
 * ── ₹8,000 A CATEGORY, AND IT USED TO BE ₹60,000 ────────────────────────────
 *
 * A slider is a claim about the range of sensible answers. ₹60,000 for a face
 * was not one: measured across three profiles, the dearest routine this shelf
 * can build in which every step is still a better-or-equal match tops out at
 * ₹7,144, ₹8,484 and ₹6,722 — and hair at under ₹1,000. Everything above that
 * was a number the citizen could set and the engine could never honestly
 * spend, which is how a ₹17,600 hair budget came to sit on the routine page
 * next to a ₹1,105 hair routine and read as a failure.
 *
 * IT IS A FLAT NUMBER RATHER THAN THE PER-PROFILE MAXIMUM, and that is the
 * owner's call and the better one. `usefulMaxInr` is computed per person and
 * printed on the routine, but a SLIDER whose end moves when you change your
 * skin type is a control nobody can learn — and it would leak the shelf's
 * shape into a form the citizen fills in before we have priced anything.
 * ₹8,000 sits above every useful maximum measured and below the absurd.
 *
 * A STORED BUDGET ABOVE IT IS CLAMPED ON READ, not migrated. Somebody who set
 * ₹17,600 for hair sees ₹8,000 and a routine built against it, which is the
 * same routine they were already getting.
 */
export const BUDGET_MAX = 8000;

export const clampBudget = (n: number): number =>
  Math.min(BUDGET_MAX, Math.max(BUDGET_MIN, Math.round(Number.isFinite(n) ? n : BUDGET_MIN)));

/**
 * The three groups that are BANDS OF A ROUTINE. The shelf also carries Makeup,
 * Fragrance and Tools, and they are not steps — you do not apply a beard
 * trimmer after your serum.
 *
 * This set exists because `categoryOf` used to send everything that was not
 * hair or body to 'face', and that was safe only while the shelf held nothing
 * but skincare, haircare and body care. The 2026-08 catalogue put 446 makeup,
 * fragrance and tool products on it, 27 of which score as `matched`, and every
 * one of those was landing in the FACE skincare budget — competing for the same
 * rupees as a cleanser, and counted against the cap that stops one product
 * eating the routine. A lipstick is not a skincare purchase and a citizen's
 * face budget should never have been asked to carry one.
 */
export const ROUTINE_GROUPS: ReadonlySet<string> = new Set(['Skincare', 'Hair Care', 'Body Care']);

/** Whether a product belongs in a routine at all. */
export const isRoutineProduct = (group: string): boolean => ROUTINE_GROUPS.has(group);

/** Which budget a product is charged to — its group, never the band it lands in.
 *  A face mask and a shampoo share the weekly band and nothing else.
 *  Returns null for a product no routine has a place for. */
export const categoryOf = (group: string): BudgetCategory | null =>
  group === 'Hair Care' ? 'hair' : group === 'Body Care' ? 'body' : group === 'Skincare' ? 'face' : null;

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

/**
 * ── WHAT THEY TOLD US THEY ALREADY USE ──────────────────────────────────────
 *
 * The profile has asked "Current routine — what you use now" since it was
 * written, offers twelve chips, stores the answer, and NOTHING HAS EVER READ
 * IT. Measured on the shipped planner: a citizen who ticks Face Cleanser,
 * Moisturizer and Sunscreen is sold all three again — ₹1,785 a month against
 * roles they have just said are covered.
 *
 * IT IS A CATEGORY, NOT A PRODUCT, AND THAT DECIDES WHAT WE MAY DO WITH IT.
 * "Face Cleanser" does not say which one, so the engine cannot judge whether
 * theirs suits them; claiming it can would be the keyword derivation problem
 * with somebody's face on the end of it. So an owned role is not asserted to be
 * a GOOD choice — it is only not bought again, and the money is not spent
 * elsewhere to compensate. That is the whole of what the data supports.
 *
 * Exfoliator is deliberately absent. There is no exfoliating ROLE in this
 * planner — the closest thing is a weekly mask, and quietly treating one as the
 * other would tell somebody their mask is covered because they own an acid.
 */
const OWNED_ROLE: Record<BudgetCategory, Record<string, string>> = {
  face: {
    'face cleanser': 'Cleanse', moisturizer: 'Moisturise', moisturiser: 'Moisturise',
    sunscreen: 'Protect', serum: 'Treat', toner: 'Prep', 'face mask': 'Weekly',
  },
  hair: {
    'hair shampoo': 'Wash', shampoo: 'Wash', conditioner: 'Condition',
    // Both answer the one treat step: a citizen with a weekly mask and a
    // pre-wash oil has that step covered twice over, not half.
    'hair oil': 'Treat', 'hair mask': 'Treat', 'hair serum': 'Finish',
  },
  body: {},
};

/** The chips a citizen ticked → the roles this category should not buy again. */
export function ownedRoles(category: BudgetCategory, declared: readonly string[]): Set<string> {
  const map = OWNED_ROLE[category] ?? {};
  const out = new Set<string>();
  for (const d of declared) {
    const role = map[String(d ?? '').trim().toLowerCase()];
    if (role) out.add(role);
  }
  return out;
}

/**
 * What the step is CALLED, for the sentence about it.
 *
 * "You already use one cleanse step" is the role name doing a noun's job.
 * People own a cleanser, not a Cleanse. Keyed by category as well as role
 * because Treat, Wash and Moisturise each mean two different objects.
 */
const KEPT_NOUN: Record<string, string> = {
  'face:Cleanse': 'a cleanser', 'face:Moisturise': 'a moisturiser', 'face:Protect': 'a sunscreen',
  'face:Treat': 'a serum', 'face:Prep': 'a toner', 'face:Weekly': 'a face mask',
  'hair:Wash': 'a shampoo', 'hair:Condition': 'a conditioner',
  'hair:Treat': 'a hair oil or mask', 'hair:Finish': 'a hair serum',
};

/** A step the citizen already has, named so the routine can say so. */
export interface Kept { role: string; tier: Tier; why: string }

/** Why a role that could have been in the plan is not. */
export interface LeftOut { role: string; tier: Tier; why: string }

export interface Pick_ {
  product: RecommendedProduct;
  role: string;
  tier: Tier;
  /** What it costs to buy — the unit the budget is set and spent in. */
  priceInr: number;
  /** What it costs to keep, once the pack's life is spread over the months it
   *  lasts. Shown beside the price; never used to decide anything. */
  monthlyInr: number;
  monthsOfUse: number;
  /** Set on an OFFER, never on a chosen step: the sentence saying what spending
   *  this would and would not buy. An offer without one does not get made. */
  reason?: string;
}

export interface CategoryPlan {
  category: BudgetCategory;
  budgetInr: number;
  /** The citizen set this category to zero. Not "we found nothing" — they said
   *  not to. Nothing is planned, nothing is listed, nothing is suggested. */
  skipped: boolean;
  picks: Pick_[];
  /** What this routine costs to buy — what the budget is measured against. */
  spendInr: number;
  /** What it costs to keep, per month. Reported, never spent against. */
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
  /** Roles the citizen said they already have. Not bought, not charged, and
   *  not silently dropped either — the routine still names the step. */
  kept: Kept[];
  /** The most this profile can absorb without taking a worse-matched product.
   *  A budget above it is money this shelf cannot honestly spend. */
  usefulMaxInr: number;
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
 * THE BAND OUTRANKS THE SCORE — owner's call, 16 Aug, reversing the 15-Aug
 * position. Reaching the target has three instruments, in order: a BETTER
 * PRODUCT for a step already in the routine, a COMPATIBLE STEP the routine
 * does not have yet, and — pass 5d — a DEARER PRODUCT that keeps every
 * covered need covered even where its match score is lower. The first two
 * run to exhaustion before the third is allowed a rupee, so fit is only ever
 * given up when nothing better can absorb the money. Compatibility, safety,
 * the share cap and the ceiling still bow to nothing. If even that shelf
 * runs out before B × 0.95, the plan stops and `leanReason` says why.
 */
/**
 * ── THE BAND ────────────────────────────────────────────────────────────────
 *
 * B × 0.95 … B × 1.05. The owner's acceptance criterion, and it replaces a
 * 0.90 floor that was only ever half-believed.
 *
 * THE OBJECTION THIS SURVIVED, because it is the reason the rule has the shape
 * it has. Measured on the 226-product shelf, an oily/acne profile at a ₹5,000
 * face budget: the routine the engine chose cost ₹1,275 a month, and climbing
 * toward ₹4,750 by taking the smallest dearer option each time reached ₹1,425
 * after twelve swaps and answered FEWER of her findings — 14 down to 13 — while
 * the match score fell from 427 to 412. Every cheap step up was a worse product.
 * The dearest routine of any kind cost ₹17,473 and answered ten of her findings
 * against fourteen.
 *
 * So a band enforced over the whole shelf buys worse skin. The band enforced
 * over the NON-INFERIOR shelf does not: the dearest routine in which every
 * product is at least as well matched as the cheap one it replaces costs
 * ₹4,874 a month for that same profile — inside the band, and nowhere worse.
 * That is the number the pass below climbs to, and the ceiling the dial is
 * capped at, and they are the same number for the same reason.
 */
export const TARGET_LOW = 0.95;
export const TARGET_CEILING = 1.05;
/**
 * Under a quarter of the budget, "we found something cheaper" stops being an
 * answer and starts being a failure to look. It changes no arithmetic — passes
 * 4 and 5 already push toward 0.90 — but it marks the line under which the plan
 * owes the citizen a sentence, and it is what the test asserts against.
 */
export const MIN_UTILISATION = 0.25;

/**
 * ── WHAT THE BUDGET IS DENOMINATED IN, AND IT IS THE PRICE ON THE BOTTLE ────
 *
 * This was the amortised monthly cost, and the argument for it was good: a
 * ₹3,200 cleanser lasting four months and a ₹800 serum lasting three weeks are
 * not a ₹4,000 problem. It is still true, and the routine still prints it —
 * "₹474 · ≈ ₹158/month · one 50 ml pack, about 3 months".
 *
 * But it is not what the citizen is setting. Somebody who moves a slider to
 * ₹5,000 is saying what they will hand over, and answering them with a basket
 * costing ₹1,400 because the rest of it is "already paid for in future months"
 * is arithmetic they never agreed to. Owner's call, 15 Aug: the budget is the
 * shopping trip. The monthly figure stays on the page beside it, where it
 * belongs — as the thing that tells them a big jar is cheaper than it looks.
 *
 * ONE LINE, BY DESIGN. Every pass, cap and comparison in this file goes through
 * `cost`, so which unit the plan is built in is a single decision in a single
 * place, and reversible in the same.
 */
const cost = (p: RecommendedProduct) => p.priceInr;

/** Cheapest per month first; a tie goes to the better profile match. Used for
 *  the floor, where the only question is whether a routine is possible at all. */
const byValue = (a: RecommendedProduct, b: RecommendedProduct) =>
  cost(a) - cost(b) || b.matchScore - a.matchScore;

const toPick = (product: RecommendedProduct, role: string, tier: Tier): Pick_ =>
  ({ product, role, tier, priceInr: product.priceInr, monthlyInr: monthlyCostInr(product), monthsOfUse: monthsOfUse(product) });

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
  owned: Set<string> = new Set(),
  /** Set only by usefulMaxInr's own call, to stop the recursion at one level. */
  measuringCeiling = false,
): CategoryPlan {
  const budget = clampBudget(budgetInr);

  // A ZERO BUDGET IS A DECISION AND IT IS OBEYED IN FULL. Not "the cheapest
  // thing we could find", not a list of what they are missing out on — an
  // empty plan, and the page leaves the whole band out. Offering products to
  // somebody who has just said they do not want to spend anything here is the
  // shop reflex this feature exists to refuse.
  if (budget === 0) {
    return {
      category, budgetInr: 0, skipped: true, picks: [], spendInr: 0, monthlyInr: 0,
      remainingInr: 0, overInr: 0, targetLowInr: 0, ceilingInr: 0,
      minimumInr: null, idealInr: null, leanReason: null, kept: [], usefulMaxInr: 0, leftOut: [], upgrades: [],
    };
  }

  const targetLow = Math.round(budget * TARGET_LOW);
  const ceiling = Math.round(budget * TARGET_CEILING);

  // COMPATIBILITY IS THE GATE AND NOTHING BELOW REOPENS IT. Everything from
  // here is chosen out of `pool`, which is this category's matched products and
  // only those. No pass widens it to reach a number.
  const pool = all.filter((p) => categoryOf(p.group) === category && p.matched);
  /**
   * A ROLE THEY ALREADY HAVE IS NOT A ROLE THIS PLAN FILLS. Removing it from
   * `defs` rather than filtering at each pass is deliberate: six passes and the
   * `openRoles`/`idealInr`/`upgrades` derivations all read `defs`, and a rule
   * applied in five of eight places is a rule that comes back.
   */
  const defs = ROLES[category].filter((d) => !owned.has(d.role));
  const kept: Kept[] = ROLES[category].filter((d) => owned.has(d.role)).map((d) => ({
    role: d.role, tier: d.tier,
    // "…and we haven't moved the money onto something else either" until
    // 16 Aug — the band-first rule reversed exactly that half of the sentence,
    // so it came off rather than stay and lie: the budget is spent toward its
    // band across the roles that remain. The half that holds, holds: a chip
    // is a category, not a product, and we never buy a second one.
    why: `You told us you already have ${KEPT_NOUN[`${category}:${d.role}`] ?? 'this'}, so we haven't bought you another — the budget goes toward the rest of your ${category} routine instead.`,
  }));
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
  /**
   * ── COVERAGE IS A PROPERTY OF THE ROUTINE, NOT OF A PRODUCT ─────────────
   *
   * `answers()` counts how many of this person's findings ONE product claims,
   * and the band pass used to require a swap to answer at least as many. That
   * reads as caution and is a category error, because it makes a SPECIALIST
   * unable to replace a GENERALIST however much better it is at its own job.
   *
   * Measured on the live shelf, an oily / blackheads / dark-spots profile:
   * Re'equil's ₹595 sunscreen claims [acne, oil, pigmentation] and answers 3,
   * so nothing dearer could ever displace it — Eucerin's Thiamidol fluid
   * claims [pigmentation] and answers 1, and Thiamidol is one of the few
   * pigmentation actives with published evidence. The routine came out at
   * ₹4,245 of ₹8,000 covering acne four times over, oil five times, and
   * bought no dedicated treatment for the thing she actually asked about.
   *
   * So the question moves up a level: after this swap, is every need the
   * routine covers still covered by SOMETHING? Four other products claiming
   * oil is not a reason to refuse the one product that treats pigmentation.
   * The candidate must still be no worse on the needs it does address, which
   * is what stops this becoming "swap to anything and hope".
   */
  const coverageOf = (set: Pick_[], swapAt?: number, to?: RecommendedProduct) => {
    const c = new Map<string, number>();
    set.forEach((x, i) => {
      const product = i === swapAt && to ? to : x.product;
      for (const k of product.profileKeys) if (needs.has(k)) c.set(k, (c.get(k) ?? 0) + 1);
    });
    return c;
  };
  /** Every need this routine already covers is still covered after the swap. */
  const keepsCoverage = (at: number, to: RecommendedProduct) => {
    const before = coverageOf(picks);
    const after = coverageOf(picks, at, to);
    for (const [k, n] of before) if (n > 0 && (after.get(k) ?? 0) === 0) return false;
    return true;
  };
  /**
   * AND THE ROUTINE AS A WHOLE MAY NOT GET WORSE.
   *
   * Dropping the per-product breadth test alone was not enough: measured, it
   * let the total match score of a face routine FALL as the budget rose, which
   * is the failure this whole file exists to prevent wearing a new hat. Only
   * one product changes in a swap, so "the routine's total does not fall" is
   * `cand.matchScore >= cur.matchScore` — a per-product floor derived from a
   * routine-level promise rather than asserted as one.
   *
   * WHAT THIS STILL CANNOT DO, and it is the same gap as everywhere else. It
   * cannot let a SPECIALIST displace a generalist — Eucerin's Thiamidol fluid
   * claims pigmentation alone and scores below a sunscreen claiming three
   * things, because matchScore's coverage term rewards breadth too. Saying the
   * Thiamidol is the better pigmentation product needs an efficacy field, and
   * there isn't one. So this buys back the swaps that breadth was blocking for
   * no reason, and stops short of the ones that need evidence to justify.
   */
  const routineNoWorse = (cand: RecommendedProduct, cur: RecommendedProduct) =>
    cand.matchScore >= cur.matchScore;

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
    picks.push(pick); spent += pick.priceInr;
  };

  /**
   * ── NO STEP MAY BE MOST OF THE ROUTINE ──────────────────────────────────
   *
   * Half the category budget, and it belongs to EVERY pass that is not the
   * floor — which is what it did not do when it was written. It lived inside
   * pass 5b, next to the greedy upgrade that had produced a ₹3,300-a-month
   * sunscreen, and it was read ever after as "the premium pass's guard".
   *
   * IT WAS NEVER ONLY THE PREMIUM PASS. Pass 5 adds a whole step to reach the
   * target and priced it against the ceiling alone; pass 4 swaps a step for a
   * better one and priced only the DIFFERENCE. Either can put one product most
   * of the way through a small budget, and on this shelf pass 5 did: at a
   * ₹1,000 hair budget it added a ₹680-a-month hair serum on top of a ₹278
   * wash-and-condition routine, because it was the best-matched thing for the
   * one role still open and 680 was under the ceiling. The cap was in the file
   * and the product walked past it.
   *
   * The bug hid for as long as it did because no category had a product dear
   * enough to trip it. Hair topped out at ₹933 sticker until the premium tier
   * was filled in; the first premium hair oil on the shelf found the hole the
   * same afternoon. That is the argument for real data over generated data,
   * written down where the next person will read it.
   *
   * THE FLOOR IS EXEMPT AND HAS TO BE. If the only compatible sunscreen costs
   * more than half the budget, that is the routine — a cap that removed it
   * would be choosing no protection over expensive protection. Everything
   * after the floor is a choice between products, and a choice can be capped.
   */
  const shareCap = budget * 0.5;
  const withinShare = (p: RecommendedProduct) => cost(p) <= shareCap;

  /**
   * ── NO ACTIVE TWICE, AND NOT TOO MANY AT ONCE ───────────────────────────
   *
   * The routine this refuses, measured on the shipped planner at a ₹10,000 face
   * budget for an oily/acne profile: salicylic acid in the moisturiser, in the
   * serum AND in the toner, an AHA-and-walnut-shell mask over the top, and 1%
   * retinol. Five picks, each one individually the best-matched compatible
   * product for its own role, each one individually affordable, and not one line
   * anywhere that looked at the other four. A person cannot use that routine.
   *
   * THE CAP COMES FROM THE CITIZEN'S OWN READING, not from a constant. `redness`
   * is on the needs list precisely when the assessment found reactive skin — a
   * declared sensitive skin type, rosacea or eczema on the medical list, redness
   * in the concerns, or the photograph. Its own note says "patch-test new
   * actives", which has been printed on the profile page since it was written
   * and has never until now changed a single product. One active for a face that
   * is already complaining; two for one that is not.
   *
   * IT IS A LOAD RULE, NOT A CLINICAL ONE. Nothing here claims who reacts to
   * what — it claims that four exfoliants is more than a routine, which is a
   * statement about the routine. Contraindications proper live one folder over,
   * in shared/topical-contraindications.ts, and are applied before this file
   * ever sees the shelf.
   */
  const loadCap = needs.has('redness') ? 1 : 2;
  const usefulMax = measuringCeiling ? 0 : usefulMaxInr(all, category, needs, owned);
  /** Why this candidate cannot join what is already chosen, or null. */
  const clash = (c: RecommendedProduct, exceptAt?: number) =>
    overlapRefusal(c, picks.filter((_, i) => i !== exceptAt).map((x) => x.product), loadCap);

  // ── 1. the floor ────────────────────────────────────────────────────────
  //
  // Chosen sequentially rather than in one map, because the second essential
  // now has to know what the first one took. In clinical order, so a short
  // budget drops the most substitutable step rather than whichever happened to
  // be declared last — and so the overlap rule resolves in favour of the step
  // with no substitute.
  const essentials = defs.filter((d) => d.tier === 'essential');
  const floorPicks: Array<{ d: RoleDef; p: RecommendedProduct }> = [];
  for (const d of [...essentials].sort((a, b) => (a.floor ?? 9) - (b.floor ?? 9))) {
    const ranked = [...forRole(d)].sort(byValue);
    if (!ranked.length) continue;
    // AN ESSENTIAL ROLE IS NEVER LEFT EMPTY BY THIS RULE. If every cleanser on
    // the shelf carries an acid the moisturiser already has, the answer is a
    // cleanser, not a bare face — the same argument that exempts the floor from
    // the share cap. It prefers a clear one and takes the cheapest either way.
    const sofar = floorPicks.map((x) => x.p);
    floorPicks.push({ d, p: ranked.find((c) => !overlapRefusal(c, sofar, loadCap)) ?? ranked[0] });
  }
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
    const p = candidates.find((c) => !clash(c) && withinShare(c) && cost(c) <= room());
    if (p) take(p, d.role, d.tier);
    else if (candidates.length) {
      const cheapest = [...candidates].sort(byValue)[0];
      const blocked = candidates.every((c) => clash(c)) ? clash(candidates[0]) : null;
      // THREE different refusals now, and they deserve three sentences. The
      // budget is full; this one step would eat half of it by itself; or the
      // routine already does this and doing it twice is not doing it better.
      leftOut.push({ role: d.role, tier: d.tier, why: blocked
        ? blocked.kind === 'duplicate'
          ? `We haven't added a separate ${d.role.toLowerCase()} step — your routine already has ${FAMILY_LABEL[blocked.family]} in it, and a second one is not a stronger routine.`
          : `We haven't added a separate ${d.role.toLowerCase()} step — your assessment flags reactive skin, and what you already have asks enough of it for now.`
        : withinShare(cheapest)
          ? `We haven't included a ${d.role.toLowerCase()} step — the cheapest one that suits you is about ₹${cost(cheapest).toLocaleString('en-IN')} a month and would push you over.`
          : `We haven't included a ${d.role.toLowerCase()} step — the cheapest one that suits you is about ₹${cost(cheapest).toLocaleString('en-IN')} a month, which is more than half your ${category} budget on one product.` });
    }
  }

  // ── 3. an optional step that answers something nothing else does ────────
  for (const d of defs.filter((x) => x.tier === 'optional')) {
    const already = covered();
    const unmet = (p: RecommendedProduct) => p.profileKeys.some((k) => needs.has(k) && !already.has(k));
    const candidates = [...forRole(d)].filter(unmet).sort(byEffect);
    const p = candidates.find((c) => !clash(c) && withinShare(c) && cost(c) <= room());
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
        const extra = cost(cand) - pick.priceInr;
        if (extra > room()) continue;
        // The cap is on what the product IS, not on what the swap costs. A
        // ₹3,300 sunscreen replacing a ₹3,200 one is a ₹100 upgrade by this
        // pass's arithmetic and still most of a ₹5,000 routine.
        if (!withinShare(cand)) continue;
        if (!better(cand, pick.product)) continue;
        // Measured against the routine WITHOUT the step being replaced — a
        // salicylic cleanser is not in conflict with the salicylic cleanser it
        // is standing in for.
        if (clash(cand, at)) continue;
        // Findings answered dominate; profile match breaks ties within them.
        const gain = (answers(cand) - answers(pick.product)) * 1000 + (cand.matchScore - pick.product.matchScore);
        if (!best || gain > best.gain || (gain === best.gain && extra < best.extra)) best = { at, to: cand, gain, extra };
      }
    });
    if (!best) break;
    const { at, to } = best as { at: number; to: RecommendedProduct };
    const was = picks[at];
    spent += cost(to) - was.priceInr;
    picks[at] = toPick(to, was.role, was.tier);
  }

  // ── 5. and only now, fuller ─────────────────────────────────────────────
  //
  // THE ONLY PASS THE TARGET DRIVES, and it is last on purpose. It adds
  // compatible steps this routine does not have — a toner, a weekly mask, a
  // hand cream — best-matched first, and it stops the instant the routine
  // reaches B × 0.90. It cannot invent a step that isn't in ROLES, it cannot
  // take anything outside the matched pool, it cannot cross the ceiling, and
  // it cannot spend more than half the category on the step it adds — a whole
  // new product is exactly the shape the share cap exists to refuse, and this
  // pass went without it for as long as the shelf had nothing dear enough.
  //
  // If it runs out of roles before it reaches the target, that is the answer.
  // Pass 6 explains it; nothing here pads.
  const openRoles = () => defs.filter((d) => !picks.some((x) => x.role === d.role));
  while (spent < targetLow) {
    let added = false;
    for (const d of openRoles()) {
      const cand = [...forRole(d)].sort(byEffect).find((c) => !clash(c) && withinShare(c) && cost(c) <= room());
      if (cand) { take(cand, d.role, d.tier); added = true; break; }
    }
    if (!added) break;
  }

  // ── 5c. the band ────────────────────────────────────────────────────────
  //
  // USE THE MONEY, AND NEVER ON A WORSE PRODUCT. The one pass whose purpose is
  // the budget figure itself, and the only reason it is allowed to exist is the
  // constraint on its candidates: a swap may only be to a product that answers
  // AT LEAST as many of this person's findings and matches their profile AT
  // LEAST as well as the one it replaces. Non-inferiority is checked against
  // the CURRENT pick rather than against some global best, so the routine can
  // only ever move sideways or up.
  //
  // That single clause is the difference between this pass and the one it
  // replaces. Pass 5b climbed on `tier`, a price band, and bought a ₹2,517
  // toner to displace a ₹167 one on identical merits. This cannot: if the
  // dearer product is worse matched by even one point it is not a candidate,
  // whatever it costs and however short of the band the routine is.
  //
  // SMALLEST INCREMENT FIRST, for the reason the ₹3,300 sunscreen taught: one
  // enormous move reaches a number faster than five sensible ones, and leaves a
  // routine that is one purchase with four accessories attached. Climbing in
  // the smallest available steps spreads the money over the things she uses.
  //
  // AND IT STOPS WHEN IT RUNS OUT, not when it gives up. If the non-inferior
  // shelf cannot reach B × 0.95, the plan stops there and pass 6 says so — the
  // alternative is buying something worse to hit a number, which is the whole
  // of what this file exists to refuse.
  for (let guard = 0; guard < 40 && spent < targetLow; guard++) {
    let best: { at: number; to: RecommendedProduct; step: number } | null = null;
    picks.forEach((pick, at) => {
      const d = defs.find((x) => x.role === pick.role);
      if (!d) return;
      for (const cand of forRole(d)) {
        if (cand.id === pick.product.id) continue;
        // NON-INFERIOR AT THE ROUTINE LEVEL. Not "answers as many findings" —
        // that locked every specialist out; see coverageOf above.
        if (answers(cand) === 0) continue;
        if (!keepsCoverage(at, cand)) continue;
        if (!routineNoWorse(cand, pick.product)) continue;
        if (!withinShare(cand) || clash(cand, at)) continue;
        const after = spent - pick.priceInr + cost(cand);
        if (after > ceiling || after <= spent) continue;
        const step = after - spent;
        if (!best || step < best.step) best = { at, to: cand, step };
      }
    });
    if (!best) break;
    const { at, to } = best as { at: number; to: RecommendedProduct };
    const was = picks[at];
    spent += cost(to) - was.priceInr;
    picks[at] = toPick(to, was.role, was.tier);
  }

  // ── 5d. the band is the rule — owner's call, 16 Aug ─────────────────────
  //
  // 95–105% UTILISATION IS THE FIRST RULE, and it outranks holding the
  // highest-scoring bottle. Every pass above got the routine as well-matched
  // as this shelf allows; if it is still under B × 0.95, the remaining money
  // is now spent on the dearer products that are left — which, on this
  // catalogue, means products that claim fewer of the stated concerns than
  // the ones they replace. That is the measured cost of the rule and it is
  // taken with eyes open, because the owner ranked the band first.
  //
  // WHAT STILL HOLDS, because the band never outranked safety or fit:
  //   · the matched pool — nothing incompatible enters, at any price
  //   · COVERAGE — every need the routine answers stays answered after the
  //     swap (`keepsCoverage`); the band may cost score, never a concern
  //   · the candidate answers at least ONE of this person's needs — money is
  //     never parked in an anti-ageing serum for a profile that never
  //     mentioned ageing
  //   · the overlap and load rules — no second retinoid at any utilisation
  //   · the share cap and the B × 1.05 ceiling, both unmoved
  //
  // SMALLEST SCORE LOSS FIRST, then the price that lands nearest the band —
  // so the routine gives up as little fit as the rule allows, and the money
  // spreads rather than landing on one trophy bottle. It stops the moment
  // the band is reached; if the guarded shelf runs out first, pass 6 says so.
  for (let guard = 0; guard < 40 && spent < targetLow; guard++) {
    let best: { at: number; to: RecommendedProduct; loss: number; after: number } | null = null;
    picks.forEach((pick, at) => {
      const d = defs.find((x) => x.role === pick.role);
      if (!d) return;
      for (const cand of forRole(d)) {
        if (cand.id === pick.product.id) continue;
        if (answers(cand) === 0) continue;
        if (!keepsCoverage(at, cand)) continue;
        if (!withinShare(cand) || clash(cand, at)) continue;
        const after = spent - pick.priceInr + cost(cand);
        if (after > ceiling || after <= spent) continue;
        const loss = Math.max(0, pick.product.matchScore - cand.matchScore);
        if (!best || loss < best.loss
          || (loss === best.loss && Math.abs(targetLow - after) < Math.abs(targetLow - best.after))) {
          best = { at, to: cand, loss, after };
        }
      }
    });
    if (!best) break;
    const { at, to } = best as { at: number; to: RecommendedProduct };
    const was = picks[at];
    spent += cost(to) - was.priceInr;
    picks[at] = toPick(to, was.role, was.tier);
  }

  // ── 5b. the premium alternative, WHICH IS AN OFFER AND NOT A PURCHASE ────
  //
  // THIS PASS USED TO BUY THINGS AND IT MUST NOT.
  //
  // The catalogue carries the owner's own price grade — Budget, Mid-range,
  // Premium — and this pass swapped a chosen step for a higher-graded one
  // whenever the routine sat under B × 0.90. Its test was `grade(cand) >
  // grade(cur)` AND `not less suitable`, which is a real guard against getting
  // WORSE and no guard at all about getting BETTER. Measured on the shipped
  // planner, one oily/acne profile at a ₹10,000 face budget:
  //
  //   Prep         Plum Green Tea Toner ₹167/mo  →  Paula's Choice 2% BHA ₹2,517/mo
  //   Moisturise   Plum Green Tea ₹196/mo        →  Bioderma Sebium ₹1,080/mo
  //   Cleanse      Himalaya Neem ₹70/mo          →  Sebamed ₹276/mo
  //
  // Same findings answered, same match score, every time. ₹3,519 a month, and
  // the only thing that changed was a word on a spreadsheet. `tier` is a PRICE
  // BAND. There is no efficacy field on BeautyProduct, no concentration, no
  // evidence — nothing that could support "better made", which is what the
  // comment that used to sit here asserted. An engine that cannot tell two
  // suitable products apart and reaches for the price tag has stopped
  // recommending and started upselling.
  //
  // SO IT OFFERS INSTEAD. The candidate is found on exactly the same terms and
  // put in `upgrades` with the sentence that made it an offer rather than a
  // purchase. If a grade jump ever buys something nameable, pass 4 — which
  // requires strictly more of this person's findings answered, or the same
  // number at a better match — takes it already, and takes it whether or not
  // the budget has room. That is the difference the money is allowed to notice:
  // none.
  //
  // THE CHEAPEST QUALIFYING OFFER PER STEP, not the dearest. A citizen deciding
  // whether to spend more is owed the smallest real step up, not the biggest
  // one the ceiling allows — that greedy is what put a ₹3,300-a-month sunscreen
  // in a ₹5,000 routine when this pass could still take things.
  const GRADE: Record<string, number> = { Budget: 0, 'Mid-range': 1, Premium: 2 };
  const grade = (p: RecommendedProduct) => GRADE[p.tier] ?? 0;
  const premiumOffers: Pick_[] = picks.flatMap((pick, at) => {
    const d = defs.find((x) => x.role === pick.role);
    if (!d) return [];
    const cand = [...forRole(d)]
      .filter((c) => c.id !== pick.product.id
        && grade(c) > grade(pick.product)
        && answers(c) >= answers(pick.product) && c.matchScore >= pick.product.matchScore
        && withinShare(c) && !clash(c, at)
        && spent - pick.priceInr + cost(c) <= ceiling
        && cost(c) > pick.priceInr)
      .sort((a, b) => cost(a) - cost(b))[0];
    if (!cand) return [];
    const extra = cost(cand) - pick.priceInr;
    return [{
      ...toPick(cand, pick.role, pick.tier),
      reason: `A ${cand.tier.toLowerCase()} alternative to your ${pick.role.toLowerCase()} step, ₹${extra.toLocaleString('en-IN')}/month more. It answers the same findings and suits you no better than the one we chose, so we haven't swapped it in.`,
    }];
  });

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
    // FOUR REASONS A ROLE IS OPEN, and only one of them is "you don't need it".
    // The cap closes a role while the money is still there, and saying "what
    // you already have covers it" in that case would be a lie the citizen can
    // check: the shelf has one, they can afford it, and we are declining to
    // build a routine around it. Say that instead.
    //
    // The fourth is the overlap rule, and it is the one most worth spelling
    // out — "you don't need a separate toner" is true by accident when the
    // real answer is "everything on this shelf for that step is another acid
    // and you already have one". Those read the same to us and not to anybody
    // deciding whether we understood them.
    const blocked = any.every((c) => clash(c)) ? clash(any[0]) : null;
    leftOut.push({
      role: d.role, tier: d.tier,
      why: blocked
        ? blocked.kind === 'duplicate'
          ? `You don't need a separate ${d.role.toLowerCase()} step — every one that suits you brings ${FAMILY_LABEL[blocked.family]}, and your routine already has it.`
          : `We've left the ${d.role.toLowerCase()} step out — your assessment flags reactive skin, and your routine already asks as much of it as we'd want to.`
        : cost(cheapest) > room()
          ? `A ${d.role.toLowerCase()} step would fit your profile but not this budget.`
          : !withinShare(cheapest)
            ? `A ${d.role.toLowerCase()} step that suits you starts at about ₹${cost(cheapest).toLocaleString('en-IN')} a month — more than half your ${category} budget on one product, so we've left the choice to you.`
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
   * WHY IT STOPPED SHORT — and it has to be a real reason, not a shrug. By
   * the time this runs, every spending pass INCLUDING the band pass has run
   * out: whatever is left on the shelf either doesn't address a single thing
   * this person told us, repeats an active or a family the routine already
   * carries, or would put more than half the category on one product. Under
   * the band-first rule this fires far more rarely than it used to — the
   * planner now spends toward B × 0.95 even at the cost of match score — so
   * when it does fire, it is the guarded shelf genuinely running dry, and
   * the sentence says that rather than apologising for thrift.
   */
  const leanReason = !short && spent < targetLow
    ? `Your ${category} routine comes to ₹${spent.toLocaleString('en-IN')} to buy against a ₹${budget.toLocaleString('en-IN')} budget. We've bought everything on this shelf that addresses what you told us and can sit safely in one routine — what's left either repeats what you already have, doesn't suit your profile, or would put most of the budget on a single product. We've stopped there rather than pad the number.`
    : null;

  // What somebody could consider anyway, offered and never taken. Two kinds
  // now: a step the routine does not have, and a dearer version of one it does.
  // The second used to be taken silently and is the whole of 5b above.
  const chosen = new Set(picks.map((x) => x.product.id));
  const upgrades = [
    ...openRoles()
      .flatMap((d) => [...forRole(d)].filter((p) => !chosen.has(p.id) && !clash(p)).sort(byEffect).slice(0, 1).map((p) => toPick(p, d.role, d.tier)))
      .filter((u) => u.priceInr <= room()),
    ...premiumOffers,
  ];

  return {
    category, budgetInr: budget, skipped: false, picks,
    spendInr: spent,
    monthlyInr: picks.reduce((n, x) => n + x.monthlyInr, 0),
    remainingInr: Math.max(0, budget - spent),
    overInr: Math.max(0, spent - budget),
    targetLowInr: targetLow,
    ceilingInr: ceiling,
    minimumInr: short ? floorCost : null,
    idealInr,
    leanReason,
    kept,
    usefulMaxInr: usefulMax,
    leftOut: trimmed, upgrades,
  };
}

/**
 * ── THE MOST THIS PROFILE CAN HONESTLY ABSORB ───────────────────────────────
 *
 * The dearest routine in which every step is at least as well matched as the
 * best cheap one — summed per role, directly, rather than read off a greedy
 * plan. A greedy is path-dependent and returns a slightly different number at
 * different budgets; a cap has to be an upper bound or it is not a cap.
 *
 * IT IS NOT "the dearest routine". That is ₹17,473 a month for an oily/acne
 * profile on this shelf and it answers ten of her findings against fourteen —
 * SkinCeuticals C E Ferulic at ₹5,775 answers ONE. Money can buy a great deal
 * more than this number; it cannot buy a better match than this number, which
 * is the only thing the citizen is setting a budget in order to get.
 *
 * This is what the budget dial is capped to. A slider that runs to ₹60,000 for
 * a face whose shelf tops out at ₹4,400 is not offering a choice, it is
 * inviting a disappointment and then explaining it.
 */
export function usefulMaxInr(
  all: RecommendedProduct[], category: BudgetCategory, needs: Set<string>,
  owned: Set<string> = new Set(),
): number {
  // WHAT THE PLANNER CAN ACTUALLY REACH, asked by running it with the money
  // taken out of the question. It used to be a per-role sum of the dearest
  // non-inferior product, computed by a rule the band pass no longer uses —
  // so the card said "this shelf tops out at ₹7,144" over a routine the
  // planner stopped building at ₹4,444. A ceiling nobody can reach is not a
  // ceiling; it is a second wrong number next to the first.
  return planCategory(all, category, BUDGET_MAX, needs, owned, true).spendInr;
}

export interface BudgetPlan {
  face: CategoryPlan; hair: CategoryPlan; body: CategoryPlan;
  totalBudgetInr: number; totalSpendInr: number; totalMonthlyInr: number; totalRemainingInr: number;
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
  priceInr: number; monthlyInr: number; monthsOfUse: number;
  /** "100 ml" — what is printed on the pack, or '' if the name never said. */
  packLabel: string;
  /** "about 6 weeks" · "about 2½ months" — how long one pack lasts. */
  lastsLabel: string;
  /** Only ever on an offer: what spending this would, and would not, buy. */
  reason?: string;
  /**
   * WHY THIS PRODUCT AND NOT ANOTHER, in the assessment's own words — the
   * primary reasons the recommendation engine already computed. It has been on
   * the market's cards since the shelf was written and never reached the
   * routine, where the question "why am I being told to put this on my face"
   * is asked far more often. Three at most; a fourth is a paragraph.
   */
  reasons: string[];
}

export interface WireCategoryPlan {
  category: BudgetCategory; budgetInr: number; skipped: boolean;
  spendInr: number; monthlyInr: number; remainingInr: number; overInr: number;
  targetLowInr: number; ceilingInr: number;
  minimumInr: number | null; idealInr: number | null; leanReason: string | null;
  usefulMaxInr: number;
  picks: WirePick[]; kept: Kept[]; leftOut: LeftOut[]; upgrades: WirePick[];
}

export interface WireBudgetPlan {
  face: WireCategoryPlan; hair: WireCategoryPlan; body: WireCategoryPlan;
  totalBudgetInr: number; totalSpendInr: number; totalMonthlyInr: number; totalRemainingInr: number;
}

const wirePick = (x: Pick_): WirePick => ({
  productId: x.product.id,
  name: x.product.name,
  role: x.role,
  tier: x.tier,
  priceInr: x.priceInr,
  monthlyInr: x.monthlyInr,
  monthsOfUse: x.monthsOfUse,
  packLabel: packLabel(x.product.name),
  lastsLabel: lastsLabel(x.monthsOfUse),
  reasons: x.product.primaryReasons.slice(0, 3),
  ...(x.reason ? { reason: x.reason } : {}),
});

const wireCategory = (c: CategoryPlan): WireCategoryPlan => ({
  category: c.category, budgetInr: c.budgetInr, skipped: c.skipped,
  spendInr: c.spendInr, monthlyInr: c.monthlyInr, remainingInr: c.remainingInr, overInr: c.overInr,
  targetLowInr: c.targetLowInr, ceilingInr: c.ceilingInr,
  minimumInr: c.minimumInr, idealInr: c.idealInr, leanReason: c.leanReason,
  usefulMaxInr: c.usefulMaxInr,
  picks: c.picks.map(wirePick),
  kept: c.kept,
  leftOut: c.leftOut,
  upgrades: c.upgrades.map(wirePick),
});

export function planForWire(plan: BudgetPlan): WireBudgetPlan {
  return {
    face: wireCategory(plan.face),
    hair: wireCategory(plan.hair),
    body: wireCategory(plan.body),
    totalBudgetInr: plan.totalBudgetInr,
    totalSpendInr: plan.totalSpendInr,
    totalMonthlyInr: plan.totalMonthlyInr,
    totalRemainingInr: plan.totalRemainingInr,
  };
}

export function planWithinBudget(
  all: RecommendedProduct[], budgets: CategoryBudgets, needs: Iterable<string>,
  /** The "what you use now" chips, verbatim. Mapped per category inside. */
  alreadyHave: readonly string[] = [],
): BudgetPlan {
  const need = new Set(needs);
  const face = planCategory(all, 'face', budgets.face, need, ownedRoles('face', alreadyHave));
  const hair = planCategory(all, 'hair', budgets.hair, need, ownedRoles('hair', alreadyHave));
  const body = planCategory(all, 'body', budgets.body, need, ownedRoles('body', alreadyHave));
  return {
    face, hair, body,
    totalBudgetInr: face.budgetInr + hair.budgetInr + body.budgetInr,
    totalSpendInr: face.spendInr + hair.spendInr + body.spendInr,
    totalMonthlyInr: face.monthlyInr + hair.monthlyInr + body.monthlyInr,
    totalRemainingInr: face.remainingInr + hair.remainingInr + body.remainingInr,
  };
}
