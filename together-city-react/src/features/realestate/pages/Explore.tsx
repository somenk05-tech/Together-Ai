import { useMemo, useState } from 'react';
import { EmptyState, Hero, Spinner, Tag } from '@/components/ui';
import { useListings, type PropertyCard } from '../api';
import { PropertyCardView } from '../components/PropertyCardView';

const KINDS = [
  { k: 'houses', l: 'Houses' },
  { k: 'offices', l: 'Offices & Shops' },
] as const;
type Kind = (typeof KINDS)[number]['k'];

/** Explore — discovery view over real listings: type tabs, live text search, grid. */
export function Explore() {
  const [kind, setKind] = useState<Kind>('houses');
  const [q, setQ] = useState('');

  const listings = useListings({});
  const grid: PropertyCard[] = useMemo(() => {
    let all = listings.data ?? [];
    all = kind === 'houses'
      ? all.filter((p) => p.propertyType === 'apartment' || p.propertyType === 'villa' || p.propertyType === 'plot')
      : all.filter((p) => p.propertyType === 'commercial');
    const needle = q.trim().toLowerCase();
    if (needle) all = all.filter((p) => `${p.title} ${p.locality} ${p.city}`.toLowerCase().includes(needle));
    return all;
  }, [listings.data, kind, q]);

  return (
    <div style={{ maxWidth: 1040, margin: '0 auto', padding: '20px 16px 40px' }}>
      <Hero image="/assets/img/realestate-explore-hero.webp" objectPosition="center 55%"
        eyebrow="Real Estate · 01" title="Explore Properties That Fit Your Life"
        sub="Real listings from real owners — photo-verified and moderated before they go live." />

      {/* property-type tabs */}
      <div className="tabrow" style={{ marginBottom: 16 }}>
        {KINDS.map((t) => (
          <a key={t.k} href="#re-grid" className={kind === t.k ? 'on' : undefined}
            onClick={(e) => { e.preventDefault(); setKind(t.k); }}>{t.l}</a>
        ))}
      </div>

      {/* live search over city / locality / title */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 28 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 Search by locality, city or listing title…"
          style={{ flex: 1, border: '1.5px solid var(--line)', borderRadius: 999, padding: '12px 20px', fontSize: 14, fontFamily: 'inherit', background: 'var(--card,#fff)', color: 'var(--ink)', outline: 'none' }} />
        {q && <button type="button" className="btn btn-line btn-sm" onClick={() => setQ('')}>Clear</button>}
      </div>

      {/* property grid */}
      <section className="blk" id="re-grid">
        <div className="blk-head">
          <h2>{KINDS.find((k) => k.k === kind)?.l}{q.trim() ? ` matching “${q.trim()}”` : ''}</h2>
          <span className="muted" style={{ fontSize: 12 }}>{grid.length} listing{grid.length === 1 ? '' : 's'}</span>
        </div>
        {listings.isLoading ? <Spinner label="Finding properties…" />
          : listings.isError ? <EmptyState title="Couldn't load properties" hint="Please check your connection and try again." />
          : grid.length === 0 ? <EmptyState icon="🏠" title={q.trim() ? 'Nothing matches that search' : 'No listings yet'} hint={q.trim() ? 'Try another locality or city.' : 'Be the first — post your property from “List a Property”.'} />
          : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
              {grid.map((p) => <PropertyCardView key={p.id} p={p} />)}
            </div>
          )}
      </section>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '16px 0' }}>
        <Tag tone="green">✓ Photo-verified listings</Tag>
        <Tag tone="green">✓ Moderated before going live</Tag>
        <Tag>✓ Transparent price-per-sqft</Tag>
      </div>
    </div>
  );
}
