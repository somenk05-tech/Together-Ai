/**
 * ── ONE STOREFRONT, MANY SHELVES ────────────────────────────────────────────
 *
 * The owner's brief, 22 Aug: open a shelf from the Personalized Store and land
 * in a shop — white, Shopify-shaped, no hub rail, one way back — showing only
 * what that shelf shortlisted. Not the hub's own room wearing a different
 * stylesheet: a store.
 *
 * FIVE SHELVES FEED THIS AND THEY AGREE ABOUT ALMOST NOTHING. The beauty
 * routine returns picks joined to steps; the fitness store returns products
 * carrying a `yours` verdict; the gemstone bench takes commissions rather than
 * quantities; the grocery list cannot be ordered at all yet; the pet cart lives
 * in the browser. So the shell is told nothing about any of them — it is handed
 * a `Shop`, and each shelf has one small adapter that builds one.
 *
 * WHICH MEANS THE PRICES ARE NEVER THIS FILE'S. Every number below is quoted
 * from the shelf that owns it, already formatted where the server formats it
 * ("about 2½ months", "one 88 ml pack"). A second copy of that arithmetic in
 * the storefront would be a second answer the day either was corrected — the
 * lesson the beauty routine already wrote down.
 */

export interface ShopItem {
  id: string;
  name: string;
  /** Who makes it. Absent on shelves that do not name a maker. */
  brand?: string;
  /** What kind of thing it is — the fallback mark when no photograph loads. */
  category: string;
  priceInr: number;
  /** The shelf's own second number, ready to print: "≈ ₹591/month to keep". */
  keepLabel?: string;
  /** "one 88 ml pack — about 3 months", quoted whole. */
  packLabel?: string;
  /** Essential / High value / Optional, in the shelf's own words. */
  tier?: string;
  /** Where it sits in the routine — "Cleanse", "Moisturise". */
  role?: string;
  /** Why this one, in the assessment's words. Two at most on a tile. */
  why?: string[];
  image?: string;
  imageAlt?: string;
}

export interface ShopBagLine { id: string; name: string; priceInr: number; qty: number; image?: string; imageAlt?: string; category: string }
export interface ShopBag { lines: ShopBagLine[]; count: number; totalInr: number; removed: number }

export type PayMethodChoice = 'wallet' | 'card';

/**
 * What a shelf hands the storefront. Read the top half, write the bottom.
 *
 * `blocked` is the honest exit: a shelf that cannot be bought from yet says so
 * in one sentence and the store draws a window rather than a till. Nothing here
 * pretends a checkout exists where one does not.
 */
export interface Shop {
  key: string;
  /** This shop's own two screens, from the one map that holds them. */
  screens: { shelf: string; bag: string };
  title: string;
  line: string;
  /** The profile this shelf reads, and where it is filled in. */
  from?: { label: string; path: string };
  /** The room the shelf lives in — named once, at the foot, as provenance. */
  hubName: string;
  hubPath: string;

  items: ShopItem[];
  isLoading: boolean;
  isError: boolean;
  /** Why the shelf is empty, when it is — not "no results" but the reason. */
  emptyTitle?: string;
  emptyHint?: string;

  /** Null when this shelf has no till. `blocked` then says why. */
  bag: ShopBag | null;
  blocked?: string;
  isSaving: boolean;
  qtyOf: (id: string) => number;
  add: (id: string) => void;
  remove: (id: string) => void;
  clear: () => void;

  pay: (method: PayMethodChoice, done: () => void) => void;
  payPending: boolean;
  payError: string | null;
}
