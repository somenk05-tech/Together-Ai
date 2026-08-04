import { Link } from 'react-router-dom';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { useMyListings, type PropertyCard } from '../api';
import { PropertyCardView } from '../components/PropertyCardView';

const MOD: Record<string, { label: string; bg: string; c: string }> = {
  approved: { label: '● Live in Explore', bg: 'var(--ok-soft)', c: 'var(--ok-ink)' },
  pending: { label: '◌ Pending review', bg: 'var(--warn-soft)', c: 'var(--warn-ink)' },
  review: { label: '⏳ In manual review', bg: 'var(--warn-soft)', c: 'var(--warn-ink)' },
  rejected: { label: '✕ Not published', bg: 'var(--danger-soft)', c: 'var(--danger-ink)' },
};

/** A listing card with its moderation status + reasons. */
function ListingWithStatus({ p }: { p: PropertyCard }) {
  const m = MOD[p.moderation] ?? MOD.approved;
  return (
    <div>
      <PropertyCardView p={p} />
      <div style={{ marginTop: 6, background: m.bg, color: m.c, borderRadius: 10, padding: '8px 12px', fontSize: 12 }}>
        <strong style={{ fontSize: 12 }}>{m.label}</strong>
        {p.moderation !== 'approved' && p.moderationReasons.length > 0 && (
          <ul style={{ margin: '6px 0 0', paddingLeft: 16 }}>
            {p.moderationReasons.slice(0, 4).map((r, i) => <li key={i} style={{ marginBottom: 2 }}>{r}</li>)}
          </ul>
        )}
        {p.moderation === 'rejected' && (
          <Link to="/realestate/sell" style={{ display: 'inline-block', marginTop: 6, color: m.c, fontWeight: 700 }}>Edit &amp; resubmit →</Link>
        )}
      </div>
    </div>
  );
}

/** My Listings — properties you've posted (ready + under-construction). */
export function MyListings() {
  const q = useMyListings();
  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '28px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div>
          <div className="eyebrow">Real Estate · My Listings</div>
          <h1 style={{ fontSize: 26, margin: 0 }}>Your properties</h1>
        </div>
        <Link to="/realestate/sell" style={{ marginLeft: 'auto' }}><Button variant="accent" size="sm">＋ List a property</Button></Link>
      </div>

      {q.isLoading ? <Spinner label="Loading your listings…" />
        : q.isError ? <EmptyState title="Couldn't load your listings" hint="Please check your connection and try again." />
        : (q.data ?? []).length === 0 ? <EmptyState icon="🏡" title="You haven't posted anything yet" hint="Post a property from List a Property — it appears here the moment you submit, with its review status." />
        : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16, marginTop: 16 }}>
            {q.data?.map((p) => <ListingWithStatus key={p.id} p={p} />)}
          </div>
        )}
    </div>
  );
}
