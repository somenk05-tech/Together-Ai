/**
 * ── THE ELECTRONICS SHELF, AND WHOSE IT IS ──────────────────────────────────
 *
 * Owner, 8 Sep: "add the electronics store here" — into the Digital Store,
 * beside the grocery shelf that landed the same day.
 *
 * THE CITY OWNS NO ELECTRONICS, AND IT IS NOT GOING TO. Asked where the stock
 * should come from, the owner chose the grocery answer: LOCAL MARKET VENDORS.
 * So there is no product table behind this file, no national catalogue and no
 * price this district worked out. Every name, price and photograph below is a
 * row an electronics shop or a mobile shop typed into their own Stock list —
 * the same `ServiceMenuItem` a kitchen publishes a menu with, from the same
 * command centre, behind the same sold-out switch.
 *
 * A national catalogue with a comparison site's prices on it was available and
 * was refused, for the reason `grocery-orders-removed.spec.ts` records: this
 * hub once priced groceries from a simulation under real retailers' names, and
 * "a price nobody in this city typed" is that mistake wearing a better source.
 *
 * WHICH IS WHY THE AISLE IS A FILING DECISION AND NEVER A GUESS ABOUT THE
 * PRODUCT — the three rules `grocery.ts` holds, held again here:
 *
 *   1. THE SHOPKEEPER'S OWN WORD. `section` is the heading they typed over
 *      that part of their list — "Mobiles", "Accessories", "Home appliances".
 *      Normalised through a synonym table, which is a spelling list and not an
 *      inference.
 *   2. WHAT KIND OF SHOP IT IS. A mobile shop that typed no headings is still
 *      a mobile shop. An electronics store is deliberately absent from that
 *      table: it sells everything on this shelf, so its trade says nothing
 *      about any one row.
 *   3. EVERYTHING ELSE. A row from a general electronics store with no heading
 *      stands under "Everything else" and stays there. Reading "Galaxy S26"
 *      and deciding it is a phone would be this file inventing a fact about a
 *      product, which is the one thing the district does not do.
 *
 * `electronics.spec.ts` holds all three, and holds the fourth that matters: an
 * unknown heading lands in `other` rather than being dropped, because a
 * shopkeeper's row must never vanish from the shelf for want of a word we know.
 */

/**
 * THE TRADES THAT SELL ELECTRONICS, by the key their listing stores. Both are
 * in the "Shopping" group, which `catalogueFor` already gives a **Stock list**
 * — the publishing surface this shelf reads. Nothing had to be built for the
 * stock; what was missing was a way to read those shelves across shops.
 *
 * APPLIANCE REPAIR, AC REPAIR AND ELECTRICIANS ARE DELIBERATELY NOT HERE. They
 * are Home Services: they sell labour by the visit, and a call-out charge on a
 * shelf between a washing machine and a pair of earbuds is the store misreading
 * what the shop does — the same line the grocery shelf draws at restaurants.
 */
export const ELECTRONICS_CATEGORIES = [
  'electronics_stores',
  'mobile_shops',
] as const;

export type ElectronicsCategory = (typeof ELECTRONICS_CATEGORIES)[number];

export const isElectronicsCategory = (key: string): boolean =>
  (ELECTRONICS_CATEGORIES as readonly string[]).includes(key);

/** The aisles, in the order a shelf is walked. `other` is always last. */
export const AISLES: { key: string; label: string }[] = [
  { key: 'phones', label: 'Mobiles & Tablets' },
  { key: 'computers', label: 'Computers & Networking' },
  { key: 'tv', label: 'TV & Home Entertainment' },
  { key: 'audio', label: 'Audio' },
  { key: 'appliances', label: 'Home Appliances' },
  { key: 'kitchen', label: 'Kitchen Appliances' },
  { key: 'cooling', label: 'Fans, Coolers & ACs' },
  { key: 'power', label: 'Batteries, Inverters & Power' },
  { key: 'accessories', label: 'Cables, Chargers & Accessories' },
  { key: 'other', label: 'Everything else' },
];

const AISLE_ORDER = new Map(AISLES.map((a, i) => [a.key, i]));
export const aisleLabel = (key: string): string =>
  AISLES.find((a) => a.key === key)?.label ?? key;
export const aisleRank = (key: string): number => AISLE_ORDER.get(key) ?? AISLES.length;

/**
 * THE SHOPKEEPER'S HEADINGS, GROUPED. Each word is a heading somebody would
 * actually type over that part of their own stock list. Whole-word matching,
 * and the FIRST group below whose word appears wins — so the ORDER IS THE
 * ARGUMENT, exactly as it is in `grocery.ts` where oils stand before produce
 * or "vegetable oil" files as a vegetable.
 *
 * The three orderings that are load-bearing here:
 *
 *   POWER AND ACCESSORIES BEFORE PHONES — "mobile accessories" and "phone
 *   chargers" are an accessories shelf, not a phone shelf, and a citizen
 *   opening Mobiles to find forty covers has been sent to the wrong aisle.
 *
 *   KITCHEN BEFORE APPLIANCES — "kitchen appliances" is a kitchen heading, and
 *   filing it under the general appliance aisle loses the shopkeeper's own
 *   distinction.
 *
 *   APPLIANCES BEFORE COOLING — a heading naming both ("Fridge, washing
 *   machine & AC") is a white-goods shelf. A heading naming only cooling still
 *   reaches cooling, because no other group carries `ac`, `fan` or `cooler`.
 */
const SECTION_WORDS: { aisle: string; words: string[] }[] = [
  { aisle: 'power', words: ['battery', 'batteries', 'inverter', 'inverters', 'ups', 'power bank', 'powerbank', 'power banks', 'stabilizer', 'stabiliser', 'stabilizers', 'solar', 'generator', 'generators', 'emergency light'] },
  { aisle: 'accessories', words: ['accessory', 'accessories', 'charger', 'chargers', 'cable', 'cables', 'adapter', 'adapters', 'cover', 'covers', 'case', 'cases', 'screen guard', 'tempered glass', 'memory card', 'pen drive', 'pendrive', 'mount', 'holder', 'extension board', 'spare parts', 'spares'] },
  { aisle: 'phones', words: ['mobile', 'mobiles', 'phone', 'phones', 'smartphone', 'smartphones', 'handset', 'handsets', 'tablet', 'tablets', 'feature phone', 'landline'] },
  { aisle: 'computers', words: ['computer', 'computers', 'laptop', 'laptops', 'desktop', 'desktops', 'pc', 'printer', 'printers', 'monitor', 'monitors', 'keyboard', 'keyboards', 'mouse', 'hard disk', 'hard drive', 'ssd', 'router', 'routers', 'wifi', 'wi fi', 'networking', 'modem', 'ups systems'] },
  { aisle: 'tv', words: ['tv', 'tvs', 'television', 'televisions', 'led tv', 'smart tv', 'set top box', 'settop', 'projector', 'projectors', 'home theatre', 'home theater', 'dish', 'dth'] },
  { aisle: 'audio', words: ['audio', 'speaker', 'speakers', 'headphone', 'headphones', 'earphone', 'earphones', 'earbuds', 'buds', 'soundbar', 'sound bar', 'music system', 'woofer', 'amplifier', 'mic', 'microphone'] },
  { aisle: 'kitchen', words: ['kitchen', 'mixer', 'mixers', 'grinder', 'grinders', 'microwave', 'microwaves', 'oven', 'ovens', 'induction', 'kettle', 'kettles', 'toaster', 'blender', 'juicer', 'air fryer', 'chimney', 'chimneys', 'cooktop', 'gas stove', 'rice cooker'] },
  { aisle: 'appliances', words: ['appliance', 'appliances', 'white goods', 'refrigerator', 'refrigerators', 'fridge', 'fridges', 'washing machine', 'washing machines', 'geyser', 'geysers', 'water heater', 'water heaters', 'iron', 'irons', 'vacuum', 'dishwasher', 'water purifier', 'purifier', 'purifiers', 'sewing machine'] },
  { aisle: 'cooling', words: ['fan', 'fans', 'cooler', 'coolers', 'ac', 'acs', 'air conditioner', 'air conditioners', 'air conditioning', 'ceiling fan', 'exhaust fan', 'cooling'] },
];

/**
 * The trade a shop registered under, where that alone decides the aisle.
 *
 * `electronics_stores` is deliberately absent, for the reason a general kirana
 * is absent from the grocery table: it sells every aisle on this shelf, so its
 * trade says nothing about any one row. A mobile shop is narrow enough that
 * its trade IS a fact about its stock.
 */
const CATEGORY_AISLE: Record<string, string> = {
  mobile_shops: 'phones',
};

/** Lower-cased, punctuation flattened to single spaces, so "Home-Care /
 *  Cleaning" and "home care cleaning" are one heading. */
const normalise = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const hasWord = (haystack: string, word: string): boolean =>
  new RegExp(`(^| )${word.replace(/ /g, ' ')}( |$)`).test(haystack);

/** The shopkeeper's heading, as an aisle. Null when we do not know the word —
 *  never a guess, and never a drop. */
export function sectionAisle(section: string | null | undefined): string | null {
  if (!section) return null;
  const s = normalise(section);
  if (!s) return null;
  for (const group of SECTION_WORDS) {
    for (const w of group.words) if (hasWord(s, w)) return group.aisle;
  }
  return null;
}

/**
 * WHERE THIS ROW STANDS ON THE SHELF. The shopkeeper's heading first, the
 * trade they registered under second, "Everything else" last. Nothing here
 * reads the product's name.
 */
export function aisleOf(section: string | null | undefined, categoryKey: string): string {
  return sectionAisle(section) ?? CATEGORY_AISLE[categoryKey] ?? 'other';
}
