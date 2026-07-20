import { Link } from 'react-router-dom';
import { PageHeader, Button, EmptyState } from '@/components/ui';

/**
 * My Orders — Family (family-orders.html). Every grocery and meal order across
 * the family will appear here. In-app ordering is coming soon, so this starts
 * empty (no fabricated order history).
 */
export function FamilyOrders() {
  return (
    <div>
      <PageHeader eyebrow="Family Nutrition · 05"
        title="My Orders"
        sub="Every grocery and meal order across the family, in one place." />

      <div className="card" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10, background: 'var(--paper)' }}>
        <span style={{ fontSize: 18 }}>🏪</span>
        <div>
          <strong style={{ fontSize: 13.5 }}>In-app ordering — coming soon</strong>
          <p className="muted" style={{ fontSize: 12, margin: '2px 0 0' }}>Once ordering & delivery go live, your family’s orders and spend will show up here.</p>
        </div>
      </div>

      <EmptyState icon="🧾" title="No family orders yet"
        hint="Build a grocery list from your family plan — orders and per-member spend will appear here." />

      <div style={{ marginTop: 18, textAlign: 'center' }}>
        <Link to="/family/grocery"><Button variant="line">Open the family grocery list →</Button></Link>
      </div>
    </div>
  );
}
