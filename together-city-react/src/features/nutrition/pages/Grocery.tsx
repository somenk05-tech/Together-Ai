import { Link } from 'react-router-dom';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { useBuildCart, useGroceryCart } from '../hooks';
import type { GroceryItem } from '../api';

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
          <div
            key={it.id}
            style={{
              display: 'flex', justifyContent: 'space-between', gap: 10, padding: '9px 14px', fontSize: 13.5,
              borderTop: i === 0 ? 'none' : '1px solid var(--line)', background: i % 2 ? 'var(--paper)' : 'transparent',
            }}
          >
            <span>{it.name}</span>
            <span className="muted" style={{ whiteSpace: 'nowrap' }}>×{it.qty} · ₹{it.priceInr}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Grocery Store — cart built from the weekly plan, split fresh vs pantry. */
export function Grocery() {
  const cart = useGroceryCart();
  const build = useBuildCart();

  if (cart.isLoading) return <Spinner label="Checking your basket…" />;

  const items = cart.data?.items ?? [];
  const fresh = items.filter((i) => i.category === 'fresh');
  const pantry = items.filter((i) => i.category === 'pantry');
  const total = items.reduce((s, i) => s + i.priceInr, 0);

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '28px 16px' }}>
      <div className="eyebrow">Nutrition Hub · 05</div>
      <h1 style={{ fontSize: 26 }}>Your grocery list 🛒</h1>
      <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 12px' }}>
        Built from your saved meal plan · estimated retail prices. Split into fresh and pantry so you know what to buy.
      </p>

      {/* Store & delivery — not live yet */}
      <div className="card" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10, background: 'var(--paper)' }}>
        <span style={{ fontSize: 18 }}>🏪</span>
        <div>
          <strong style={{ fontSize: 13.5 }}>Grocery store &amp; 11-min delivery — coming soon</strong>
          <p className="muted" style={{ fontSize: 12, margin: '2px 0 0' }}>For now you get the shopping list from your plan; in-app ordering &amp; delivery arrive soon.</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 18 }}>
        <Button variant="accent" disabled={build.isPending} onClick={() => build.mutate({ mode: 'individual' })}>
          {build.isPending ? 'Building…' : items.length ? 'Rebuild from weekly plan' : 'Build from weekly plan'}
        </Button>
        <Link to="/nutrition/weekly"><Button variant="line">Open planner</Button></Link>
        {items.length > 0 && (
          <span style={{ marginLeft: 'auto', fontFamily: 'var(--serif)', fontSize: 19, fontWeight: 600 }}>
            Total ₹{total}
          </span>
        )}
        {items.length > 0 && (
          <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--muted)', border: '1.5px solid var(--line)', borderRadius: 999, padding: '8px 14px' }}>
            Checkout — coming soon
          </span>
        )}
      </div>

      {build.isError && (
        <p style={{ color: '#c0392b', fontSize: 13, marginBottom: 14 }}>
          Generate a weekly plan first — then the basket fills itself.
        </p>
      )}

      {items.length === 0 ? (
        <EmptyState icon="🧺" title="Basket is empty" hint="Build it from your weekly meal plan in one tap." />
      ) : (
        <>
          <Section icon="🥬" title="Fresh & perishable" note="delivered daily" items={fresh} />
          <Section icon="🫙" title="Pantry & non-perishable" note="ships once" items={pantry} />
        </>
      )}
    </div>
  );
}
