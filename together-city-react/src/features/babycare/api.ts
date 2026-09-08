/**
 * ── THE SEAM ────────────────────────────────────────────────────────────────
 *
 * Every page in this hub reads the catalogue through these functions and none
 * of them imports the data file directly. Today they answer from a bundled
 * array; the day the catalogue moves onto the API the shape is already the
 * shape of the call:
 *
 *   useShelf(query)   → GET /babycare/catalogue?aisle=&band=&q=
 *   useProduct(id)    → GET /babycare/catalogue/:id
 *
 * The CHILD is not behind a hook here. It is the citizen's own record and its
 * server shipped with this hub — `api/babycare.api.ts` is its wire and
 * `store.ts` is the one owner. A hook here that re-exported it would be a
 * second cache beside the store, and then the shelf and the checklist could
 * disagree about how old the child is.
 *
 * ONE RULE THIS FILE ENFORCES RATHER THAN DOCUMENTS: nothing here sorts by
 * anything that could be called a recommendation. `sort` has three settings and
 * two of them are price. There is no "best match", no popularity and no
 * bestseller, because a ranked shelf that contains formula is a promotion under
 * the IMS Act — and the way to make that impossible is to have nothing to rank
 * with. Where the hub DOES rank (the essentials list), it ranks a list that
 * `advertisable()` has already been through.
 */

import { useMemo } from 'react';
import { CATALOGUE } from './data/catalogue';
import type { AgeBand, Aisle, BabyProduct } from './types';

export interface Query<T> { data: T; loading: boolean; error: string | null }

const ok = <T,>(data: T): Query<T> => ({ data, loading: false, error: null });

export interface ShelfQuery {
  aisle?: Aisle | 'all';
  /** The child's band. See `keepsBand` for why a row with no bands survives it. */
  band?: AgeBand | null;
  q?: string;
  brand?: string;
  sort?: 'aisle' | 'low' | 'high';
  /** Rows whose price the catalogue could not confirm. Shown by default. */
  hideUnpriced?: boolean;
}

/**
 * DOES THIS ROW SURVIVE AN AGE FILTER?
 *
 * A row that names bands survives when it names this one. A row that names NO
 * bands survives every filter, because its seller never said an age and
 * dropping it would be the store inventing the seller's answer. The shelf
 * groups those rows under their own heading so the parent can see which
 * they are.
 */
export function keepsBand(p: BabyProduct, band: AgeBand | null | undefined): boolean {
  if (!band) return true;
  if (p.bands.length === 0) return true;
  return p.bands.includes(band);
}

/** Whether this row is only on the shelf because its seller stated no age. */
export function isAgeless(p: BabyProduct): boolean {
  return p.bands.length === 0;
}

const norm = (s: string) => s.toLowerCase().normalize('NFKD');

export function searchShelf(q: ShelfQuery, from: BabyProduct[] = CATALOGUE): BabyProduct[] {
  const term = q.q ? norm(q.q.trim()) : '';
  let out = from.filter((p) => {
    if (q.aisle && q.aisle !== 'all' && p.aisle !== q.aisle) return false;
    if (!keepsBand(p, q.band)) return false;
    if (q.brand && p.brand !== q.brand) return false;
    if (q.hideUnpriced && p.priceInr === null) return false;
    if (term) {
      const hay = norm(`${p.brand} ${p.name} ${p.sub} ${p.ageSaid ?? ''}`);
      if (!term.split(/\s+/).every((w) => hay.includes(w))) return false;
    }
    return true;
  });

  if (q.sort === 'low' || q.sort === 'high') {
    /* AN UNPRICED ROW SORTS LAST IN BOTH DIRECTIONS, never as zero and never as
       infinity. Treating null as a number is how "cheapest first" puts the five
       rows we could not price at the top of the page as free products. */
    const dir = q.sort === 'low' ? 1 : -1;
    out = [...out].sort((a, b) => {
      if (a.priceInr === null && b.priceInr === null) return a.name.localeCompare(b.name);
      if (a.priceInr === null) return 1;
      if (b.priceInr === null) return -1;
      return (a.priceInr - b.priceInr) * dir;
    });
  } else {
    out = [...out].sort((a, b) => a.sub.localeCompare(b.sub) || a.brand.localeCompare(b.brand)
      || a.name.localeCompare(b.name));
  }
  return out;
}

export function useShelf(q: ShelfQuery): Query<BabyProduct[]> {
  const data = useMemo(
    () => searchShelf(q),
    [q.aisle, q.band, q.q, q.brand, q.sort, q.hideUnpriced],
  );
  return ok(data);
}

export function useProduct(id: string | undefined): Query<BabyProduct | null> {
  const data = useMemo(() => CATALOGUE.find((p) => p.id === id) ?? null, [id]);
  return ok(data);
}

/** Every brand on the shelf, once, in the order a filter row should read. */
export function useBrands(aisle?: Aisle | 'all'): Query<string[]> {
  const data = useMemo(() => {
    const set = new Set<string>();
    for (const p of CATALOGUE) if (!aisle || aisle === 'all' || p.aisle === aisle) set.add(p.brand);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [aisle]);
  return ok(data);
}

/** How many rows each aisle holds for a band — the number on an aisle card. */
export function countsByAisle(band: AgeBand | null): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of CATALOGUE) {
    if (!keepsBand(p, band)) continue;
    out[p.aisle] = (out[p.aisle] ?? 0) + 1;
  }
  return out;
}
