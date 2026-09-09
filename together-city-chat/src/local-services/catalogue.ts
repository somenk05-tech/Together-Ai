/**
 * ── THE CITY'S GROCERY CATALOGUE, AND WHOSE FACTS IT HOLDS ──────────────────
 *
 * Owner, 8 Sep: "create an online grocery store using the internet, show all
 * the products that's available in an area."
 *
 * `grocery.ts` opens by saying the city owns no groceries, and that is still
 * true and still the point. WHAT THIS FILE ADDS IS NOT STOCK AND NOT PRICES.
 * It is a PRODUCT MASTER — the identity of a thing you can buy: its brand, the
 * words on the pack, how much is in it, its barcode, one photograph of it, and
 * the public database that row was read out of. Nothing in here is for sale
 * and nothing in here has a price.
 *
 * WHY THE SPLIT IS THE WHOLE DESIGN. On 2 August this hub priced a grocery
 * list across Blinkit, Zepto, Instamart, BigBasket and JioMart with numbers
 * that came out of a simulation, under those retailers' real names, and
 * `grocery-orders-removed.spec.ts` is the standing apology. The lesson was not
 * "never read the internet". It was that A PRICE IS A CLAIM SOMEBODY HAS TO
 * STAND BEHIND, and no scraper can stand behind one. So:
 *
 *      the catalogue says WHAT A PRODUCT IS      — from a public database,
 *                                                  with the source on the row
 *      a shopkeeper says WHAT IT COSTS HERE      — their own ServiceMenuItem,
 *                                                  their own price, their own
 *                                                  sold-out switch
 *
 * "All the products available in an area" is therefore answered by the second
 * of those, never the first: a product reaches the shelf because a real shop
 * near you published it. The catalogue's job is to spare that shop the typing
 * — a kirana carrying four hundred lines picks them off a list with photographs
 * instead of spelling "Aashirvaad Shudh Chakki Atta 5 kg" into a form — and to
 * let eight shops' rows for the same pack collapse into ONE tile that can be
 * priced against itself.
 *
 * THE THREE SOURCES, AND WHY EACH ONE. All three are public, checkable, and
 * openly licensed. None of them is a retailer, so none of them carries a price
 * for us to be tempted by.
 */

export interface CatalogueSource {
  key: string;
  /** As it is printed under a product, in full. Attribution is not optional. */
  name: string;
  /** The licence the data is published under, printed with the name. */
  licence: string;
  /** The public page or resource that shows this exact row. */
  url: (ref: string) => string;
}

export const CATALOGUE_SOURCES: Record<string, CatalogueSource> = {
  /** Packaged food and drink. Barcode is the ref, so the URL is the product. */
  openfoodfacts: {
    key: 'openfoodfacts',
    name: 'Open Food Facts',
    licence: 'ODbL',
    url: (ref) => `https://world.openfoodfacts.org/product/${encodeURIComponent(ref)}`,
  },
  /** Soap, shampoo, toothpaste — the personal care aisle, same shape. */
  openbeautyfacts: {
    key: 'openbeautyfacts',
    name: 'Open Beauty Facts',
    licence: 'ODbL',
    url: (ref) => `https://world.openbeautyfacts.org/product/${encodeURIComponent(ref)}`,
  },
  /**
   * LOOSE GOODS HAVE NO BARCODE, so a barcode database cannot name them, and a
   * shelf of packaged food with no vegetables on it is not a grocery store.
   * The Government of India's own commodity master — the list Agmarknet files
   * every mandi's arrivals under — is where "Bhindi(Ladies Finger)" and
   * "Red gram split/Arhar dal/Tur dal" come from, spelled as the state
   * marketing boards spell them. The ref is the commodity id in that list.
   *
   * It carries daily mandi PRICES too. We take none of them. A wholesale
   * quintal rate at Vashi is not what a shop charges for half a kilo, and
   * putting one on a shelf tile would be the 2 August mistake in a sarkari
   * font.
   */
  agmarknet: {
    key: 'agmarknet',
    name: 'Agmarknet, Directorate of Marketing & Inspection, Government of India',
    licence: 'Government Open Data Licence — India',
    url: () => 'https://api.agmarknet.gov.in/v1/commodities',
  },
};

export const isCatalogueSource = (key: string): boolean => key in CATALOGUE_SOURCES;

/** The full citation a tile prints under a product: source, licence, link. */
export function citation(sourceKey: string, sourceRef: string): { name: string; licence: string; url: string } | null {
  const s = CATALOGUE_SOURCES[sourceKey];
  if (!s) return null;
  return { name: s.name, licence: s.licence, url: s.url(sourceRef) };
}

/**
 * ── SEARCH IS A PREFIX MATCH ON WORDS, NOT A FUZZY GUESS ────────────────────
 *
 * A shopkeeper typing "aashir" wants Aashirvaad, and a shopkeeper typing
 * "atta" wants every atta. Both are prefixes of a word in the row's text. What
 * this deliberately does NOT do is score, stem or spell-correct: a picker that
 * silently offers "Ashirwad Whole Wheat" when the shop typed "Aashirvaad" is
 * how the wrong pack ends up on a shelf under the right name, and the shop
 * cannot see that it happened.
 *
 * `searchText` is stored on the row (brand + name + pack, lowercased) so this
 * is one indexed column rather than three ORs across the table.
 */
export function searchTerms(q: string): string[] {
  return q.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ')
    .filter((w) => w.length >= 2).slice(0, 6);
}

/** The row's own haystack. Built once at seed time and again on every write. */
export function searchTextFor(brand: string | null, name: string, pack: string | null): string {
  return [brand ?? '', name, pack ?? ''].join(' ').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * ── WHERE THE AISLE IS DECIDED, AND WHY NOT HERE ────────────────────────────
 *
 * `grocery.ts` files a SHOPKEEPER'S row by the heading the shopkeeper typed,
 * and never by reading the product's name. The same rule holds one step back
 * for a catalogue row — its aisle is the category the SOURCE DATABASE put it
 * in, never a reading of the name — but the place that rule can actually be
 * applied is `scripts/gen-grocery-catalogue.mjs`, because that is the only
 * place the source's own category still exists. By the time a row reaches this
 * file it carries a finished aisle and no group, which is deliberate: a second
 * mapping here could disagree with the one that built the data, and the row
 * would be filed one way in the file and another way on the shelf.
 *
 * `catalogue.spec.ts` holds the generator's map to the shelf's ten aisles.
 */

/** The most shops the "who has it" line on one product tile will name. */
export const SHOPS_PER_PRODUCT = 12;
