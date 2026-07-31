import { Link } from 'react-router-dom';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { useMyOrders, inr, type DiningOrder } from '../api';

function OrderCard({ o }: { o: DiningOrder }) {
  return (
    <article className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 14, display: 'flex' }}>
      <div style={{ width: 8, background: o.mode === 'delivery' ? 'var(--accent)' : '#1565c0' }} />
      <div style={{ flex: 1, padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <strong style={{ fontSize: 16 }}>{o.restaurantName}</strong>
          <span className="muted" style={{ fontSize: 12.5 }}>{o.area}</span>
          <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: '#2e7d32', background: '#e8f5e9', borderRadius: 999, padding: '2px 10px' }}>{o.status}</span>
          <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: '#555', background: 'var(--line)', borderRadius: 999, padding: '2px 10px', textTransform: 'capitalize' }}>{o.mode === 'dinein' ? 'Dine-in' : 'Delivery'}</span>
        </div>
        <div style={{ marginTop: 8 }}>
          {o.items.map((l) => (
            <div key={l.dishId} style={{ display: 'flex', fontSize: 13, padding: '2px 0' }}>
              <span>{l.qty} × {l.name}</span>
              <span style={{ marginLeft: 'auto' }} className="muted">{inr(l.lineInr)}</span>
            </div>
          ))}
        </div>
        <div style={{ borderTop: '1px solid var(--line)', marginTop: 8, paddingTop: 8, display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
          <div className="muted" style={{ fontSize: 12 }}>Subtotal {inr(o.subtotalInr)}{o.packingInr ? ` · Packing ${inr(o.packingInr)}` : ''} · GST {inr(o.taxInr)}</div>
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <div className="eyebrow" style={{ margin: 0 }}>Paid · {o.placedOn}</div>
            <div style={{ fontWeight: 800, fontSize: 17 }}>{inr(o.totalInr)}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="eyebrow" style={{ margin: 0 }}>Order code</div>
            <div style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 16, letterSpacing: '.05em' }}>{o.code}</div>
          </div>
        </div>
      </div>
    </article>
  );
}

/** My Orders — food orders paid through the city wallet. */
export function Orders() {
  const q = useMyOrders();
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '28px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div><div className="eyebrow">Restaurants · My Orders</div><h1 style={{ fontSize: 26, margin: 0 }}>Your orders</h1></div>
        <Link to="/restaurants" style={{ marginLeft: 'auto' }}><Button variant="line" size="sm">← Discover</Button></Link>
      </div>
      {q.isLoading ? <Spinner label="Loading orders…" />
        : q.isError ? <EmptyState title="Couldn't load orders" hint="Any order you’ve placed is unaffected — we just couldn’t read the list." />
        : (q.data ?? []).length === 0 ? <EmptyState icon="🧾" title="No orders yet" hint="Order from a restaurant." />
        : <div style={{ marginTop: 16 }}>{q.data?.map((o) => <OrderCard key={o.id} o={o} />)}</div>}
    </div>
  );
}
