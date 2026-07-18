import { useMemo, useState } from 'react';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { useBeautyProducts, usePlaceBeautyOrder, type RecommendedProduct } from '../api';
import { payError, type PayMethod } from '@/features/financial/api';
import { PaymentSheet } from '@/features/financial/PaymentSheet';
import { ShareToChat } from '@/features/chat/share';

function ProductCard({ p, qty, onAdd, onRemove }: { p: RecommendedProduct; qty: number; onAdd: () => void; onRemove: () => void }) {
  return (
    <article className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8, borderColor: p.matched ? 'var(--accent)' : 'var(--line)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <strong style={{ fontSize: 15 }}>{p.name}</strong>
        {p.matched && <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: '#fff', background: 'var(--accent)', borderRadius: 999, padding: '2px 8px' }}>Matched</span>}
        <span className="muted" style={{ marginLeft: 'auto', fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>₹{p.priceInr}</span>
      </div>
      <div className="muted" style={{ fontSize: 11.5 }}>{p.category} · {p.keyIngredient}</div>
      <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: 0 }}>{p.blurb}</p>
      {p.reasons.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {p.reasons.map((r) => (
            <span key={r} style={{ fontSize: 10.5, fontWeight: 600, color: r.startsWith('From your labs') ? 'var(--accent)' : 'var(--muted)',
              background: r.startsWith('From your labs') ? 'var(--accent-soft)' : 'transparent', border: r.startsWith('From your labs') ? 'none' : '1px solid var(--line)', borderRadius: 999, padding: '2px 9px' }}>
              {r}
            </span>
          ))}
        </div>
      )}
      <div style={{ marginTop: 'auto', paddingTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
        {qty > 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Button variant="line" size="sm" onClick={onRemove}>–</Button>
            <span style={{ fontWeight: 700, fontSize: 14 }}>{qty}</span>
            <Button variant="line" size="sm" onClick={onAdd}>+</Button>
            <span className="muted" style={{ fontSize: 12 }}>in bag</span>
          </div>
        ) : (
          <Button variant="accent" size="sm" onClick={onAdd}>Add to bag</Button>
        )}
        <span style={{ marginLeft: 'auto' }}>
          <ShareToChat label="" item={{
            kind: 'product', hub: 'Beauty', title: p.name, subtitle: `${p.category} · ${p.keyIngredient}`,
            priceInr: p.priceInr, deepLink: '/beauty/market', meta: p.matched ? ['Matched to you'] : [],
          }} />
        </span>
      </div>
    </article>
  );
}

/** Beauty Market — the science-led shelf, ranked for you; matched items come first. */
export function Market() {
  const products = useBeautyProducts();
  const place = usePlaceBeautyOrder();
  const [bag, setBag] = useState<Record<string, number>>({});
  const [placed, setPlaced] = useState(false);
  const [payOpen, setPayOpen] = useState(false);

  const items = useMemo(() => {
    const list = products.data?.products ?? [];
    return Object.entries(bag)
      .filter(([, q]) => q > 0)
      .map(([id, qty]) => {
        const p = list.find((x) => x.id === id)!;
        return { id, name: p.name, priceInr: p.priceInr, qty };
      });
  }, [bag, products.data]);
  const total = items.reduce((s, i) => s + i.priceInr * i.qty, 0);

  if (products.isLoading) return <Spinner label="Curating your shelf…" />;
  if (products.isError || !products.data) return <EmptyState title="Couldn't load the market" hint="Start the backend and reload." />;

  const add = (id: string) => { setBag((b) => ({ ...b, [id]: (b[id] ?? 0) + 1 })); setPlaced(false); };
  const remove = (id: string) => setBag((b) => ({ ...b, [id]: Math.max(0, (b[id] ?? 0) - 1) }));

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '28px 16px' }}>
      <div className="eyebrow">Beauty Market · Shop</div>
      <h1 style={{ fontSize: 26 }}>Curated for you</h1>
      <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 4px' }}>
        {products.data.matchedCount > 0
          ? `${products.data.matchedCount} products matched to ${products.data.personalisedBy.labs ? 'your labs and concerns' : 'your concerns'}.`
          : 'Set your profile or add a blood panel to personalise the shelf.'}
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14, marginTop: 16 }}>
        {products.data.products.map((p) => (
          <ProductCard key={p.id} p={p} qty={bag[p.id] ?? 0} onAdd={() => add(p.id)} onRemove={() => remove(p.id)} />
        ))}
      </div>

      {items.length > 0 && (
        <div className="card" style={{ position: 'sticky', bottom: 16, marginTop: 20, display: 'flex', alignItems: 'center', gap: 14, boxShadow: '0 8px 30px rgba(0,0,0,.12)' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{items.reduce((s, i) => s + i.qty, 0)} items · ₹{total}</div>
            <div className="muted" style={{ fontSize: 12 }}>{items.map((i) => `${i.name}${i.qty > 1 ? ` ×${i.qty}` : ''}`).join(', ')}</div>
          </div>
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            {placed ? (
              <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--accent)' }}>✓ Paid</span>
            ) : (
              <Button variant="accent" onClick={() => setPayOpen(true)}>Checkout · ₹{total}</Button>
            )}
          </div>
        </div>
      )}

      <PaymentSheet
        open={payOpen}
        amountInr={total}
        label={`Beauty market · ${items.reduce((s, i) => s + i.qty, 0)} items`}
        pending={place.isPending}
        error={place.isError ? payError(place.error) : null}
        onCancel={() => setPayOpen(false)}
        onPay={(method: PayMethod) => place.mutate({ items, method }, { onSuccess: () => { setPlaced(true); setBag({}); setPayOpen(false); } })}
      />
    </div>
  );
}
