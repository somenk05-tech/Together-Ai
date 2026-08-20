/**
 * ── KITS ────────────────────────────────────────────────────────────────────
 *
 * Eight bundles assembled from real catalogue rows. Where the catalogue has
 * nothing verified for a slot, the card says which slot is still being sourced
 * instead of shipping a shorter kit and hoping nobody counts.
 */

import { useNavigate } from 'react-router-dom';
import { SectionTitle } from './PetsHome';
import { rupees } from '../engine/format';
import { useBundles } from '../api';
import { CATALOGUE } from '../data/catalogue';
import { usePets } from '../store';
import { fullName } from '../engine/naming';
import { PackShot } from '../components/PackShot';

const byId = new Map(CATALOGUE.map((p) => [p.id, p]));

export function Bundles() {
  const nav = useNavigate();
  const { data: bundles } = useBundles();
  const addToCart = usePets((s) => s.addToCart);

  return (
    <div style={{ display: 'grid', gap: 22 }}>
      <SectionTitle title="Pet bundles" line="Curated kits, priced from real listings. A kit’s total counts only the items whose price we could verify." />

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
        {bundles.map((b) => {
          const items = b.productIds.map((id) => byId.get(id)).filter(Boolean);
          const priced = items.filter((p) => p!.priceFrom !== null);
          const total = priced.reduce((n, p) => n + (p!.priceFrom ?? 0), 0);
          return (
            <article key={b.id} className="card" style={{ padding: 20, display: 'grid', gap: 12, alignContent: 'start' }}>
              <header style={{ display: 'grid', gap: 4 }}>
                <span className="muted" style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase' }}>
                  {b.species === 'both' ? 'Dogs & cats' : b.species === 'dog' ? 'Dogs' : 'Cats'}
                </span>
                <h3 style={{ margin: 0, fontSize: 19, fontWeight: 600 }}>{b.name}</h3>
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
                  </li>
                ))}
              </ul>

              {b.gaps.length > 0 && (
                <p className="muted" style={{ margin: 0, fontSize: 11.5, lineHeight: 1.55 }}>
                  Still sourcing: {b.gaps.join(', ')}
                </p>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, paddingTop: 6, borderTop: '1px solid var(--line)' }}>
                <div style={{ display: 'grid' }}>
                  <strong style={{ fontSize: 19, fontWeight: 700 }}>{rupees(total)}</strong>
                  <span className="muted" style={{ fontSize: 11 }}>
                    {priced.length} of {items.length} items priced
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
