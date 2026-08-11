/**
 * The bag, and why it is not in the browser.
 *
 * WHAT WAS WRONG. Both the routine and the market kept the bag in a React
 * `useState`. That gave the hub TWO bags — three items on the market and ten on
 * the routine at the same moment, each with its own checkout button and its own
 * total — and both of them were erased by clicking a link. Somebody who put a
 * cleanser in from the market, went to read their routine and came back had an
 * empty bag and no way to know why. A bag that forgets is worse than no bag,
 * because it invites the work of filling it twice.
 *
 * ONE BAG, ON THE SERVER, PER CITIZEN. It survives navigation because it is not
 * in the page; it survives a reload and a second device for the same reason;
 * and it empties when the citizen empties it or when an order is placed, which
 * are the only two events that should ever empty it.
 *
 * IT LIVES IN `extras.bag` AND THAT KEY WAS CHOSEN CAREFULLY. `extras` is the
 * profile's JSON column and it is shared — `budget` is the onboarding STRING
 * answer, `monthlyBudget` is the per-category object. Writing an object over
 * that string once took the market, the routine and the profile down together
 * with a single TypeError. So: a key nothing else uses, and a shape check on
 * the way out rather than a cast. A stored blob is not a type.
 *
 * QUANTITIES ARE CLAMPED AND THE LINE IS DROPPED AT ZERO, so "remove" and "set
 * to nothing" cannot produce two different states that both render as an empty
 * row.
 */

/** One line in the bag. Just the id and how many — never the price. */
export interface BagLine { id: string; qty: number }

/** Nobody needs twelve of one moisturiser, and a typo should not be able to
 *  charge for them. */
const MAX_QTY = 12;
/** A bag longer than this is a bug or a bored teenager with a keyboard. */
const MAX_LINES = 60;

/**
 * Read whatever is in the column and return something that is definitely a bag.
 *
 * NO PRICES ARE STORED AND THAT IS THE POINT. A bag holding its own prices is a
 * bag that can disagree with the shelf — the citizen adds a product at ₹369,
 * the price changes, and they check out at whichever number the browser
 * happened to keep. Only ids and quantities are kept; every rupee shown or
 * charged is looked up from the catalogue at the moment it is needed, which is
 * the same rule `priceBeautyOrder` already enforces at payment.
 */
export function parseBag(raw: unknown): BagLine[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Map<string, number>();
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const { id, qty } = item as { id?: unknown; qty?: unknown };
    if (typeof id !== 'string' || !id) continue;
    const n = typeof qty === 'number' && Number.isFinite(qty) ? Math.floor(qty) : 0;
    if (n <= 0) continue;
    // Two lines for one product is one line. It cannot happen through the UI
    // and it must not survive a hand-edited blob.
    seen.set(id, Math.min(MAX_QTY, (seen.get(id) ?? 0) + n));
  }
  return [...seen].slice(0, MAX_LINES).map(([id, qty]) => ({ id, qty }));
}

/** The same normalisation, applied to what a client sends us. */
export const normaliseBag = (lines: unknown): BagLine[] => parseBag(lines);
