/**
 * ── THE BABY CARE DISTRICT'S VOCABULARY ─────────────────────────────────────
 *
 * Two nouns hold this hub up — a CHILD and a PRODUCT — and everything else is
 * downstream of them. One definition of each, here, for the same reason the
 * Pet District keeps one: a shelf and a checklist that disagree about how old
 * the child is are two features arguing in front of a parent.
 *
 * THREE DECISIONS ARE WRITTEN INTO THESE TYPES RATHER THAN INTO THE PAGES.
 *
 * 1 · `bands` MAY BE EMPTY, and empty is a fact rather than a gap. Most Indian
 *     baby storefronts print no age at all, and Indian diaper packs print a
 *     WEIGHT. A row with no bands is shown under "Age not stated by the seller"
 *     and is never filtered away by an age the parent picked — filtering it out
 *     would be the store deciding, silently, that a product is wrong for a
 *     child on the strength of a field the seller never filled in.
 *
 * 2 · `priceInr` IS NULLABLE. See the catalogue's own header. Five rows have no
 *     confirmed price and print so.
 *
 * 3 · `gate` IS ON THE RECORD, not in a page's conditional. A thermometer is a
 *     CDSCO-notified medical device, gripe water is an AYUSH-licensed medicine
 *     and vitamin D drops need a prescription. All three are in this catalogue
 *     because parents look for them, and all three must be visibly not-shampoo
 *     wherever they appear — which only holds if the tile can see it.
 */

/**
 * SIX BANDS, AND THEY ARE THE OWNER'S 0-10 SPLIT.
 *
 * Named as strings rather than numbered so that a stored band is readable in a
 * database row and cannot be silently renumbered by inserting a seventh.
 */
export type AgeBand = '0-6m' | '6-12m' | '1-2y' | '2-4y' | '4-7y' | '7-10y';

export type Aisle =
  | 'diapering'
  | 'feeding'
  | 'bath'
  | 'health'
  | 'safety'
  | 'gear'
  | 'play';

/** Not ordinary retail. See the note above; `null` is a normal shelf product. */
export type Gate = 'pharmacy' | 'ayush' | 'device';

export interface BabyProduct {
  id: string;
  brand: string;
  name: string;
  aisle: Aisle;
  /** The seller's own word for the thing — "Feeding bottle", "Sit-in walker".
   *  `ims.ts` reads THIS to decide whether the product may be advertised, so it
   *  is a controlled vocabulary in practice even though it is a string. The
   *  guard test holds every value in the catalogue to a known list. */
  sub: string;
  /** Only where the source page stated an age. Empty means it did not. */
  bands: AgeBand[];
  /** The source page's own words for the age or weight, kept verbatim. */
  ageSaid: string | null;
  size: string | null;
  /** Null where the source printed no confirmable number. Never a guess. */
  priceInr: number | null;
  mrpInr: number | null;
  /** Where the number came from, in a sentence a parent can read. */
  basis: string;
  /** The page that was fetched. Every row has one. */
  source: string;
  gate: Gate | null;
  /** A certification the product's own page printed. Never inferred. */
  cert: string | null;
  note: string | null;
}

/**
 * ── A CHILD ─────────────────────────────────────────────────────────────────
 *
 * The smallest record that can answer "what does this shelf show". A name so a
 * parent with two children knows which shelf they are looking at, a birthday
 * because the band is DERIVED FROM IT AND NEVER STORED — a stored band is wrong
 * the morning after it is written, and this hub's whole promise is that the
 * shelf keeps up with the child.
 *
 * `notes` is the parent's own words and NOTHING READS IT. Not the shelf, not
 * the checklist, not a recommendation. It is there because a parent keeping a
 * child's record wants somewhere to put "eczema, no fragrance" — and the moment
 * the store started filtering on that sentence it would be making a medical
 * decision out of a free-text box. The hub says so on the form.
 */
export interface Child {
  id: string;
  name: string;
  /** ISO YYYY-MM-DD, or null for a parent who has not given one. */
  dob: string | null;
  notes: string;
  createdAt: string;
}
