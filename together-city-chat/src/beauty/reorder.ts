import { BEAUTY_PRODUCTS } from './beauty-catalog';
import { DAYS_PER_MONTH, lastsLabel, monthsOfUse } from './monthly-cost';

/**
 * WHEN THE NEXT ORDER IS DUE.
 *
 * A routine is not a purchase, it is a supply. Somebody who has just paid
 * ₹10,553 for ten products has bought between six weeks and five months of
 * different things, and the question they will actually have in a month's time
 * is not "what did I buy" but "when do I have to do this again". Nothing in the
 * hub answered it, so the answer lived in a drawer with ten bottles in it.
 *
 * ── THE FIRST THING TO RUN OUT SETS THE DATE ────────────────────────────────
 *
 * Not the average, and emphatically not the last. On the routine this was
 * written against, the coconut hair oil is a 300 ml bottle at 60 ml a month —
 * five months — and the sunscreen is 50 ml at the honest dose of 36 ml a month,
 * which is six weeks. Waiting for the hair oil means three and a half months
 * with no sunscreen in a routine whose whole first principle is that sunscreen
 * is the one step with no substitute.
 *
 * So the countdown is to the SOONEST empty bottle, and the product that sets it
 * travels with the date. "45 days" on its own is a number somebody has to trust;
 * "45 days — your sunscreen runs out first" is a number they can check against
 * the bottle on the shelf, which is the same standard the monthly costs are held
 * to everywhere else in this hub.
 *
 * ── AND IT IS AN ORDER-BY DATE, NOT AN EMPTY-BOTTLE DATE ────────────────────
 *
 * Seven days earlier, because a reorder placed on the morning the tube runs out
 * is a week without sunscreen however fast the courier is. The lead time is a
 * named constant rather than a subtraction buried in a sum: it is a judgement
 * about delivery, it will be wrong the first time this ships anywhere with
 * different logistics, and whoever changes it should be able to find it.
 *
 * ── WHAT IT IS COMPUTED FROM, WHICH IS THE ORDER AND NOT THE ROUTINE ────────
 *
 * The order. Someone who changes their budget the day after paying has a new
 * routine and the same ten bottles, and the bottles are what run out. This is
 * also why the function takes no clock: the due date is a fact about a purchase
 * that was made at a fixed moment, so it is the same date whenever it is asked
 * for, and the COUNTDOWN — the part that changes every midnight — is the
 * browser's arithmetic against a date the server decided. One judgement, one
 * place, and a number that ticks without a refetch.
 */

/**
 * How early to reorder. A week: long enough for a delivery, short enough that
 * nobody is buying sunscreen they already have a month of.
 */
export const REORDER_LEAD_DAYS = 7;

export interface OrderedItem {
  id: string;
  name: string;
  qty: number;
}

export interface ReorderDue {
  /** ISO date to place the next order — `runsOutAt` less the lead time. */
  dueAt: string;
  /** ISO date the first product is actually empty. */
  runsOutAt: string;
  /** Which product runs out first, and how long one pack of it lasts. */
  productId: string;
  productName: string;
  /**
   * "Sunscreen" · "Hair oil" — the shelf's own display category.
   *
   * It is here so a card can say "your sunscreen runs out first" in four words.
   * The full name is "Minimalist Light Fluid SPF 50 PA++++ Sunscreen (50 ml)",
   * which is the right thing on an order line and far too long for a sentence
   * somebody reads in passing. Both travel; each surface takes the one it needs.
   */
  productCategory: string;
  /** "about 6 weeks" — the same phrase the routine card uses for this product. */
  lastsLabel: string;
  /** So a page can say "ordered 12 Aug" without a second query. */
  orderedAt: string;
  leadDays: number;
}

const DAY_MS = 86_400_000;

/** Midnight-anchored ISO date, because a due date is a day and not an instant. */
const isoDay = (d: Date): string => d.toISOString().slice(0, 10);

/**
 * The shelf, indexed once. The catalogue is a static array of 126 rows and the
 * orders page dates every order in the history — rebuilding this map per order
 * is a hundred and twenty-six pointless writes each time somebody opens their
 * routine, for a lookup that never changes between deploys.
 */
const SHELF_BY_ID = new Map(BEAUTY_PRODUCTS.map((p) => [p.id, p]));

/**
 * The due date for one order, or null when nothing in it can be dated.
 *
 * NULL IS AN ANSWER AND NOT A FAILURE. An order whose every product has left
 * the catalogue cannot be dated — pack size and dose come from the shelf, and a
 * row that is gone takes both with it. Guessing a date from a name alone would
 * be the kind of number that looks like knowledge, so the surfaces show nothing
 * instead. Unknown ids are skipped rather than fatal: nine datable products and
 * one discontinued one still answer the question.
 */
export function reorderDueFor(
  order: { id: string; createdAt: string | Date; items: OrderedItem[] },
): ReorderDue | null {
  const placed = new Date(order.createdAt);
  if (Number.isNaN(placed.getTime())) return null;

  let first: { item: OrderedItem; months: number; category: string } | null = null;

  for (const item of order.items ?? []) {
    const product = SHELF_BY_ID.get(item.id);
    if (!product) continue;
    // QUANTITY EXTENDS THE SUPPLY, and it has to: two sunscreens is twelve
    // weeks of sunscreen. The twelve-month period-after-opening cap inside
    // monthsOfUse applies per pack — the second bottle is sealed until the
    // first is done — so it multiplies after the cap rather than before it.
    const qty = Math.max(1, Math.floor(item.qty || 1));
    const months = monthsOfUse(product) * qty;
    if (!first || months < first.months) first = { item, months, category: product.category };
  }

  if (!first) return null;

  const runsOut = new Date(placed.getTime() + first.months * DAYS_PER_MONTH * DAY_MS);
  const due = new Date(runsOut.getTime() - REORDER_LEAD_DAYS * DAY_MS);

  return {
    dueAt: isoDay(due),
    runsOutAt: isoDay(runsOut),
    productId: first.item.id,
    productName: first.item.name,
    productCategory: first.category,
    lastsLabel: lastsLabel(first.months),
    orderedAt: isoDay(placed),
    leadDays: REORDER_LEAD_DAYS,
  };
}

/**
 * The due date the ROUTINE shows, which comes from the latest order.
 *
 * Latest and not earliest: an order placed today replaces the supply an order
 * placed in March was counting down. Orders arrive newest-first from the
 * service, but this sorts rather than trusting that — a caller who passes them
 * the other way round should get the right answer, not a plausible one.
 */
export function nextReorder(
  orders: { id: string; createdAt: string | Date; items: OrderedItem[] }[],
): ReorderDue | null {
  const latest = [...orders]
    .filter((o) => !Number.isNaN(new Date(o.createdAt).getTime()))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  return latest ? reorderDueFor(latest) : null;
}
