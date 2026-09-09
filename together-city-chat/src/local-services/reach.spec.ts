import { REACH_DEFAULT_KM, REACH_MAX_SHOP_KM, clampReachKm, isCounterTrade, reachCeilingKm, servesAt } from './reach';
import { SERVICE_CATEGORIES } from './categories';

/**
 * ── HOW FAR A LISTING REACHES ───────────────────────────────────────────────
 *
 * Owner, 9 Sep: "Areas you cover — make this automatic at a radius of 3–5 km
 * per store, and let the store owner decide how much they want to cover up to
 * 7 km."
 *
 * THE BUG UNDERNEATH THE REQUEST, which is bigger than the request. `radiusKm`
 * has existed since the pin did — "How far you travel (km)", a free number box
 * with a placeholder of 5 and no default. It was stored, returned on the card,
 * and READ BY NOTHING. Every distance search trimmed by the CITIZEN's radius
 * and never once asked the shop how far it was willing to go, so a shopkeeper
 * could type 2 and be shown to somebody forty kilometres away. Setting it did
 * not do what setting it looked like it did.
 *
 * So this file holds three things: the radius is automatic, the ceiling is the
 * trade's, and the number is enforced.
 */
describe('who is capped, and who is not', () => {
  it('caps a counter at seven kilometres', () => {
    for (const key of ['grocery_stores', 'supermarkets', 'electronics_stores', 'mobile_shops', 'clothing_stores']) {
      expect({ key, ceiling: reachCeilingKm(key) }).toEqual({ key, ceiling: REACH_MAX_SHOP_KM });
    }
  });

  it('leaves a trade that drives to the job uncapped', () => {
    /* THE OWNER SAID "per store" AND "the store owner". A plumber held to
       seven kilometres is a restriction nobody asked for, and the kind that
       surfaces six weeks later as "why can't I list my service area". */
    for (const key of ['plumbers', 'electricians', 'ac_repair', 'tutors', 'lawyers']) {
      expect({ key, ceiling: reachCeilingKm(key) }).toEqual({ key, ceiling: Infinity });
    }
  });

  it('reads the counter off the catalogue, not off a second list of keys', () => {
    /* A trade whose catalogue is a STOCK LIST has things on shelves and a door
       people come through. That makes "has a shelf in the store" and "is
       capped" the same set by construction — a trade added to Shopping
       tomorrow gets both without anybody remembering this file exists. */
    expect(isCounterTrade('electronics_stores')).toBe(true);
    expect(isCounterTrade('restaurants')).toBe(false);
    expect(isCounterTrade(null)).toBe(false);
    expect(isCounterTrade('a_trade_that_does_not_exist')).toBe(false);
  });

  it('caps every counter trade in the vocabulary, with none missed', () => {
    const counters = SERVICE_CATEGORIES.filter((c) => isCounterTrade(c.key)).map((c) => c.key);
    expect(counters).toContain('electronics_stores');
    expect(counters).toContain('mobile_shops');
    expect(counters).toContain('grocery_stores');
    for (const key of counters) expect({ key, ceiling: reachCeilingKm(key) }).toEqual({ key, ceiling: 7 });
  });
});

describe('the radius is automatic, and the cap is applied on the way in', () => {
  it('gives a listing that said nothing the city’s own three kilometres', () => {
    /* THE SAME NUMBER THE STORE SHELVES OPEN ON, so the two sides of the city
       agree about "near you". Null was a fair value while nothing read the
       field; it is not one now that it decides who can see them. */
    expect(REACH_DEFAULT_KM).toBe(3);
    expect(clampReachKm('electronics_stores', null)).toBe(3);
    expect(clampReachKm('plumbers', undefined)).toBe(3);
  });

  it('holds a shop to seven however much it asks for', () => {
    expect(clampReachKm('electronics_stores', 5)).toBe(5);
    expect(clampReachKm('electronics_stores', 7)).toBe(7);
    expect(clampReachKm('electronics_stores', 40)).toBe(7);
    expect(clampReachKm('grocery_stores', 500)).toBe(7);
  });

  it('lets somebody who travels say what they mean', () => {
    expect(clampReachKm('plumbers', 25)).toBe(25);
    expect(clampReachKm('electricians', 60)).toBe(60);
  });

  it('never stores a radius of nothing', () => {
    /* A radius of zero is a shop that serves nobody, which is never what
       anybody means to type — and it would be indistinguishable on the shelf
       from a shop that has closed. */
    expect(clampReachKm('electronics_stores', 0)).toBe(1);
    expect(clampReachKm('plumbers', -4)).toBe(1);
    expect(clampReachKm('electronics_stores', 2.6)).toBe(3);
  });
});

describe('both radii have to agree', () => {
  it('keeps a shop out of a search it said it would not travel to', () => {
    /* The citizen's radius is how far they are willing to LOOK; the shop's is
       how far it is willing to GO. A shop that said five does not appear to
       somebody six away who widened their own search to ten — it already
       answered that question. */
    expect(servesAt(5, 4.9)).toBe(true);
    expect(servesAt(5, 5)).toBe(true);
    expect(servesAt(5, 6)).toBe(false);
  });

  it('does not make a listing written before this vanish', () => {
    /* NULL IS NOT ZERO. A row with no radius falls through to the citizen's
       search alone, which is exactly what it did yesterday. Reading null as
       "serves nobody" would empty every shelf in the city on the day this
       shipped. */
    expect(servesAt(null, 40)).toBe(true);
    expect(servesAt(undefined, 40)).toBe(true);
  });
});
