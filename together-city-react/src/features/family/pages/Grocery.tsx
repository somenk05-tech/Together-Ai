import { Link } from 'react-router-dom';
import { Hero, Button, EmptyState, Spinner } from '@/components/ui';
import { useBuildCart, useGroceryCart } from '@/features/nutrition/hooks';
import type { GroceryItem } from '@/features/nutrition/api';
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
  const { state } = useFamily();
  const N = headcount(state);

  if (cart.isLoading) return <Spinner label="Checking your family basket…" />;

  const items = cart.data?.items ?? [];
  const fresh = items.filter((i) => i.category === 'fresh');
  const pantry = items.filter((i) => i.category === 'pantry');
  const total = items.reduce((s, i) => s + i.priceInr, 0);

  return (
    <div>
      <Hero image="/assets/img/grocery-store-hero.webp" eyebrow="Family Nutrition · 04"
        title="Your family grocery list 🛒"
        sub="One combined list, portioned for the whole family — no duplicates, no waste."
        objectPosition="center 52%" />

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
        <span className="muted" style={{ fontSize: 12.5 }}>List built from your family meal plan · portioned for {N} {N === 1 ? 'person' : 'people'} · estimated retail prices</span>
      </div>

      <div className="card" style={{ margin: '12px 0 8px', display: 'flex', alignItems: 'center', gap: 10, background: 'var(--paper)' }}>
        <span style={{ fontSize: 18 }}>🏪</span>
        <div>
          <strong style={{ fontSize: 13.5 }}>Grocery store &amp; 11-min delivery — coming soon</strong>
          <p className="muted" style={{ fontSize: 12, margin: '2px 0 0' }}>For now you get the shopping list from your family plan; in-app ordering &amp; delivery arrive soon.</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', margin: '18px 0' }}>
        <Button variant="accent" disabled={build.isPending} onClick={() => build.mutate({ people: N })}>
          {build.isPending ? 'Building…' : items.length ? 'Rebuild from family plan' : 'Build from family plan'}
        </Button>
        <Link to="/family/weekly"><Button variant="line">Open planner</Button></Link>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--muted)', border: '1.5px solid var(--line)', borderRadius: 999, padding: '8px 14px' }}>
          Portioned for {N} {N === 1 ? 'person' : 'people'}
        </span>
        {items.length > 0 && (
          <span style={{ marginLeft: 'auto', fontFamily: 'var(--serif)', fontSize: 19, fontWeight: 600 }}>Total ₹{total}</span>
        )}
        {items.length > 0 && (
          <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--muted)', border: '1.5px solid var(--line)', borderRadius: 999, padding: '8px 14px' }}>Checkout — coming soon</span>
        )}
      </div>

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
        <span>◈ Portioned for your family</span><span>◈ No duplicates, no waste</span><span>◈ Fresh vs pantry split</span><span>◈ Ordering coming soon</span>
      </div>
    </div>
  );
}
