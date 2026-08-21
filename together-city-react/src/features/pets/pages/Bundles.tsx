/**
 * ── KITS ────────────────────────────────────────────────────────────────────
 *
 * Eight bundles assembled from real catalogue rows. Where the catalogue has
 * nothing verified for a slot, the card says which slot is still being sourced
 * instead of shipping a shorter kit and hoping nobody counts.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SectionTitle } from './PetsHome';
import { rupees } from '../engine/format';
import { useBundles } from '../api';
import { CATALOGUE } from '../data/catalogue';
import { usePets } from '../store';
import { fullName, shortName } from '../engine/naming';
import { PackShot } from '../components/PackShot';

const byId = new Map(CATALOGUE.map((p) => [p.id, p]));

/** Products that could join a kit: right species, not already in it. */
function searchable(query: string, species: string, already: string[]) {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  return CATALOGUE
    .filter((p) => species === 'both' || p.species === species || p.species === 'both')
    .filter((p) => !already.includes(p.id))
    .filter((p) => `${p.brand} ${p.name} ${p.subcategory}`.toLowerCase().includes(q))
    .slice(0, 8);
}

export function Bundles() {
  const nav = useNavigate();
  const { data: bundles } = useBundles();
  const addToCart = usePets((s) => s.addToCart);

  /**
   * A KIT YOU CANNOT CHANGE IS A KIT YOU DO NOT BUY.
   *
   * The curated eight are a starting point — somebody already owns a bowl, or
   * wants the bigger bed. `edits` holds the additions and removals per kit,
   * keyed by bundle id, so the curated list stays the default and the citizen's
   * version is a diff on top of it rather than a copy that stops tracking it.
   */
  const [edits, setEdits] = useState<Record<string, { removed: string[]; added: string[] }>>({});
  const [adding, setAdding] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const editOf = (id: string) => edits[id] ?? { removed: [], added: [] };
  const remove = (bundleId: string, productId: string) => setEdits((e) => {
    const cur = e[bundleId] ?? { removed: [], added: [] };
    return { ...e, [bundleId]: { removed: [...cur.removed, productId], added: cur.added.filter((a) => a !== productId) } };
  });
  const restore = (bundleId: string, productId: string) => setEdits((e) => {
    const cur = e[bundleId] ?? { removed: [], added: [] };
    return { ...e, [bundleId]: { ...cur, removed: cur.removed.filter((r) => r !== productId) } };
  });
  const add = (bundleId: string, productId: string) => setEdits((e) => {
    const cur = e[bundleId] ?? { removed: [], added: [] };
    if (cur.added.includes(productId)) return e;
    return { ...e, [bundleId]: { ...cur, added: [...cur.added, productId] } };
  });

  return (
    <div style={{ display: 'grid', gap: 22 }}>
      <SectionTitle title="Pet bundles" line="Curated kits, priced from real listings. A kit’s total counts only the items whose price we could verify." />

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
        {bundles.map((b) => {
          const edit = editOf(b.id);
          const ids = [...b.productIds.filter((id) => !edit.removed.includes(id)), ...edit.added];
          const items = ids.map((id) => byId.get(id)).filter(Boolean);
          const removedItems = edit.removed.map((id) => byId.get(id)).filter(Boolean);
          const priced = items.filter((p) => p!.priceFrom !== null);
          const total = priced.reduce((n, p) => n + (p!.priceFrom ?? 0), 0);
          return (
            <article key={b.id} className="card" style={{ padding: 20, display: 'grid', gap: 12, alignContent: 'start' }}>
              <header style={{ display: 'grid', gap: 4 }}>
                <span className="muted" style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase' }}>
                  {b.species === 'both' ? 'Dogs & cats' : b.species === 'dog' ? 'Dogs' : 'Cats'}
                </span>
                <h3 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>{b.name}</h3>
                <p className="muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.55 }}>{b.line}</p>
              </header>

              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
                {items.map((p) => (
                  <li key={p!.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, fontSize: 12.5 }}>
                    <span style={{ width: 34, flexShrink: 0 }}>
                      <PackShot src={p!.imageUrl} alt={p!.name} category={p!.category} height={34} drawnSize={26} />
                    </span>
                    <button type="button" onClick={() => nav(`/pets/shop/${p!.id}`)} style={{ border: 'none', background: 'none', padding: 0, font: 'inherit', textAlign: 'left', cursor: 'pointer', minWidth: 0, flex: 1 }}>
                      {fullName(p!)}
                    </button>
                    <span className="muted" style={{ whiteSpace: 'nowrap' }}>{p!.priceFrom ? rupees(p!.priceFrom) : '—'}</span>
                    <button
                      type="button"
                      onClick={() => remove(b.id, p!.id)}
                      aria-label={`Remove ${p!.name} from ${b.name}`}
                      title="Remove from kit"
                      style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 13, padding: '0 2px', lineHeight: 1 }}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>

              {removedItems.length > 0 && (
                <p className="muted" style={{ margin: 0, fontSize: 11.5, lineHeight: 1.5 }}>
                  Removed:{' '}
                  {removedItems.map((p, i) => (
                    <span key={p!.id}>
                      {i > 0 && ', '}
                      <button
                        type="button"
                        onClick={() => restore(b.id, p!.id)}
                        style={{ border: 'none', background: 'none', padding: 0, font: 'inherit', color: 'var(--accent-ink)', cursor: 'pointer', textDecoration: 'underline' }}
                      >
                        put the {`${p!.brand} ${shortName(p!)}`.split(' ').slice(0, 4).join(' ')} back
                      </button>
                    </span>
                  ))}
                </p>
              )}

              <div style={{ display: 'grid', gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-sm btn-line"
                  style={{ justifySelf: 'start' }}
                  onClick={() => { setAdding(adding === b.id ? null : b.id); setQuery(''); }}
                >
                  {adding === b.id ? 'Close' : '+ Add a product'}
                </button>
                {adding === b.id && (
                  <div style={{ display: 'grid', gap: 8, padding: 12, borderRadius: 'var(--r-2)', background: 'var(--wash)', border: '1px solid var(--line)' }}>
                    <input
                      autoFocus
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder={`Search 184 products for the ${b.name.toLowerCase()}`}
                      style={{ font: 'inherit', fontSize: 13, padding: '8px 11px', borderRadius: 'var(--r-2)', border: '1px solid var(--line)', background: 'var(--card)' }}
                    />
                    <ul aria-label={`Products you can add to the ${b.name}`} style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 4, maxHeight: 210, overflowY: 'auto' }}>
                      {searchable(query, b.species, ids).map((p) => (
                        <li key={p.id}>
                          <button
                            type="button"
                            aria-label={`Add ${p.name} to ${b.name}`}
                            onClick={() => { add(b.id, p.id); setQuery(''); }}
                            style={{ width: '100%', textAlign: 'left', border: 'none', background: 'none', font: 'inherit', fontSize: 12, cursor: 'pointer', padding: '6px 4px', display: 'flex', justifyContent: 'space-between', gap: 8 }}
                          >
                            <span style={{ minWidth: 0 }}>{fullName(p)}</span>
                            <span className="muted" style={{ whiteSpace: 'nowrap' }}>{p.priceFrom ? rupees(p.priceFrom) : '—'}</span>
                          </button>
                        </li>
                      ))}
                      {query.trim().length > 1 && searchable(query, b.species, ids).length === 0 && (
                        <li className="muted" style={{ fontSize: 12, padding: '6px 4px' }}>Nothing in the catalogue matches that.</li>
                      )}
                    </ul>
                  </div>
                )}
              </div>

              {b.gaps.length > 0 && (
                <p className="muted" style={{ margin: 0, fontSize: 11.5, lineHeight: 1.55 }}>
                  Still sourcing: {b.gaps.join(', ')}
                </p>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, paddingTop: 6, borderTop: '1px solid var(--line)' }}>
                <div style={{ display: 'grid' }}>
                  <strong style={{ fontSize: 20, fontWeight: 700 }}>{rupees(total)}</strong>
                  <span className="muted" style={{ fontSize: 11 }}>
                    {priced.length} of {items.length} items priced
                    {edit.removed.length || edit.added.length ? ' · edited' : ''}
                  </span>
                </div>
                <button type="button" className="btn btn-sm" onClick={() => items.forEach((p) => addToCart(p!.id, 0))} style={{ background: 'var(--accent)', color: 'var(--on-accent)', border: 'none' }}>
                  Add kit to cart
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
