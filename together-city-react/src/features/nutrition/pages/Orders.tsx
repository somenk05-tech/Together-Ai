import { Link } from 'react-router-dom';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { useCancelDelivery, useOrders, useWallet } from '../hooks';
import type { NutritionOrder } from '../api';

const DAY_LABEL = ['Today', 'Tomorrow', 'Day 3', 'Day 4', 'Day 5', 'Day 6', 'Day 7'];

function WalletCard() {
  const wallet = useWallet();
  if (!wallet.data) return null;
  return (
    <div className="card" style={{ marginBottom: 18, display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
      <div>
        <div className="eyebrow" style={{ marginBottom: 2 }}>City wallet</div>
        <div style={{ fontFamily: 'var(--serif)', fontSize: 30, fontWeight: 600 }}>₹{wallet.data.balanceInr}</div>
      </div>
      <div style={{ flex: 1, minWidth: 220 }}>
        {wallet.data.transactions.slice(0, 3).map((t) => (
          <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '3px 0' }}>
            <span className="muted">{t.note ?? t.kind}</span>
            <span style={{ fontWeight: 600, color: t.kind === 'debit' ? '#c0392b' : '#2e7d32' }}>
              {t.kind === 'debit' ? '−' : '+'}₹{t.amountInr}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function OrderCard({ order }: { order: NutritionOrder }) {
  const cancel = useCancelDelivery();
  const fresh = order.items.filter((i) => i.category === 'fresh');
  const pantry = order.items.filter((i) => i.category === 'pantry');

  return (
    <article className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 16.5 }}>Order · {order.id.slice(-8)}</h2>
        <span className="muted" style={{ fontSize: 12 }}>{new Date(order.createdAt).toLocaleDateString()}</span>
        <span style={{ marginLeft: 'auto', fontWeight: 700, fontSize: 15 }}>₹{order.totalInr}</span>
      </div>
      <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
        🥬 {fresh.length} fresh items (delivered daily) · 🫙 {pantry.length} pantry items (shipped once)
      </div>

      <div style={{ marginTop: 12, border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden' }}>
        {order.deliveries.map((d, i) => (
          <div
            key={d.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', fontSize: 13,
              borderTop: i === 0 ? 'none' : '1px solid var(--line)',
              background: d.status === 'cancelled' ? 'var(--paper)' : i % 2 ? 'var(--paper)' : 'transparent',
              opacity: d.status === 'cancelled' ? 0.55 : 1,
            }}
          >
            <span style={{ width: 84, fontWeight: 600 }}>{DAY_LABEL[d.dayIndex] ?? `Day ${d.dayIndex + 1}`}</span>
            <span className="muted" style={{ fontSize: 12 }}>{d.date}</span>
            <span
              style={{
                fontSize: 10.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase',
                borderRadius: 999, padding: '2px 10px',
                background: d.status === 'scheduled' ? '#e8f5e9' : d.status === 'cancelled' ? '#ffebee' : 'var(--accent-soft)',
                color: d.status === 'scheduled' ? '#2e7d32' : d.status === 'cancelled' ? '#c62828' : 'var(--accent)',
              }}
            >
              {d.status}
            </span>
            <span style={{ marginLeft: 'auto', fontSize: 12.5 }}>₹{d.amountInr}</span>
            {d.status === 'scheduled' && (
              <Button
                size="sm" variant="line" disabled={cancel.isPending}
                onClick={() => cancel.mutate({ orderId: order.id, deliveryId: d.id })}
              >
                Cancel
              </Button>
            )}
          </div>
        ))}
      </div>
      <p className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>
        Cancelled deliveries refund to your wallet instantly. Reschedule up to 2 hours before the drop.
      </p>
    </article>
  );
}

/** My Orders — grouped items, per-day fresh deliveries, wallet economics. */
export function Orders() {
  const orders = useOrders();

  if (orders.isLoading) return <Spinner label="Fetching your orders…" />;
  if (orders.isError) return <EmptyState title="Couldn't load orders" hint="Start the backend and reload." />;

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '28px 16px' }}>
      <div className="eyebrow">Nutrition Hub · My Orders</div>
      <h1 style={{ fontSize: 26, marginBottom: 16 }}>Deliveries & wallet</h1>

      <WalletCard />

      {(orders.data ?? []).length === 0 ? (
        <>
          <EmptyState icon="📦" title="No orders yet" hint="Build a grocery basket from your weekly plan, then place your first order." />
          <div style={{ textAlign: 'center', marginTop: 14 }}>
            <Link to="/nutrition/grocery"><Button variant="accent">Go to Grocery Store</Button></Link>
          </div>
        </>
      ) : (
        orders.data?.map((o) => <OrderCard key={o.id} order={o} />)
      )}
    </div>
  );
}
