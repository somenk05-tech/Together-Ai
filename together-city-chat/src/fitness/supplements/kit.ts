import { sellable, type Product } from './products';

/**
 * ── THE KIT: ONE PACK PER SUPPLEMENT, INSIDE A NUMBER THE CITIZEN SET ───────
 *
 * Owner, 5 Sep: "supplements show only one option for supplement based on
 * budget — let user set budget." The Personalized Store's supplement shelf was
 * drawing every product under every shortlisted supplement — ten omega-3
 * bottles for one recommendation — which is a catalogue with a badge on it,
 * not a shortlist. A citizen with a triglyceride result does not need ten
 * fish oils; they need the one this city would buy for them, and a way to say
 * what they can spend.
 *
 * THE BUDGET IS ₹ A MONTH, TOTAL, and it is the citizen's own number, saved on
 * their Training Profile so every screen reads the same one. ONE PACK IS
 * COUNTED AS ONE MONTH — the catalogue records a price and a pack, not
 * servings, and a number invented for "days per pack" would be a dose this
 * app has promised never to calculate. The page says so, in those words.
 *
 * QUALITY IS NOT PRICE. The review's own tags decide which of the sellable
 * products under a supplement is the better pack: third-party testing, a
 * published certificate, a named certifier count for it; "Partly verified",
 * "Composition unverified", "Verify dose" and their kin count against. Price
 * is only the tie-break, cheaper first — the most expensive bottle is not the
 * best one and this file must never imply it is.
 *
 * UNDER A BUDGET the kit is filled in the plan's own order — priority before
 * consider — and each supplement takes the best pack it can while leaving the
 * cheapest pack for everything still to come, so nothing is dropped to buy a
 * premium tub early. When even the cheapest of everything does not fit, the
 * LAST supplements are dropped (consider before priority) and NAMED, with the
 * cheapest price that would have brought each back — a kit that silently
 * omits the thing the blood work asked for is worse than one that says the
 * number is too low.
 *
 * WITHOUT A BUDGET the kit is still one pack per supplement — the best-quality
 * one, cheapest on ties — and the response says a budget would change it.
 */

export interface KitRecommendation { id: string; bucket: 'priority' | 'consider' | string; name?: string }

export interface KitPick { supplement: string; productId: string; priceInr: number }
export interface KitDrop { supplement: string; name: string; cheapestInr: number | null }

export interface Kit {
  /** The citizen's number, or null when none is set. */
  budgetInr: number | null;
  picks: KitPick[];
  totalInr: number;
  dropped: KitDrop[];
  /** One pack counted as one month — said on the wire so every screen says it. */
  note: string;
}

export const KIT_NOTE = 'One pack of each is counted as a month’s supply — packs differ, so read the label. Prices are the shelf’s own.';

const GOOD = /third-party tested|published coa|heavy-metal tested|informed choice|informed protein|labdoor|trustified|creapure|iso 22000|gmp|haccp|elemental dose stated|vitashine|glycinate|bisglycinate/i;
const BAD = /partly verified|composition unverified|verify dose|sources disagree|label unclear|certifier unnamed|no 3rd-party cert|not stated|unconfirmed|inflated mrp|out of stock|unstandardised|price varies|oxide|check label dose/i;

/** The review's judgement of a pack, as a number only this file compares. */
export function quality(p: Product): number {
  let q = 0;
  for (const t of p.tags) {
    if (GOOD.test(t)) q += 2;
    if (BAD.test(t)) q -= 1;
  }
  return q;
}

/** Best pack first: quality, then price ascending. Unsellable packs are not candidates. */
export function ranked(products: Product[]): Product[] {
  return products
    .filter(sellable)
    .slice()
    .sort((a, b) => quality(b) - quality(a) || (a.priceInr ?? 0) - (b.priceInr ?? 0));
}

const SHORTLISTED = new Set(['priority', 'consider']);
const ORDER: Record<string, number> = { priority: 0, consider: 1 };

export function buildKit(recs: KitRecommendation[], products: Product[], budgetInr: number | null): Kit {
  const wanted = recs
    .filter((r) => SHORTLISTED.has(r.bucket))
    .slice()
    .sort((a, b) => (ORDER[a.bucket] ?? 9) - (ORDER[b.bucket] ?? 9));

  const options = new Map<string, Product[]>();
  for (const r of wanted) options.set(r.id, ranked(products.filter((p) => p.supplement === r.id)));

  const cheapest = (id: string): number | null => {
    const list = options.get(id) ?? [];
    return list.length ? Math.min(...list.map((p) => p.priceInr ?? 0)) : null;
  };

  // Supplements with nothing sellable under them cannot be in a kit at all,
  // and are not "dropped for budget" — they simply have no pack to pick.
  let kept = wanted.filter((r) => (options.get(r.id) ?? []).length > 0);
  const dropped: KitDrop[] = [];

  if (budgetInr !== null) {
    const cap = Math.max(0, Math.floor(budgetInr));
    // Drop from the end (consider before priority) until the cheapest of
    // everything fits. Each drop is named with the price that brings it back.
    const floorOf = (rs: KitRecommendation[]) => rs.reduce((n, r) => n + (cheapest(r.id) ?? 0), 0);
    while (kept.length && floorOf(kept) > cap) {
      const gone = kept[kept.length - 1];
      kept = kept.slice(0, -1);
      dropped.unshift({ supplement: gone.id, name: gone.name ?? gone.id, cheapestInr: cheapest(gone.id) });
    }
  }

  const picks: KitPick[] = [];
  let spent = 0;
  kept.forEach((r, i) => {
    const list = options.get(r.id) ?? [];
    let pick = list[0];
    if (budgetInr !== null) {
      const cap = Math.max(0, Math.floor(budgetInr));
      const reserve = kept.slice(i + 1).reduce((n, x) => n + (cheapest(x.id) ?? 0), 0);
      const room = cap - spent - reserve;
      pick = list.find((p) => (p.priceInr ?? 0) <= room) ?? list[list.length - 1];
    }
    picks.push({ supplement: r.id, productId: pick.id, priceInr: pick.priceInr ?? 0 });
    spent += pick.priceInr ?? 0;
  });

  return { budgetInr, picks, totalInr: spent, dropped, note: KIT_NOTE };
}
