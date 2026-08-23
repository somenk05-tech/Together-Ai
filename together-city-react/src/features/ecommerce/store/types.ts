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

/**
 * ── A CONTROL THAT CHANGES WHAT THE THING IS ────────────────────────────────
 *
 * Owner, 22 Aug: a gemstone counter where "prices move based on carats chosen
 * by the user". Every other shelf in this city sells a thing that already
 * exists — an 88 ml bottle is an 88 ml bottle, and the only choice is how many.
 * A stone is not: the carats and the grade ARE the product, and until both are
 * set there is nothing a jeweller could be asked to make and no number anybody
 * could be charged.
 *
 * SO THE SHELL KNOWS ABOUT DIALS AND NOTHING ABOUT GEMSTONES. A dial is a
 * range, a value, a way of writing that value down, and somewhere to send a new
 * one. The gem adapter supplies two; every other adapter supplies none and its
 * tiles are unchanged. The alternative was a `carats` field on `ShopItem`,
 * which would have put the word "carat" in a storefront that is deliberately
 * ignorant of what it is selling — the same mistake as a `price` in the shell.
 *
 * `format` RATHER THAN A UNIT STRING, because "4.5 ct · 4½ ratti" is not a
 * number with a suffix, and the shelf that owns the vocabulary is the one that
 * should be writing it.
 */
export interface ShopDial {
  key: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  /** The value as the shelf would write it. */
  format: (value: number) => string;
  /** What the two ends mean, when they mean something worth printing. */
  minLabel?: string;
  maxLabel?: string;
  onChange: (value: number) => void;
}

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
  /**
   * The controls that decide what this item IS. Absent on every shelf that
   * sells a finished thing, which is four of the five.
   */
  dials?: ShopDial[];
  /**
   * What the button says, where "Add to bag" is the wrong verb. The gem counter
   * sells a configuration rather than a unit, so a stone already in the bag is
   * updated rather than added a second time.
   */
  addLabel?: string;
  /**
   * What the shelf wants said under the price when a dial has moved — the
   * gem counter uses it to say a weight was held at the end of the stone's
   * customary range rather than silently pricing something else.
   */
  priceNote?: string;
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
  /**
   * ── AND THE WAY OUT OF IT (owner, 23 Aug) ─────────────────────────────────
   *
   * "For the first-time user add a link to take them to the profile to
   * complete, and take them to the respective profiles for personalization."
   *
   * The empty states already said the right thing — "Set a budget first",
   * "Your birth details first", "Not matched to you yet" — and every one of
   * them was a dead end. Somebody arriving at a personalised shop for the
   * first time was told the one thing they had to do and given nothing to
   * press; the way to do it was in another hub, behind a back button, on a
   * rail they had just left.
   *
   * EmptyState has carried an `action` since it was written, and the note
   * beside it says why: "every empty state told somebody a list was empty and
   * left them to find the way out of it". This is that note coming true one
   * more time, on the four shelves where the emptiness is the CITIZEN'S to
   * fix rather than the city's.
   *
   * IT IS PER-REASON, NOT PER-SHOP, which is the part that matters. A beauty
   * shelf with no budget goes to the routine, where the budget is set; the
   * same shelf with no profile goes to the profile. Sending both to one place
   * would be a link that is right half the time, and a link that is wrong half
   * the time is worse than no link — it teaches somebody that the button does
   * not work.
   *
   * Absent where the shelf is empty for a reason nobody using the app can do
   * anything about: an open market aisle with nothing listed, a gem counter
   * that came back empty. Those say so and offer nothing, on purpose.
   */
  emptyTo?: { label: string; path: string };

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
