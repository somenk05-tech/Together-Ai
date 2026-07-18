import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Hero, Button, EmptyState, Spinner } from '@/components/ui';
import { useBuildCart, useGroceryCart, usePlaceOrder } from '@/features/nutrition/hooks';
import type { GroceryItem } from '@/features/nutrition/api';
import { payError, type PayMethod } from '@/features/financial/api';
import { PaymentSheet } from '@/features/financial/PaymentSheet';
import { useFamily, headcount } from '../members';

function Section({ icon, title, note, items }: { icon: string; title: string; note: string; items: GroceryItem[] }) {
  if (items.length === 0) return null;
  const total = items.reduce((s, i) => s + i.priceInr, 0);
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <h2 style={{ fontSize: 17 }}>{icon} {title}</h2>
        <span className="muted" style={{ fontSize: 12 }}>{note}</span>
        <span style={{ marginLeft: 'auto', fontWeight: 700, fontSize: 14 }}>₹{total}</span>
      </div>
      <div style={{ border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden', marginTop: 12 }}>
        {items.map((it, i) => (
          <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '9px 14px', fontSize: 13.5, borderTop: i === 0 ? 'none' : '1px solid var(--line)', background: i % 2 ? 'var(--paper)' : 'transparent' }}>
            <span style={{ textTransform: 'capitalize' }}>{it.name}</span>
            <span className="muted" style={{ whiteSpace: 'nowrap' }}>×{it.qty} · ₹{it.priceInr}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Grocery Store — Family (family-grocery.html).
 * One combined basket, built from the shared family meal plan and portioned for
 * the whole family. Wired to the nutrition cart + order endpoints.
 */
export function FamilyGrocery() {
  const cart = useGroceryCart();
  const build = useBuildCart();
  const placeOrder = usePlaceOrder();
  const navigate = useNavigate();
  const { state } = useFamily();
  const N = headcount(state);
  const [payOpen, setPayOpen] = useState(false);

  if (cart.isLoading) return <Spinner label="Checking your family basket…" />;

  const items = cart.data?.items ?? [];
  const fresh = items.filter((i) => i.category === 'fresh');
  const pantry = items.filter((i) => i.category === 'pantry');
  const total = items.reduce((s, i) => s + i.priceInr, 0);

  return (
    <div>
      <Hero image="/assets/img/grocery-store-hero.webp" eyebrow="Family Nutrition · 04"
        title="Grocery Store 🛒"
        sub="One combined basket, portioned for the whole family — no duplicates, no waste."
        objectPosition="center 52%" />

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, background: 'var(--accent-soft)', color: 'var(--ink)', padding: '6px 12px', borderRadius: 999 }}>
          ⚡ Delivery in <b style={{ color: 'var(--accent)' }}>11 min</b>
        </span>
        <span className="muted" style={{ fontSize: 12.5 }}>Cart pre-filled from your family meal plan · portioned for {N} {N === 1 ? 'person' : 'people'} · estimated retail prices</span>
        <Link to="/family/cart" style={{ marginLeft: 'auto' }}><Button variant="accent" size="sm">🛍️ See cart</Button></Link>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', margin: '18px 0' }}>
        <Button variant="accent" disabled={build.isPending} onClick={() => build.mutate(undefined)}>
          {build.isPending ? 'Building…' : items.length ? 'Rebuild from family plan' : 'Build from family plan'}
        </Button>
        <Link to="/family/weekly"><Button variant="line">Open planner</Button></Link>
        {items.length > 0 && (
          <span style={{ marginLeft: 'auto', fontFamily: 'var(--serif)', fontSize: 19, fontWeight: 600 }}>Total ₹{total}</span>
        )}
        {items.length > 0 && <Button variant="gold" onClick={() => setPayOpen(true)}>Checkout · ₹{total}</Button>}
      </div>

      <PaymentSheet
        open={payOpen}
        amountInr={total}
        label={`Family grocery order · ${items.length} items`}
        pending={placeOrder.isPending}
        error={placeOrder.isError ? payError(placeOrder.error) : null}
        onCancel={() => setPayOpen(false)}
        onPay={(method: PayMethod) => placeOrder.mutate(method, { onSuccess: () => { setPayOpen(false); navigate('/family/orders'); } })}
      />

      {build.isError && (
        <p style={{ color: '#c0392b', fontSize: 13, marginBottom: 14 }}>Generate a family weekly plan first — then the basket fills itself.</p>
      )}

      {items.length === 0 ? (
        <EmptyState icon="🧺" title="Basket is empty" hint="Build it from your family meal plan in one tap." />
      ) : (
        <>
          <Section icon="🥬" title="Fresh & perishable" note="a fresh box daily" items={fresh} />
          <Section icon="🫙" title="Pantry & non-perishable" note="ships once" items={pantry} />
        </>
      )}

      <div className="trust">
        <span>◈ 11-min Delivery</span><span>◈ Fresh Perishables Daily</span><span>◈ Spices Every 2 Months</span><span>◈ Quality Checked</span>
      </div>
    </div>
  );
}
