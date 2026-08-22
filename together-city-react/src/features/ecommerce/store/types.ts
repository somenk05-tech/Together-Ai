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
  /**
   * WHERE BUYING IS A DECISION RATHER THAN A TAP. A gemstone has no price until
   * somebody has chosen a metal, a setting and a size — the carat weight comes
   * off body weight and the metal is priced by the gram. So the gem tiles draw
   * a link to the studio where that is decided instead of "Add to bag", and the
   * commission joins the cart once it is locked. A shelf whose add button
   * produced a line with no price would be a shop that cannot say what
   * something costs.
   */
  design?: { label: string; path: string };
  /** Which aisle of the shelf this stands in — the chips filter on it. */
  group?: string;
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
  /**
   * THE ROOM THIS SHOP WAS OPENED FROM. It was hard-coded to the Personalized
   * Store while that was the only door; the Open Market's aisles are opened
   * from the other one, and a back button that lies about where it goes is
   * worse than none.
   */
  back: { path: string; label: string };
  title: string;
  line: string;
  /** The profile this shelf reads, and where it is filled in. */
  from?: { label: string; path: string };
  /** The room the shelf lives in — named once, at the foot, as provenance. */
  hubName: string;
  hubPath: string;

  items: ShopItem[];
  /**
   * THE AISLES OF ONE SHELF, when a shelf is big enough to need them. The
   * shortlist shops have none — five products do not need a filter. The open
   * market's do: the pet catalogue alone is 184 rows, and a wall of 184 tiles
   * is a catalogue somebody scrolls past rather than a shop they browse.
   * Absent, or one group, and the chips are not drawn at all.
   */
  groups?: { key: string; label: string; count: number }[];
  /** What the count under the masthead calls them. A shortlist is
   *  "shortlisted"; an open shelf is not, and calling it that would be the
   *  shop quietly claiming it had chosen. */
  countLabel?: string;
  isLoading: boolean;
  isError: boolean;
  /** Why the shelf is empty, when it is — not "no results" but the reason. */
  emptyTitle?: string;
  emptyHint?: string;

  /** Null when this shelf has no till. `blocked` then says why. */
  bag: ShopBag | null;
  blocked?: string;
  isSaving: boolean;
  /** A commission is one of a kind: the bag shows Remove rather than ± on it. */
  fixedQty?: boolean;
  /** One sentence the shelf insists on — a disclaimer, or what is missing. */
  note?: string;
  qtyOf: (id: string) => number;
  add: (id: string) => void;
  remove: (id: string) => void;
  clear: () => void;

  pay: (method: PayMethodChoice, done: () => void) => void;
  payPending: boolean;
  payError: string | null;
}
