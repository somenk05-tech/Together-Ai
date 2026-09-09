import { categoryGroup } from './categories';
import { catalogueFor } from './business-types';

/**
 * ── HOW FAR A LISTING REACHES ───────────────────────────────────────────────
 *
 * Owner, 9 Sep: "Areas you cover — make this automatic at a radius of 3–5 km
 * per store, and let the store owner decide how much they want to cover up to
 * 7 km."
 *
 * WHAT WAS THERE BEFORE, and why it did not work. Two fields, neither doing
 * the job:
 *
 *   · "Areas you cover" — a comma-separated list of locality names, typed. It
 *     is how a person describes where they work, and it is the only thing the
 *     directory's area filter can read. It cannot answer "within 3 km", it
 *     spells Bandra four ways, and a shop that forgets a neighbouring locality
 *     is invisible to it for no reason a citizen could ever guess.
 *
 *   · `radiusKm` — "How far you travel (km)", a free number box down beside the
 *     map pin, with a placeholder of 5 and no default. It was stored, returned
 *     on the card, and READ BY NOTHING. Every distance search in this service
 *     trimmed by the CITIZEN's radius and never once asked the shop how far it
 *     was willing to go. A shopkeeper could type 2 and be shown to somebody
 *     forty kilometres away.
 *
 * So the radius becomes the answer, and it becomes real: automatic, so nobody
 * starts blank; capped where a cap means something; and enforced, so setting
 * it does what setting it looks like it does.
 */

/** Where a listing reaches when nobody has said — the same 3 km the store
 *  shelves open on, so the two sides of the city agree about "near you". */
export const REACH_DEFAULT_KM = 3;

/** The ceiling for a trade that sells over a counter (owner, 9 Sep). */
export const REACH_MAX_SHOP_KM = 7;

/**
 * IS THIS A COUNTER, OR SOMEBODY WHO TRAVELS?
 *
 * Read off the catalogue the trade publishes rather than a second list of
 * category keys kept in step by hand. A trade whose catalogue is a STOCK LIST
 * is a shop: it has things on shelves and a door people come through. A
 * plumber publishes a rate card and drives to you.
 *
 * That is not a clever proxy, it is the same question asked once: the stock
 * list is exactly what the Grocery and Electronics shelves read, so "has a
 * shelf in the store" and "is capped at 7 km" are the same set by
 * construction, and a trade added to Shopping tomorrow gets both without
 * anybody remembering to add it here.
 */
export function isCounterTrade(categoryKey: string | null | undefined): boolean {
  if (!categoryKey) return false;
  return catalogueFor(null, categoryKey, categoryGroup(categoryKey)).kind === 'stock';
}

/** The most this trade may cover. A travelling trade is UNCAPPED — a plumber
 *  held to 7 km is a restriction the owner did not ask for, and the cap was
 *  asked for in the words "per store" and "the store owner". */
export function reachCeilingKm(categoryKey: string | null | undefined): number {
  return isCounterTrade(categoryKey) ? REACH_MAX_SHOP_KM : Number.POSITIVE_INFINITY;
}

/**
 * What to STORE for a listing, given what its owner asked for.
 *
 * Absent is the default rather than null: "they did not say" was a reasonable
 * value while nothing read the field, and is not one now that it decides who
 * can see them. Silence must not mean invisible, and it must not mean
 * unlimited either.
 */
export function clampReachKm(categoryKey: string | null | undefined, asked: number | null | undefined): number {
  const ceiling = reachCeilingKm(categoryKey);
  const n = typeof asked === 'number' && Number.isFinite(asked) ? Math.round(asked) : REACH_DEFAULT_KM;
  if (n < 1) return 1;
  return Math.min(n, ceiling);
}

/**
 * DOES THIS LISTING SERVE SOMEBODY THIS FAR AWAY?
 *
 * Both radii have to agree, and they mean different things: the citizen's is
 * how far they are willing to LOOK, the shop's is how far it is willing to
 * GO. A shop that said five kilometres does not appear to somebody six away
 * who widened their own search to ten — it already answered that question.
 *
 * NULL IS NOT ZERO. A listing written before this existed has no radius, and
 * must not vanish from every distance search the moment this ships. It falls
 * through to the citizen's radius alone, which is exactly what it did
 * yesterday.
 */
export function servesAt(radiusKm: number | null | undefined, km: number): boolean {
  return radiusKm == null ? true : km <= radiusKm;
}
