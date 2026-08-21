import { BEAUTY_PRODUCTS } from './beauty-catalog';
import { DAYS_PER_MONTH, monthsOfUse } from './monthly-cost';
import { nextReorder, REORDER_LEAD_DAYS, reorderDueFor } from './reorder';

/**
 * THE COUNTDOWN IS ABOUT RUNNING OUT, NOT ABOUT SPENDING.
 *
 * The failure this guards is the one every subscription box makes: pick a
 * convenient interval — a month, a quarter — and call it a reorder date. A
 * routine is ten products with ten different lives in it, and an interval that
 * fits none of them means either buying sunscreen you already have or going
 * without it. Every assertion here is about the same question: does the date
 * follow the bottles?
 */

const DAY_MS = 86_400_000;
const daysBetween = (a: string, b: string) =>
  Math.round((new Date(b).getTime() - new Date(a).getTime()) / DAY_MS);

/** A real row off the shelf, by the category the assertion is about. */
const shelf = (category: string) => {
  const p = BEAUTY_PRODUCTS.find((x) => x.category === category);
  if (!p) throw new Error(`No ${category} on the shelf — this spec needs one.`);
  return p;
};

const PLACED = '2026-08-12T09:30:00.000Z';
const order = (items: { id: string; name: string; qty: number }[], createdAt = PLACED) =>
  ({ id: 'o1', createdAt, items });

describe('when the next order is due', () => {
  it('is set by the first product to run out, not the last or the average', () => {
    // THE WHOLE RULE, on the two extremes of a real routine. A 300 ml hair oil
    // at 60 ml a month is five months; a 50 ml sunscreen at the honest dose is
    // six weeks. An order containing both is due in six weeks.
    const oil = shelf('Hair oil');
    const spf = shelf('Sunscreen');
    const due = reorderDueFor(order([
      { id: oil.id, name: oil.name, qty: 1 },
      { id: spf.id, name: spf.name, qty: 1 },
    ]));

    const sooner = monthsOfUse(oil) <= monthsOfUse(spf) ? oil : spf;
    expect(due).not.toBeNull();
    expect({ sets: due!.productId, name: due!.productName })
      .toEqual({ sets: sooner.id, name: sooner.name });
  });

  it('counts from the day the order was placed', () => {
    const spf = shelf('Sunscreen');
    const due = reorderDueFor(order([{ id: spf.id, name: spf.name, qty: 1 }]))!;
    const expected = Math.round(monthsOfUse(spf) * DAYS_PER_MONTH);
    // Within a day: the run-out instant is rounded to a calendar day, and an
    // order placed at 09:30 does not run out at 09:30 four hundred days later.
    expect(Math.abs(daysBetween('2026-08-12', due.runsOutAt) - expected)).toBeLessThanOrEqual(1);
  });

  it('asks for the order a week BEFORE the bottle is empty', () => {
    // A reorder placed on the morning the tube runs out is a week without
    // sunscreen however fast the courier is.
    const spf = shelf('Sunscreen');
    const due = reorderDueFor(order([{ id: spf.id, name: spf.name, qty: 1 }]))!;
    expect(daysBetween(due.dueAt, due.runsOutAt)).toBe(REORDER_LEAD_DAYS);
    expect(due.leadDays).toBe(REORDER_LEAD_DAYS);
  });

  it('makes two of something last twice as long', () => {
    // Buying a spare is the most ordinary thing somebody does with a product
    // they know runs out fastest, and a countdown that ignored it would ask
    // them to reorder with an unopened bottle in the cupboard.
    const spf = shelf('Sunscreen');
    const one = reorderDueFor(order([{ id: spf.id, name: spf.name, qty: 1 }]))!;
    const two = reorderDueFor(order([{ id: spf.id, name: spf.name, qty: 2 }]))!;
    const single = daysBetween('2026-08-12', one.runsOutAt);
    const double = daysBetween('2026-08-12', two.runsOutAt);
    expect(Math.abs(double - single * 2)).toBeLessThanOrEqual(1);
  });

  it('says what runs out first in the same words the routine uses', () => {
    // "45 days" is a number to be trusted; "45 days — your sunscreen, about 6
    // weeks" is a number to be checked against the bottle on the shelf.
    const spf = shelf('Sunscreen');
    const due = reorderDueFor(order([{ id: spf.id, name: spf.name, qty: 1 }]))!;
    expect(due.lastsLabel).toMatch(/^(about \d+(½)? (weeks?|months)|a year or more)$/);
    expect(due.productName).toBe(spf.name);
    // And the short form, for the sentence: "your sunscreen runs out first".
    expect(due.productCategory).toBe(spf.category);
  });

  it('skips a product that has left the shelf rather than guessing at it', () => {
    // Pack size and dose come off the catalogue row. A row that is gone takes
    // both with it, and a date invented from a name alone would look exactly
    // like knowledge.
    const spf = shelf('Sunscreen');
    const due = reorderDueFor(order([
      { id: 'gone-from-the-catalogue', name: 'Something discontinued (30 ml)', qty: 1 },
      { id: spf.id, name: spf.name, qty: 1 },
    ]))!;
    expect(due.productId).toBe(spf.id);
  });

  it('answers null when nothing in the order can be dated', () => {
    expect(reorderDueFor(order([{ id: 'nope', name: 'Gone (30 ml)', qty: 1 }]))).toBeNull();
    expect(reorderDueFor(order([]))).toBeNull();
  });

  it('refuses a date it cannot compute rather than returning one from 1970', () => {
    const spf = shelf('Sunscreen');
    expect(reorderDueFor(order([{ id: spf.id, name: spf.name, qty: 1 }], 'not a date'))).toBeNull();
  });

  it('takes the LATEST order, not whichever arrived first in the list', () => {
    // Somebody who reorders in October is not still counting down from August.
    const spf = shelf('Sunscreen');
    const items = [{ id: spf.id, name: spf.name, qty: 1 }];
    const older = { id: 'old', createdAt: '2026-03-01T00:00:00.000Z', items };
    const newer = { id: 'new', createdAt: '2026-08-12T00:00:00.000Z', items };
    // Both orderings, because the service returns newest-first and a caller
    // who does not should still get the right answer.
    for (const list of [[older, newer], [newer, older]]) {
      expect(nextReorder(list)!.orderedAt).toBe('2026-08-12');
    }
  });

  it('has nothing to say before the first order', () => {
    // No order, no countdown — the routine page shows the card it always did.
    expect(nextReorder([])).toBeNull();
  });

  it('dates every product on the shelf, so no order is undateable by luck', () => {
    // The guard on the guard: if a whole category ever stopped resolving, the
    // tests above would still pass on the categories they name.
    const undateable = BEAUTY_PRODUCTS.filter((p) => {
      const due = reorderDueFor(order([{ id: p.id, name: p.name, qty: 1 }]));
      return !due || Number.isNaN(new Date(due.dueAt).getTime());
    }).map((p) => p.id);
    expect(undateable).toEqual([]);
  });
});
