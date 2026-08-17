import { recommendProducts } from './beauty-engine';
import { planForWire, planWithinBudget } from './budget-routine';

/**
 * A STEP CAN BE SWAPPED, AND THE SWAP IS STILL PLANNED.
 *
 * The routine names one product per step and, until this shipped, that was the
 * end of the conversation: somebody who did not want the serum the planner
 * chose could move their budget and hope, or go to the market and buy something
 * the routine would never mention again. The refresh control on a card is the
 * missing answer — "not that one, the other one" — and the whole risk in it is
 * that it becomes a second, ungoverned way to put a product on a face.
 *
 * So the properties worth holding are not about the control. They are:
 *   · every option offered is one the planner itself was allowed to buy;
 *   · a pin is honoured where it can be and IGNORED where it cannot, never
 *     half-applied;
 *   · the plan that comes back is arithmetically the plan, not the old one with
 *     a product swapped into the display.
 */

const READINGS = [
  { key: 'pigmentation', label: 'Pigmentation & spots', level: 'attention' },
  { key: 'hydration', label: 'Hydration', level: 'monitor' },
  { key: 'oil', label: 'Oil balance', level: 'attention' },
];
const NEEDS = READINGS.map((r) => r.key);
const SHELF = recommendProducts({ readings: READINGS, concerns: [], profile: { skinType: 'combination' }, insights: [] });
const BUDGETS = { face: 5000, hair: 2000, body: 1000 };

const plan = (swaps: Record<string, string> = {}) =>
  planForWire(planWithinBudget(SHELF, BUDGETS, NEEDS, [], swaps));

/** The face pick with the most alternatives — the step worth testing against. */
const richest = () => {
  const picks = [...plan().face.picks].sort((a, b) => (b.options?.length ?? 0) - (a.options?.length ?? 0));
  return picks[0];
};

describe('what else a step could be', () => {
  it('offers the chosen product among its own options', () => {
    // The page cycles through this list and has to be able to come back round.
    // A list of "the others" leaves somebody who pressed once with no way home
    // that does not involve knowing what used to be there.
    for (const p of plan().face.picks) {
      expect(p.options?.some((o) => o.productId === p.productId)).toBe(true);
    }
  });

  it('never offers more than five, and never offers a step nothing else can fill', () => {
    for (const p of plan().face.picks) {
      expect(p.options!.length).toBeGreaterThan(0);
      expect(p.options!.length).toBeLessThanOrEqual(5);
    }
  });

  it('offers only products the planner itself could have bought', () => {
    // The gate is the matched shelf. Anything reachable from the card is
    // something this profile was already cleared for; the control cannot widen
    // the pool it draws from.
    const matched = new Set(SHELF.filter((p) => p.matched).map((p) => p.id));
    for (const p of plan().face.picks) {
      for (const o of p.options!) expect(matched.has(o.productId)).toBe(true);
    }
  });

  it('prices every option before it is chosen', () => {
    // "₹699, about ₹699 a month" has to be readable BEFORE the swap, or the
    // control is asking somebody to press it to find out what it costs.
    for (const o of richest().options!) {
      expect(o.priceInr).toBeGreaterThan(0);
      expect(o.monthlyInr).toBeGreaterThan(0);
      expect(o.name.length).toBeGreaterThan(0);
    }
  });

  it('gives the same list twice for the same routine', () => {
    // Ordered by effectiveness, not by whatever order the shelf came back in.
    // A cycle whose order changes between reads is a cycle that never returns.
    const once = plan().face.picks.map((p) => p.options!.map((o) => o.productId).join(','));
    const again = plan().face.picks.map((p) => p.options!.map((o) => o.productId).join(','));
    expect(again).toEqual(once);
  });
});

describe('a step the citizen swapped', () => {
  const base = richest();
  const other = base.options!.find((o) => o.productId !== base.productId)!;
  const swapped = plan({ [`face:${base.role}`]: other.productId });
  const step = swapped.face.picks.find((p) => p.role === base.role)!;

  it('is the product they asked for', () => {
    expect(step.productId).toBe(other.productId);
  });

  it('re-prices the category around it', () => {
    // The whole reason the swap is a server round trip. A page that swapped the
    // picture and left the category total alone would be showing a budget for a
    // routine nobody has.
    const delta = other.priceInr - base.priceInr;
    expect(swapped.face.spendInr).toBe(plan().face.spendInr + delta);
    expect(swapped.face.remainingInr).toBe(Math.max(0, swapped.face.budgetInr - swapped.face.spendInr));
  });

  it('never crosses the ceiling the budget set', () => {
    expect(swapped.face.spendInr).toBeLessThanOrEqual(swapped.face.ceilingInr);
  });

  it('still fills the step exactly once', () => {
    // A pin replaces; it never adds. Two products in one role is the pile-up
    // the whole planner is built to refuse.
    expect(swapped.face.picks.filter((p) => p.role === base.role)).toHaveLength(1);
  });

  it('leaves the other categories alone', () => {
    expect(swapped.hair.picks.map((p) => p.productId)).toEqual(plan().hair.picks.map((p) => p.productId));
  });
});

describe('a swap that cannot be honoured', () => {
  const before = plan();

  it('is ignored when the product is not on this shelf', () => {
    const after = plan({ 'face:Cleanse': 'no-such-product' });
    expect(after.face.picks.map((p) => p.productId)).toEqual(before.face.picks.map((p) => p.productId));
  });

  it('is ignored when the product is for another step', () => {
    // A sunscreen pinned to the Cleanse role is not a cleanser, whatever the
    // key says. Roles are matched on the product's own category, not on trust.
    const elsewhere = SHELF.find((p) => p.matched && !/^Cleanser$/i.test(p.category));
    const after = plan({ 'face:Cleanse': elsewhere!.id });
    expect(after.face.picks.map((p) => p.productId)).toEqual(before.face.picks.map((p) => p.productId));
  });

  it('is ignored when the role is not in this routine at all', () => {
    const after = plan({ 'face:NotARole': before.face.picks[0].productId });
    expect(after.face.picks.map((p) => p.productId)).toEqual(before.face.picks.map((p) => p.productId));
  });

  it('does not blame the shelf for a routine the citizen made cheaper', () => {
    // `leanReason` is the planner explaining its own thrift — "we've bought
    // everything on this shelf that addresses what you told us". After a swap
    // down it would be the page blaming the catalogue for somebody's own
    // choice, so it comes off.
    const cheapest = [...richest().options!].sort((a, b) => a.priceInr - b.priceInr)[0];
    const after = plan({ [`face:${richest().role}`]: cheapest.productId });
    if (after.face.spendInr < after.face.targetLowInr) expect(after.face.leanReason).toBeNull();
  });
});
