import { Link } from 'react-router-dom';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { useBeautyOrders } from '../api';

/** My Orders — the beauty commerce history. */
export function Orders() {
  const orders = useBeautyOrders();

  if (orders.isLoading) return <Spinner label="Loading your orders…" />;
  if (orders.isError) return <EmptyState title="Couldn't load your orders" hint="Start the backend and reload." />;

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '28px 16px' }}>
      <div className="eyebrow">Beauty Market · Orders</div>
      <h1 style={{ fontSize: 26 }}>Your orders</h1>

      {(orders.data ?? []).length === 0 ? (
        <div>
          <EmptyState icon="🧴" title="No orders yet" hint="Find your matched products in the market." />
          <div style={{ textAlign: 'center' }}>
            <Link to="/beauty/market"><Button variant="accent" size="sm">Go to the market</Button></Link>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 16 }}>
          {orders.data?.map((o) => (
            <article key={o.id} className="card" style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <strong style={{ fontSize: 15 }}>₹{o.totalInr}</strong>
                <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--accent)', background: 'var(--accent-soft)', borderRadius: 999, padding: '2px 10px' }}>{o.status}</span>
                <span className="muted" style={{ marginLeft: 'auto', fontSize: 12 }}>{o.createdAt.slice(0, 10)}</span>
              </div>
              <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
                {o.items.map((i) => `${i.name}${i.qty > 1 ? ` ×${i.qty}` : ''}`).join(' · ')}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
