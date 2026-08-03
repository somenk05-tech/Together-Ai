import { useMemo, useState } from 'react';
import { AllergyNote, Button, EmptyState, Spinner } from '@/components/ui';
import { useBeautyProducts, usePlaceBeautyOrder, type RecommendedProduct } from '../api';
import { payError, type PayMethod } from '@/features/financial/api';
import { PaymentSheet } from '@/features/financial/PaymentSheet';
import { ShareToChat } from '@/features/chat/share';

function ProductCard({ p, qty, onAdd, onRemove }: { p: RecommendedProduct; qty: number; onAdd: () => void; onRemove: () => void }) {
  const [why, setWhy] = useState(false);
  const scoreColor = p.matchScore >= 80 ? 'var(--ok-ink)' : p.matchScore >= 55 ? 'var(--accent)' : 'var(--muted)';
  return (
    <article className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8, borderColor: p.matched ? 'var(--accent)' : 'var(--line)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <strong style={{ fontSize: 15 }}>{p.name}</strong>
        {p.matched && (
          <span style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--on-accent)', background: scoreColor, borderRadius: 999, padding: '2px 9px', whiteSpace: 'nowrap' }}>
            {p.matchScore}% match
          </span>
        )}
        <span className="muted" style={{ marginLeft: 'auto', fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>₹{p.priceInr}</span>
      </div>
      <div className="muted" style={{ fontSize: 11.5 }}>{p.brand} · {p.category}</div>
      <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: 0 }}>{p.blurb}</p>

      {/* PRIMARY — matched to the skin & hair assessment */}
      {p.primaryReasons.length > 0 && (
        <div>
          <div className="muted" style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>Matched because</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {p.primaryReasons.map((r) => (
              <span key={r} style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--accent-ink)', background: 'var(--accent-soft)', borderRadius: 999, padding: '3px 10px' }}>{r}</span>
            ))}
          </div>
        </div>
      )}

      {/* SECONDARY — biomarker optimisation (never the headline) */}
      {p.biomarkerReasons.length > 0 && (
        <div>
          <div className="muted" style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>🩸 Optimised using your biomarkers</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {p.biomarkerReasons.map((r) => (
              <span key={r} style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--muted)', border: '1px solid var(--line)', borderRadius: 999, padding: '2px 9px' }}>{r}</span>
            ))}
          </div>
        </div>
      )}

      <div className="muted" style={{ fontSize: 11.5 }}>
        <strong style={{ color: 'var(--ink-soft)' }}>{p.actives.slice(0, 3).join(' · ')}</strong>
        {' '}· {p.usage}{!p.suitableSkin.includes('all') ? ` · for ${p.suitableSkin.join('/')} skin` : ''}
      </div>

      <button type="button" onClick={() => setWhy(!why)}
        style={{ alignSelf: 'flex-start', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11.5, fontWeight: 700, color: 'var(--accent-ink)', padding: 0 }}>
        {why ? '▾ Hide explanation' : '✨ Why was this recommended?'}
      </button>
      {why && <p style={{ fontSize: 12, lineHeight: 1.55, margin: 0, padding: '8px 10px', background: 'var(--paper)', borderRadius: 10, color: 'var(--ink-soft)' }}>{p.explanation}</p>}

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
            priceInr: p.priceInr, deepLink: '/beauty/market', meta: p.matched ? [`${p.matchScore}% match`] : [],
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
  const [seg, setSeg] = useState<'skin' | 'hair'>('skin');

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
  if (products.isError || !products.data) return <EmptyState title="Couldn't load the market" hint="Please check your connection and try again." />;

  const add = (id: string) => { setBag((b) => ({ ...b, [id]: (b[id] ?? 0) + 1 })); setPlaced(false); };
  const remove = (id: string) => setBag((b) => ({ ...b, [id]: Math.max(0, (b[id] ?? 0) - 1) }));

  const HAIR_CATS = ['Haircare', 'Hair', 'Scalp'];
  const segOf = (cat: string) => (HAIR_CATS.some((h) => cat.toLowerCase().includes(h.toLowerCase())) ? 'hair' : 'skin');
  const shown = products.data.products.filter((p) => segOf(p.category) === seg);

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '28px 16px' }}>
      <div className="eyebrow">Beauty Market · Shop</div>
      <h1 style={{ fontSize: 26 }}>Curated for you</h1>
      <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 12px' }}>
        {products.data.matchedCount > 0
          ? `${products.data.matchedCount} products matched to your skin & hair ${products.data.personalisedBy.assessment ? 'assessment' : 'profile'}${products.data.personalisedBy.labs ? ', fine-tuned by your biomarkers' : ''}.`
          : 'Complete your Skin & Hair Profile to personalise the shelf.'}
      </p>

      {/* The shelf explains why it is shorter — Beauty reads the sensitivities
          declared here AND the food allergens declared in Nutrition, so the
          link points at the Beauty profile where this hub's half is edited. */}
      <AllergyNote notice={products.data.allergyNotice} manageTo="/beauty/profile" />

      {/* segments */}
      <div style={{ display: 'inline-flex', background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 999, padding: 3, marginBottom: 16 }}>
        {([['skin', '🧴 Skin'], ['hair', '💇 Hair']] as const).map(([k, label]) => (
          <button key={k} onClick={() => setSeg(k)}
            style={{ border: 'none', cursor: 'pointer', borderRadius: 999, padding: '7px 16px', fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit',
              background: seg === k ? 'var(--card)' : 'transparent', color: seg === k ? 'var(--ink)' : 'var(--muted)', boxShadow: seg === k ? '0 1px 3px rgba(0,0,0,.08)' : 'none' }}>
            {label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <EmptyState
          icon="🧴"
          title={`No ${seg} products yet`}
          hint={products.data.allergyNotice
            ? 'Everything on this shelf has an ingredient you told us to avoid.'
            : 'Set your profile to personalise this shelf.'}
        />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
          {shown.map((p) => (
            <ProductCard key={p.id} p={p} qty={bag[p.id] ?? 0} onAdd={() => add(p.id)} onRemove={() => remove(p.id)} />
          ))}
        </div>
      )}

      {items.length > 0 && (
        <div className="card" style={{ position: 'sticky', bottom: 16, marginTop: 20, display: 'flex', alignItems: 'center', gap: 14, boxShadow: '0 8px 30px rgba(0,0,0,.12)' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{items.reduce((s, i) => s + i.qty, 0)} items · ₹{total}</div>
            <div className="muted" style={{ fontSize: 12 }}>{items.map((i) => `${i.name}${i.qty > 1 ? ` ×${i.qty}` : ''}`).join(', ')}</div>
          </div>
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            {placed ? (
              <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--accent-ink)' }}>✓ Paid</span>
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
