import { PRODUCTS, sellable, type Product } from './products';

/**
 * THE BAG, AND THE TILL.
 *
 * THE CLIENT SAYS WHAT IT WANTS; THE SERVER SAYS WHAT IT COSTS. This file
 * exists because that sentence has to be true in one place rather than
 * implied in several. POST /beauty/orders once summed `priceInr` out of the
 * request body and charged it — a request naming a ₹1,690 retinal at ₹1 would
 * have been charged ₹1 and written an order that looked entirely normal
 * afterwards. It survived thirteen correct siblings because the shape does not
 * look careless: the client already has the price on screen, so sending it
 * back reads like passing data along rather than like handing the buyer the
 * till. `security/wallet-pricing.spec.ts` now scans for it, and this file is
 * written to give that scan nothing to find — the only thing taken from the
 * request is an id and a quantity.
 *
 * A BAG IS NOT A LIST OF WHATEVER ARRIVED. Two lines for one product is one
 * line; a quantity of 0, of −3, of 1e9, or of "4" is not a quantity; and a bag
 * of four hundred rows is not a bag. None of that can happen through the
 * screen, which is exactly why it has to be handled here — the screen is not
 * the only way in.
 *
 * WHAT IT REFUSES TO PRICE, IT REFUSES LOUDLY. An unknown id, a product with
 * no single recorded price, and a prescription-only medicine each come back
 * named, in their own category, rather than being silently dropped from a
 * total the citizen is about to pay. A basket that quietly costs less than it
 * showed is the same bug as one that quietly costs more.
 */

export const MAX_QTY = 12;
export const MAX_LINES = 30;

export interface BagLine { id: string; qty: number }
export interface PricedLine { id: string; name: string; brand: string; priceInr: number; qty: number }

export type Pricing =
  | { ok: true; lines: PricedLine[]; totalInr: number }
  | { ok: false; unknownIds: string[]; unpricedIds: string[]; prescriptionIds: string[] };

/**
 * Normalise anything into a bag. Used on the way in from a client AND on the
 * way out of the database, because a JSON column is a string somebody may one
 * day have edited by hand, and a reader that trusts its own writes is a reader
 * that has never met a migration.
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
    seen.set(id, Math.min(MAX_QTY, (seen.get(id) ?? 0) + n));
  }
  return [...seen].slice(0, MAX_LINES).map(([id, qty]) => ({ id, qty }));
}

/** The same normalisation, applied to what a client sends us. */
export const normaliseBag = (lines: unknown): BagLine[] => parseBag(lines);

const byId = (): Map<string, Product> => new Map(PRODUCTS.map((p) => [p.id, p]));

/**
 * THE PRICE OF A BAG, READ OFF THE SHELF.
 *
 * `requested` may carry a price, a name, anything — none of it is read. The id
 * finds the product, the product carries `priceInr`, and the quantity is the
 * one number taken on trust, bounded above by MAX_QTY on the way in.
 */
export function priceSupplementOrder(requested: BagLine[]): Pricing {
  const shelf = byId();
  const wanted = parseBag(requested);

  const unknownIds = wanted.filter((l) => !shelf.has(l.id)).map((l) => l.id);
  const known = wanted.filter((l) => shelf.has(l.id));
  const unpricedIds = known.filter((l) => typeof shelf.get(l.id)!.priceInr !== 'number').map((l) => l.id);
  const prescriptionIds = known.filter((l) => shelf.get(l.id)!.rx).map((l) => l.id);

  if (unknownIds.length || unpricedIds.length || prescriptionIds.length) {
    return { ok: false, unknownIds, unpricedIds, prescriptionIds };
  }

  const lines: PricedLine[] = known.map((l) => {
    const p = shelf.get(l.id) as Product;
    return { id: p.id, name: p.name, brand: p.brand, priceInr: p.priceInr as number, qty: l.qty };
  });
  return { ok: true, lines, totalInr: lines.reduce((s, l) => s + l.priceInr * l.qty, 0) };
}

/**
 * A bag priced for DISPLAY, which is a softer job than pricing one for
 * payment. Here an un-sellable line is shown and marked rather than refused,
 * because the citizen may have had it in the bag since before the shelf
 * changed and deleting it without a word is how a bag lies about itself.
 */
export function priceBagForDisplay(lines: BagLine[]) {
  const shelf = byId();
  const rows = parseBag(lines).map((l) => {
    const p = shelf.get(l.id);
    if (!p) return { id: l.id, qty: l.qty, gone: true as const };
    return {
      id: p.id, qty: l.qty, gone: false as const,
      brand: p.brand, name: p.name, price: p.price, priceInr: p.priceInr,
      pack: p.pack, colour: p.colour, image: p.image, supplement: p.supplement,
      rx: p.rx, sellable: sellable(p),
      lineTotalInr: sellable(p) ? (p.priceInr as number) * l.qty : undefined,
    };
  });
  return {
    lines: rows,
    /* The total counts only what can actually be charged, and the count of
       what it left out is returned beside it so no screen has to infer the
       difference between "₹0" and "nothing in here can be sold". */
    totalInr: rows.reduce((s, r) => s + (r.lineTotalInr ?? 0), 0),
    unsellable: rows.filter((r) => r.gone || !r.sellable).length,
  };
}
