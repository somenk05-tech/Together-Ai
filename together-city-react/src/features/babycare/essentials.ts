/**
 * ── WHAT THIS STORE CARRIES FOR A CHILD THIS AGE ────────────────────────────
 *
 * The room's title is deliberately not "what your baby needs". Nobody wrote a
 * list of what a fourteen-month-old needs into this application, and a store
 * that produced one would be giving parenting advice from a product catalogue —
 * the same move the Nutrition hub's simulated grocery prices were cut for.
 *
 * WHAT THIS ACTUALLY IS: the catalogue, grouped. For the band the child is in,
 * it walks the shelf and reports the subcategories that have anything in them,
 * with a count and a price floor. Every line is a fact about the shop rather
 * than a claim about the child. The page says so in its own masthead.
 *
 * TWO THINGS ARE CUT OUT OF IT AND BOTH ARE CUT FOR THE SAME REASON.
 *
 * · EVERY IMS-RESTRICTED ROW. A checklist entry is a recommendation, and a
 *   recommendation is a promotion under s.3(c) of the IMS Act. Formula, infant
 *   food, bottles and teats therefore never appear here at all. The page prints
 *   one line saying where they are instead, which is a signpost and not an
 *   inducement.
 * · EVERY GATED ROW — medicines, AYUSH preparations, notified devices. A store
 *   putting "vitamin D drops" on a checklist beside "hooded towel" has made a
 *   clinical suggestion in the shape of shopping. Those rows stay on their
 *   aisle, where a parent who is looking for them will find them.
 *
 * WHAT IS LEFT is ordinary retail for an ordinary age, which is a list a shop
 * is entitled to draw.
 */

import { CATALOGUE } from './data/catalogue';
import { advertisable } from './ims';
import { keepsBand } from './api';
import { AISLES } from './aisles';
import type { AgeBand, Aisle, BabyProduct } from './types';

export interface EssentialGroup {
  aisle: Aisle;
  aisleLabel: string;
  lines: EssentialLine[];
}

export interface EssentialLine {
  /** The seller's own subcategory — "Hooded towel", "Safety gate". */
  sub: string;
  count: number;
  /** The cheapest confirmed price in this line, or null if none was confirmed. */
  fromInr: number | null;
  /** How many rows in this line the catalogue could not price. */
  unpriced: number;
  /** One product to open the line on — the cheapest confirmed, else the first. */
  openId: string;
}

/** Rows a checklist may be built from: advertisable, ungated, in this band. */
export function essentialPool(band: AgeBand | null): BabyProduct[] {
  return advertisable(CATALOGUE).filter((p) => p.gate === null && keepsBand(p, band));
}

/**
 * THE GROUPS, IN AISLE ORDER.
 *
 * A line is only drawn where the band is the SELLER'S band. Rows whose seller
 * printed no age (159 of the 323) are excluded here even though the shelf keeps
 * them: on a shelf they are shown with the reason attached, and in a checklist
 * they would be this room quietly asserting an age nobody stated.
 */
export function essentialsFor(band: AgeBand | null): EssentialGroup[] {
  if (!band) return [];
  const pool = essentialPool(band).filter((p) => p.bands.includes(band));
  const out: EssentialGroup[] = [];

  for (const aisle of AISLES) {
    const rows = pool.filter((p) => p.aisle === aisle.key);
    if (rows.length === 0) continue;
    const bySub = new Map<string, BabyProduct[]>();
    for (const r of rows) {
      const list = bySub.get(r.sub) ?? [];
      list.push(r);
      bySub.set(r.sub, list);
    }
    const lines: EssentialLine[] = [...bySub.entries()].map(([sub, list]) => {
      const priced = list.filter((p) => p.priceInr !== null);
      const cheapest = priced.length
        ? priced.reduce((a, b) => ((a.priceInr ?? 0) <= (b.priceInr ?? 0) ? a : b))
        : null;
      return {
        sub,
        count: list.length,
        fromInr: cheapest?.priceInr ?? null,
        unpriced: list.length - priced.length,
        openId: (cheapest ?? list[0]).id,
      };
    }).sort((a, b) => b.count - a.count || a.sub.localeCompare(b.sub));
    out.push({ aisle: aisle.key, aisleLabel: aisle.label, lines });
  }
  return out;
}

/** How many restricted feeding rows the band has, so the page can point at them
 *  by number without laying any of them out. */
export function restrictedCountFor(band: AgeBand | null): number {
  return CATALOGUE.filter(
    (p) => keepsBand(p, band) && p.bands.length > 0 && p.aisle === 'feeding'
      && !advertisable([p]).length,
  ).length;
}
