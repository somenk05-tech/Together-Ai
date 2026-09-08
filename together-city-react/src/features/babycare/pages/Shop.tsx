/**
 * ── THE BABY STORE ──────────────────────────────────────────────────────────
 *
 * 323 rows, seven aisles, and one filter that matters: how old is the child.
 *
 * THREE THINGS THIS PAGE DOES THAT AN ORDINARY STOREFRONT DOES NOT.
 *
 * 1 · IT NAMES WHAT IT READ, at the top, on every state — see ChildBar. A shelf
 *     that has quietly fallen back to the general case looks identical to one
 *     that knows your child.
 *
 * 2 · IT KEEPS THE ROWS WHOSE SELLER STATED NO AGE, and puts them under their
 *     own heading rather than mixing them in or dropping them. 159 of the 323
 *     are in that state, because most Indian baby storefronts print no age at
 *     all and diaper packs print a weight. Dropping them would make the age
 *     filter look far more knowledgeable than it is; mixing them in would make
 *     the same claim silently.
 *
 * 3 · IT SORTS BY PRICE OR BY AISLE AND BY NOTHING ELSE. There is no relevance
 *     ranking, no bestseller and no "picked for you", and that is not a missing
 *     feature — a ranked shelf containing infant formula is a promotion under
 *     s.3(c) of the IMS Act. The feeding aisle carries its notice above itself
 *     and every restricted tile shows a price and no badge.
 */

import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AISLES, aisleMeta } from '../aisles';
import { countsByAisle, isAgeless, useShelf } from '../api';
import { CATALOGUE, CHECKED_ON } from '../data/catalogue';
import { IMS_NOTICE } from '../ims';
import { useSelectedBand } from '../store';
import { ChildBar } from '../components/ChildBar';
import { ProductTile } from '../components/ProductTile';
import type { Aisle, BabyProduct } from '../types';

const AISLE_KEYS = new Set<string>(AISLES.map((a) => a.key));

export function Shop() {
  const band = useSelectedBand();
  const [params, setParams] = useSearchParams();
  const raw = params.get('aisle') ?? 'all';
  const aisle: Aisle | 'all' = AISLE_KEYS.has(raw) ? (raw as Aisle) : 'all';
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'aisle' | 'low' | 'high'>('aisle');
  /* THE AGE FILTER CAN BE TURNED OFF, and the button says what it does rather
     than "clear filters": a grandparent buying for a birthday is shopping for a
     child this account has never met. */
  const [ignoreAge, setIgnoreAge] = useState(false);

  const effective = ignoreAge ? null : band;
  /* THROUGH THE SEAM, not around it. `api.ts` exists so no page in this hub
     imports the catalogue to search it — the day the 323 rows move onto the
     API, this line does not change. */
  const { data: rows } = useShelf({ aisle, band: effective, q, sort });
  const counts = useMemo(() => countsByAisle(effective), [effective]);

  const dated = rows.filter((p) => !isAgeless(p));
  const ageless = rows.filter(isAgeless);
  const meta = aisle === 'all' ? null : aisleMeta(aisle);

  const setAisle = (next: Aisle | 'all') => {
    const p = new URLSearchParams(params);
    if (next === 'all') p.delete('aisle'); else p.set('aisle', next);
    setParams(p, { replace: true });
  };

  return (
    <div className="bc-stack">
      <header className="bc-head">
        <h1>The baby store</h1>
        <p className="bc-lede">
          {CATALOGUE.length} products from Indian sellers, every one read off the seller’s own page
          on {CHECKED_ON} and carrying a link to it. Where a page printed no price or no age, this
          shop prints that instead of a number.
        </p>
      </header>

      <ChildBar />

      <nav className="bc-row" aria-label="Aisles">
        <button type="button" className="bc-chip" onClick={() => setAisle('all')} aria-pressed={aisle === 'all'}>
          Everything
        </button>
        {AISLES.map((a) => (
          <button
            key={a.key}
            type="button"
            className="bc-chip"
            onClick={() => setAisle(a.key)}
            aria-pressed={aisle === a.key}
          >
            {a.label}
            <span className="bc-chip-count">{counts[a.key] ?? 0}</span>
          </button>
        ))}
      </nav>

      <div className="bc-row-end">
        <label className="bc-field bc-field-grow">
          Search
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="swaddle, thermometer, Himalaya" />
        </label>
        <label className="bc-field">
          Order
          <select value={sort} onChange={(e) => setSort(e.target.value as 'aisle' | 'low' | 'high')}>
            <option value="aisle">By kind</option>
            <option value="low">Price, low to high</option>
            <option value="high">Price, high to low</option>
          </select>
        </label>
        {band && (
          <button type="button" className="btn" onClick={() => setIgnoreAge((v) => !v)}>
            {ignoreAge ? 'Back to this child’s age' : 'Show every age'}
          </button>
        )}
      </div>

      {meta?.note && <p className="bc-note">{meta.note}</p>}

      {aisle === 'feeding' && <p className="bc-shout">{IMS_NOTICE}</p>}

      {rows.length === 0 && (
        <p className="bc-lede">Nothing on this shelf matches. Try another aisle, or show every age.</p>
      )}

      {dated.length > 0 && <Grid rows={dated} />}

      {ageless.length > 0 && (
        <section className="bc-section">
          <div className="bc-divide">
            <strong className="bc-title">Age not stated by the seller</strong>
            <span className="bc-lede">
              {ageless.length} of these. Their pages print no age — several print a weight instead —
              so this shop shows them at every age rather than deciding for the seller.
            </span>
          </div>
          <Grid rows={ageless} />
        </section>
      )}
    </div>
  );
}

function Grid({ rows }: { rows: BabyProduct[] }) {
  return (
    <div className="bc-grid">
      {rows.map((p) => <ProductTile key={p.id} product={p} />)}
    </div>
  );
}
