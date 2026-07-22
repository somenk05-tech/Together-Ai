import { Link } from 'react-router-dom';
import { Button, Card, EmptyState, Spinner, Tag } from '@/components/ui';
import { useNutritionOrders, useQcTrack } from '../hooks';
import type { NutritionOrder } from '../api';

/** Live quick-commerce tracking — polls every 10s until delivered. */
function LiveTracking({ order }: { order: NutritionOrder }) {
  const track = useQcTrack(order.id, order.qc?.tracking.delivered ?? true);
  const t = track.data?.tracking ?? order.qc?.tracking;
  if (!t) return null;
  return (
    <div style={{ marginTop: 12, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <span style={{ fontSize: 18 }}>{t.provider.icon}</span>
        <b style={{ fontSize: 13.5 }}>{t.provider.name}</b>
        {t.delivered
          ? <Tag>Delivered ✓</Tag>
          : <Tag>Arriving in ~{t.arrivingInMinutes} min</Tag>}
        {!t.delivered && (
          <span className="muted" style={{ fontSize: 11.5 }}>
            🛵 {t.rider.name} · ★ {t.rider.rating}
          </span>
        )}
      </div>
      {/* progress bar */}
      <div style={{ height: 6, borderRadius: 999, background: 'var(--line)', overflow: 'hidden', marginBottom: 10 }}>
        <div style={{ width: `${t.progressPct}%`, height: '100%', borderRadius: 999,
          background: t.delivered ? '#2e7d4f' : 'var(--accent)', transition: 'width 1s ease' }} />
      </div>
      <div style={{ display: 'grid', gap: 4 }}>
        {t.stages.map((s) => (
          <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5,
            color: s.done ? 'var(--ink)' : s.current ? 'var(--accent)' : 'var(--muted)' }}>
            <span style={{ width: 16, textAlign: 'center' }}>{s.done ? '✓' : s.current ? '●' : '○'}</span>
            <span style={{ fontWeight: s.current ? 700 : 400 }}>{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function OrderCard({ o }: { o: NutritionOrder }) {
  const placed = new Date(o.createdAt);
  return (
    <Card style={{ padding: '16px 20px', marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <b style={{ fontSize: 14 }}>
            {o.qc ? `${o.qc.providerIcon} ${o.qc.providerName} · express` : '🥬 Weekly plan order'}
          </b>
          <p className="muted" style={{ fontSize: 11.5, margin: '2px 0 0' }}>
            {placed.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · {placed.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
            · {o.items.length} items
          </p>
        </div>
        <b style={{ fontSize: 15 }}>₹{o.totalInr.toLocaleString('en-IN')}</b>
      </div>
      {o.qc && <LiveTracking order={o} />}
      {!o.qc && o.deliveries.length > 0 && (
        <p className="muted" style={{ fontSize: 12, margin: '8px 0 0' }}>
          {o.deliveries.filter((d) => d.status === 'delivered').length}/{o.deliveries.length} daily fresh deliveries completed
        </p>
      )}
    </Card>
  );
}

/** My Orders — quick-commerce express orders with LIVE tracking + weekly plan orders. */
export function Orders() {
  const orders = useNutritionOrders();
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '28px 16px' }}>
      <div className="eyebrow">Nutrition Hub · My Orders</div>
      <h1 style={{ fontSize: 26, marginBottom: 8 }}>Deliveries &amp; orders</h1>
      <p className="muted" style={{ fontSize: 13.5, margin: '0 0 18px' }}>
        Express quick-commerce orders track live below; weekly plan orders show their daily fresh deliveries.
      </p>
      {orders.isLoading && <Spinner label="Loading your orders…" />}
      {orders.data?.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: '44px 24px' }}>
          <div style={{ fontSize: 34, marginBottom: 10 }}>📦</div>
          <h2 style={{ fontSize: 20, marginBottom: 6 }}>No orders yet</h2>
          <p className="muted" style={{ fontSize: 13.5, maxWidth: 440, margin: '0 auto 18px' }}>
            Generate a grocery list from your meal plan, compare it across every store, and your first
            express order will track live right here.
          </p>
          <Link to="/nutrition/grocery"><Button variant="accent">View your grocery list →</Button></Link>
        </div>
      )}
      {orders.isError && <EmptyState title="Couldn't load orders" hint="Reload in a moment." />}
      {(orders.data ?? []).map((o) => <OrderCard key={o.id} o={o} />)}
    </div>
  );
}
