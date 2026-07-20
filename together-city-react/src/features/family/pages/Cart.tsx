import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { useBuildCart, useGroceryCart } from '@/features/nutrition/hooks';
import type { GroceryItem } from '@/features/nutrition/api';
import { useFamily, headcount } from '../members';

function Stepper({ qty, onChange }: { qty: number; onChange: (q: number) => void }) {
  const btn: React.CSSProperties = { background: 'var(--accent)', color: '#fff', border: 'none', width: 26, height: 30, fontSize: 16, lineHeight: 1, cursor: 'pointer' };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', border: '1.3px solid var(--accent)', borderRadius: 9, overflow: 'hidden' }}>
      <button type="button" onClick={() => onChange(qty - 1)} style={btn}>−</button>
      <b style={{ minWidth: 26, textAlign: 'center', fontSize: 13, color: 'var(--accent)' }}>{qty}</b>
      <button type="button" onClick={() => onChange(qty + 1)} style={btn}>+</button>
    </span>
  );
}

function Section({ icon, title, note, items, qtyOf, setQty }: {
  icon: string; title: string; note: string; items: GroceryItem[];
  qtyOf: (it: GroceryItem) => number; setQty: (id: string, q: number) => void;
}) {
  if (items.length === 0) return null;
  const sub = items.reduce((a, it) => a + it.priceInr * qtyOf(it), 0);
  return (
    <div style={{ marginBottom: 4, paddingTop: 8, borderTop: '1px solid var(--line)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '12px 0 2px' }}>
        <span style={{ fontWeight: 800, fontSize: 13.5 }}>{icon} {title}</span>
        <span style={{ fontWeight: 700, fontSize: 12.5, color: 'var(--ink-soft)' }}>₹{sub.toLocaleString('en-IN')}</span>
      </div>
      <div className="muted" style={{ fontSize: 11, paddingBottom: 6, lineHeight: 1.4 }}>{note}</div>
      {items.map((it) => {
        const q = qtyOf(it);
        return (
          <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--line)' }}>
            <span style={{ flex: 1, fontSize: 12.5, textTransform: 'capitalize', lineHeight: 1.3 }}>
              {it.name}
              <small style={{ display: 'block', color: 'var(--muted)', fontSize: 10.5 }}>₹{it.priceInr} each</small>
            </span>
            <Stepper qty={q} onChange={(nq) => setQty(it.id, nq)} />
            <span style={{ fontWeight: 700, fontSize: 12.5, minWidth: 44, textAlign: 'right' }}>₹{it.priceInr * q}</span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Your Cart — Family. The family's combined grocery cart, portioned for everyone,
 * split fresh vs pantry. Mirrors the individual Nutrition cart: adjust quantities,
 * then proceed to the shared checkout (review → delivery → payment).
 */
export function FamilyCart() {
  const cart = useGroceryCart();
  const build = useBuildCart();
  const navigate = useNavigate();
  const { state } = useFamily();
  const N = headcount(state);
  const [overrides, setOverrides] = useState<Record<string, number>>({});

  const items = useMemo(() => cart.data?.items ?? [], [cart.data]);
  const qtyOf = (it: GroceryItem) => overrides[it.id] ?? it.qty;
  const setQty = (id: string, q: number) => setOverrides((prev) => ({ ...prev, [id]: Math.max(0, q) }));

  if (cart.isLoading) return <Spinner label="Loading your cart…" />;

  const live = items.filter((it) => qtyOf(it) > 0);
  const fresh = live.filter((it) => it.category === 'fresh');
  const pantry = live.filter((it) => it.category === 'pantry');
  const total = live.reduce((a, it) => a + it.priceInr * qtyOf(it), 0);
  const count = live.reduce((a, it) => a + qtyOf(it), 0);

  const proceed = () => {
    const lines = live.map((it) => ({ name: it.name, qty: qtyOf(it), price: it.priceInr }));
    navigate('/nutrition/checkout', { state: { items: lines, subtotal: total } });
  };

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '28px 16px' }}>
      <div className="eyebrow">Family Nutrition · 04</div>
      <h1 style={{ marginBottom: 6 }}>Your Cart 🛍️</h1>
      <p className="lede" style={{ marginBottom: 18 }}>
        Your family's combined grocery cart, portioned for {N} {N === 1 ? 'person' : 'people'}.{' '}
        <Link to="/family/grocery" style={{ color: 'var(--accent)', fontWeight: 600 }}>← add more from the store</Link>
      </p>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px 18px 10px' }}>
          <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            🛍️ My Cart
            <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', background: 'var(--accent)', borderRadius: 999, padding: '1px 9px' }}>{count}</span>
          </h4>
          <p className="muted" style={{ fontSize: 11.5, margin: '6px 0 0', lineHeight: 1.4 }}>Adjust quantities or rebuild from your family plan, then place your order.</p>
        </div>

        <div style={{ padding: '4px 18px' }}>
          {live.length === 0 ? (
            <div style={{ padding: '30px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
              Your cart is empty.{' '}
              <Link to="/family/grocery" style={{ color: 'var(--accent)', fontWeight: 600 }}>Browse the store →</Link>
            </div>
          ) : (
            <>
              <Section icon="🥬" title="Fresh & perishable" note="A fresh box arrives daily at your delivery time, from your Delivery Schedule." items={fresh} qtyOf={qtyOf} setQty={setQty} />
              <Section icon="🫙" title="Pantry & non-perishable" note="Ordered once — arriving now." items={pantry} qtyOf={qtyOf} setQty={setQty} />
            </>
          )}
        </div>

        <div style={{ borderTop: '1px solid var(--line)', padding: '14px 18px', background: 'var(--paper)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
            <span className="muted" style={{ fontSize: 12 }}>Estimated total</span>
            <b style={{ fontSize: 20 }}>₹{total.toLocaleString('en-IN')}</b>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginBottom: 12 }}>🥬 Fresh box daily · 🫙 pantry ships now.</div>
          <Button variant="accent" style={{ width: '100%', justifyContent: 'center' }} disabled={live.length === 0} onClick={proceed}>
            Place order
          </Button>
          <button type="button" onClick={() => { setOverrides({}); build.mutate(undefined); }}
            style={{ background: 'none', border: 'none', color: 'var(--ink-soft)', fontSize: 11.5, cursor: 'pointer', textDecoration: 'underline', fontFamily: 'inherit', margin: '10px auto 0', display: 'block' }}>
            ↺ Reset cart to my meal plan
          </button>
          <Link to="/family/grocery">
            <Button variant="line" style={{ width: '100%', justifyContent: 'center', marginTop: 10 }}>← Add more from the store</Button>
          </Link>
        </div>
      </div>

      {items.length === 0 && !cart.isLoading && (
        <div style={{ marginTop: 18 }}>
          <EmptyState icon="🧺" title="Nothing here yet" hint="Build a basket from your family meal plan first." />
          <div style={{ textAlign: 'center', marginTop: 12 }}>
            <Button variant="accent" disabled={build.isPending} onClick={() => build.mutate(undefined)}>
              {build.isPending ? 'Building…' : 'Build from family plan'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
