import { Link } from 'react-router-dom';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { useMyListings } from '../api';
import { PropertyCardView } from '../components/PropertyCardView';

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
        <Link to="/realestate/post" style={{ marginLeft: 'auto' }}><Button variant="accent" size="sm">＋ Post a property</Button></Link>
      </div>

      {q.isLoading ? <Spinner label="Loading your listings…" />
        : q.isError ? <EmptyState title="Couldn't load your listings" hint="Start the backend and reload." />
        : (q.data ?? []).length === 0 ? <EmptyState icon="🏡" title="You haven't posted anything yet" hint="Post a property — photos are required." />
        : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16, marginTop: 16 }}>
            {q.data?.map((p) => <PropertyCardView key={p.id} p={p} />)}
          </div>
        )}
    </div>
  );
}
