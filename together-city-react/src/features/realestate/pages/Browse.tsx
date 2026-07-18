import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { useListings, type ListingQuery } from '../api';
import { PropertyCardView } from '../components/PropertyCardView';

const TYPES = [{ k: '', l: 'All types' }, { k: 'apartment', l: 'Apartment' }, { k: 'villa', l: 'Villa' }, { k: 'plot', l: 'Plot' }, { k: 'commercial', l: 'Commercial' }];
const LISTING = [{ k: '', l: 'Buy or rent' }, { k: 'sale', l: 'Buy' }, { k: 'rent', l: 'Rent' }];
const BHK = [{ k: 0, l: 'Any BHK' }, { k: 2, l: '2+ BHK' }, { k: 3, l: '3+ BHK' }, { k: 4, l: '4+ BHK' }];

/** Browse — ready-to-move listings with filters. Under-construction lives in its own tab. */
export function Browse() {
  const [q, setQ] = useState<ListingQuery>({});
  const listings = useListings(q);

  const Chip = ({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) => (
    <button type="button" onClick={onClick}
      style={{ cursor: 'pointer', borderRadius: 999, padding: '6px 13px', fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit',
        border: `1.5px solid ${on ? 'var(--accent)' : 'var(--line)'}`, background: on ? 'var(--accent)' : 'transparent', color: on ? '#fff' : 'var(--ink-soft)' }}>{label}</button>
  );

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '28px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div className="eyebrow">Real Estate · Buy & Rent</div>
          <h1 style={{ fontSize: 26, margin: 0 }}>Ready-to-move homes</h1>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <Link to="/realestate/under-construction"><Button variant="line" size="sm">🏗 Under construction</Button></Link>
          <Link to="/realestate/post"><Button variant="accent" size="sm">＋ Post a property</Button></Link>
        </div>
      </div>

      <div className="card" style={{ margin: '16px 0', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {LISTING.map((o) => <Chip key={o.l} on={(q.listingType ?? '') === o.k} label={o.l} onClick={() => setQ({ ...q, listingType: o.k || undefined })} />)}
        <span style={{ width: 1, background: 'var(--line)', margin: '0 2px' }} />
        {TYPES.map((o) => <Chip key={o.l} on={(q.propertyType ?? '') === o.k} label={o.l} onClick={() => setQ({ ...q, propertyType: o.k || undefined })} />)}
        <span style={{ width: 1, background: 'var(--line)', margin: '0 2px' }} />
        {BHK.map((o) => <Chip key={o.l} on={(q.minBedrooms ?? 0) === o.k} label={o.l} onClick={() => setQ({ ...q, minBedrooms: o.k || undefined })} />)}
      </div>

      {listings.isLoading ? <Spinner label="Finding homes…" />
        : listings.isError ? <EmptyState title="Couldn't load listings" hint="Start the backend and reload." />
        : (listings.data ?? []).length === 0 ? <EmptyState icon="🏠" title="No matching homes" hint="Try widening your filters." />
        : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
            {listings.data?.map((p) => <PropertyCardView key={p.id} p={p} />)}
          </div>
        )}
    </div>
  );
}
