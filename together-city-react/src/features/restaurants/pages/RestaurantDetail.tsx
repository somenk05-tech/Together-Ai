import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AllergyMarkTag, Button, EmptyState, Spinner } from '@/components/ui';
import { useRestaurant, usePlaceOrder, useReserve, useRestaurantOverview, inr, dietDot, type Dish } from '../api';
import { PaymentSheet } from '@/features/financial/PaymentSheet';
import { payError, type PayMethod } from '@/features/financial/api';
import { ShareToChat } from '@/features/chat/share';

type Cart = Record<string, number>; // dishId -> qty

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ textAlign: 'center', minWidth: 56 }}>
      <div style={{ fontSize: 14, fontWeight: 700 }}>{value}</div>
      <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div>
    </div>
  );
}

function DietTag({ d }: { d: Dish }) {
  return <span title={d.dietLabel} style={{ width: 13, height: 13, borderRadius: 3, border: `1.5px solid ${dietDot(d.diet)}`, display: 'inline-grid', placeItems: 'center', flexShrink: 0 }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: dietDot(d.diet) }} /></span>;
}

function DishRow({ d, qty, onAdd, onSub }: { d: Dish; qty: number; onAdd: () => void; onSub: () => void }) {
  const dim = d.fitsYourDiet === false;
  return (
    <div style={{ display: 'flex', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--line)', opacity: dim ? 0.55 : 1 }}>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <DietTag d={d} />
          <strong style={{ fontSize: 14.5 }}>{d.name}</strong>
          {d.bestseller && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--warn-ink)', background: 'var(--warn-soft)', borderRadius: 6, padding: '1px 6px' }}>★ Bestseller</span>}
          {d.spicy && <span title="Spicy" style={{ fontSize: 11 }}>🌶️</span>}
          {d.fitsYourDiet === true && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--ok-ink)', background: 'var(--ok-soft)', borderRadius: 6, padding: '1px 6px' }}>fits your plan</span>}
          {d.fitsYourDiet === false && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--danger-ink)', background: 'var(--danger-soft)', borderRadius: 6, padding: '1px 6px' }}>off your plan</span>}
        </div>
        <div className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>{d.desc}</div>
        <div><AllergyMarkTag mark={d.allergen} /></div>
        <div style={{ fontWeight: 700, fontSize: 13.5, marginTop: 5 }}>{inr(d.priceInr)}</div>
      </div>
      <div style={{ alignSelf: 'center' }}>
        {qty === 0
          ? <Button variant="line" size="sm" onClick={onAdd}>Add</Button>
          : (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, border: '1.5px solid var(--accent)', borderRadius: 10, padding: '4px 10px' }}>
              <button type="button" onClick={onSub} aria-label="Decrease quantity" style={{ cursor: 'pointer', border: 'none', background: 'none', fontSize: 16, fontWeight: 700, color: 'var(--accent-ink)' }}>−</button>
              <span style={{ fontWeight: 700, minWidth: 14, textAlign: 'center' }}>{qty}</span>
              <button type="button" onClick={onAdd} aria-label="Increase quantity" style={{ cursor: 'pointer', border: 'none', background: 'none', fontSize: 16, fontWeight: 700, color: 'var(--accent-ink)' }}>+</button>
            </div>
          )}
      </div>
    </div>
  );
}

/** Restaurant detail — menu with diet flags, an order cart (pays via the city wallet), and table reservation. */
export function RestaurantDetail() {
  const { id = '' } = useParams();
  const q = useRestaurant(id);
  const overview = useRestaurantOverview(id);
  const place = usePlaceOrder();
  const reserve = useReserve();

  const [cart, setCart] = useState<Cart>({});
  const [mode, setMode] = useState<'delivery' | 'dinein'>('delivery');
  const [payOpen, setPayOpen] = useState(false);

  // reservation form
  const [rDate, setRDate] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); });
  const [rTime, setRTime] = useState('20:00');
  const [party, setParty] = useState(2);
  const [rName, setRName] = useState('');
  const [reserved, setReserved] = useState(false);

  const dishes = useMemo(() => (q.data?.sections ?? []).flatMap((s) => s.items), [q.data]);
  const add = (d: string) => setCart((c) => ({ ...c, [d]: (c[d] ?? 0) + 1 }));
  const sub = (d: string) => setCart((c) => { const n = (c[d] ?? 0) - 1; const cp = { ...c }; if (n <= 0) delete cp[d]; else cp[d] = n; return cp; });

  const lines = useMemo(() => Object.entries(cart).map(([dishId, qty]) => { const d = dishes.find((x) => x.id === dishId); return d ? { d, qty } : null; }).filter(Boolean) as { d: Dish; qty: number }[], [cart, dishes]);
  const subtotal = lines.reduce((s, l) => s + l.d.priceInr * l.qty, 0);
  const packing = mode === 'delivery' ? (lines.length ? 40 : 0) : 0;
  const tax = Math.round(subtotal * 0.05);
  const total = subtotal + packing + tax;
  const itemCount = lines.reduce((s, l) => s + l.qty, 0);

  if (q.isLoading) return <Spinner label="Loading menu…" />;
  if (q.isError || !q.data) return <div style={{ padding: 28 }}><EmptyState title="Couldn't load restaurant" hint="Try again." /></div>;
  const r = q.data;

  return (
    <div className="page">
      <Link to="/restaurants/explore" style={{ textDecoration: 'none' }}><span className="eyebrow" style={{ cursor: 'pointer' }}>← Explore</span></Link>

      <div className="card" style={{ padding: 0, overflow: 'hidden', marginTop: 8 }}>
        <div style={{ position: 'relative', aspectRatio: '20 / 7', background: 'var(--line)' }}>
          <img src={r.heroUrl} alt={r.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          <div style={{ position: 'absolute', left: 16, bottom: 12, color: 'var(--on-accent)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, opacity: .95 }}>{r.icon} {r.cuisineLabel}</div>
            <div style={{ fontSize: 24, fontWeight: 800 }}>{r.name}</div>
          </div>
          <span style={{ position: 'absolute', top: 12, right: 12, fontSize: 13, fontWeight: 800, color: 'var(--on-accent)', background: 'rgba(27,122,58,.92)', borderRadius: 8, padding: '4px 10px' }}>★ {r.rating.toFixed(1)}</span>
        </div>
        <div style={{ padding: '12px 16px', display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="muted" style={{ fontSize: 13 }}>{r.tagline}</span>
          <span style={{ marginLeft: 'auto' }}>
            <ShareToChat item={{
              kind: 'restaurant', hub: 'Restaurants', title: r.name, subtitle: r.tagline,
              image: r.heroUrl, priceInr: r.priceForTwoInr, deepLink: `/restaurants/${r.id}`,
              meta: [r.cuisineLabel, r.area, `★ ${r.rating.toFixed(1)}`],
            }} />
          </span>
        </div>
        <div style={{ padding: '0 16px 12px' }}><span className="muted" style={{ fontSize: 13 }}>{r.area} · {inr(r.priceForTwoInr)} for two · {r.openHours}</span></div>
      </div>

      {r.dietProfile && (
        <div style={{ marginTop: 12, fontSize: 12.5, color: 'var(--ok-ink)', background: 'var(--ok-soft)', borderRadius: 10, padding: '9px 13px' }}>
          🥗 Personalised for your <strong>{r.dietProfile}</strong> plan from the Nutrition hub — dishes that don’t fit are dimmed and tagged.
        </div>
      )}

      {/* Together City assessment */}
      {r.breakdown && (
        <div className="card" style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', flex: '0 0 auto', background: `conic-gradient(var(--ok-ink) ${r.breakdown.tcScore * 3.6}deg, var(--line) 0)`, display: 'grid', placeItems: 'center' }}>
              <div style={{ width: 50, height: 50, borderRadius: '50%', background: 'var(--card)', display: 'grid', placeItems: 'center', textAlign: 'center', lineHeight: 1 }}>
                <div><b style={{ fontSize: 17 }}>{r.breakdown.tcScore}</b><div style={{ fontSize: 7.5, color: 'var(--muted)', letterSpacing: '.04em' }}>TC SCORE</div></div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', flex: 1 }}>
              {r.category && <Fact label="Category" value={r.category} />}
              <Fact label="Google" value={`★ ${r.breakdown.googleRating.toFixed(1)}`} />
              <Fact label="Food" value={`${r.breakdown.food}/5`} />
              <Fact label="Hygiene" value={`${r.breakdown.hygiene}/5`} />
              <Fact label="Value" value={`${r.breakdown.value}`} />
              {r.distanceKm != null && <Fact label="Distance" value={`${r.distanceKm} km`} />}
            </div>
          </div>
          <p className="muted" style={{ fontSize: 11, marginTop: 10, marginBottom: 0 }}>Together City assessment — a blended quality signal (food quality, rating, hygiene, value & menu), not a single source.</p>
        </div>
      )}

      {/* AI editorial overview */}
      {overview.data && (
        <div className="card" style={{ marginTop: 12, background: 'var(--accent-soft)' }}>
          <div className="eyebrow" style={{ marginTop: 0 }}>✨ What to expect{overview.data.aiPowered ? ' · AI overview' : ''}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '6px 0 10px' }}>
            {overview.data.highlights.map((h, i) => <span key={i} className="tag">{h}</span>)}
          </div>
          {overview.data.tryThese.length > 0 && <p style={{ fontSize: 13.5, margin: '0 0 6px' }}><strong>Try:</strong> {overview.data.tryThese.join(' · ')}</p>}
          <p style={{ fontSize: 13.5, margin: '0 0 6px' }}><strong>Best for:</strong> {overview.data.bestFor}</p>
          <p className="muted" style={{ fontSize: 11, margin: 0 }}>{overview.data.note}</p>
        </div>
      )}

      {/* Amenities */}
      {r.amenities && r.amenities.length > 0 && (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="eyebrow" style={{ marginTop: 0 }}>Amenities</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {r.amenities.map((a) => <span key={a} className="tag">{a}</span>)}
          </div>
        </div>
      )}

      {/* Popular dishes */}
      {r.popularDishes && r.popularDishes.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <h2 style={{ fontSize: 18, margin: '0 0 10px' }}>Popular dishes</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px,1fr))', gap: 12 }}>
            {r.popularDishes.map((d, i) => (
              <div key={i} className="card" style={{ padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <strong style={{ fontSize: 14 }}>{d.name}</strong>
                  <span style={{ fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap' }}>{inr(d.priceInr)}</span>
                </div>
                <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>{d.desc}</div>
                <div><AllergyMarkTag mark={d.allergen} /></div>
                <div style={{ marginTop: 6, display: 'flex', gap: 6, alignItems: 'center' }}>
                  {d.bestseller && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--warn-ink)', background: 'var(--warn-soft)', borderRadius: 6, padding: '1px 6px' }}>★ Bestseller</span>}
                  <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--muted)' }}>{d.dietLabel}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Reserve a table */}
      <div className="card" style={{ marginTop: 14 }}>
        <div className="eyebrow" style={{ marginTop: 0 }}>Book a table</div>
        {reserved ? (
          <div style={{ fontSize: 14, color: 'var(--ok-ink)' }}>✅ Table reserved — see it under <Link to="/restaurants/reservations">Reservations</Link>.</div>
        ) : (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label style={{ fontSize: 12 }}>Date<br /><input type="date" value={rDate} onChange={(e) => setRDate(e.target.value)} style={inp} /></label>
            <label style={{ fontSize: 12 }}>Time<br /><input type="time" value={rTime} onChange={(e) => setRTime(e.target.value)} style={inp} /></label>
            <label style={{ fontSize: 12 }}>Guests<br /><input type="number" min={1} max={20} value={party} onChange={(e) => setParty(Number(e.target.value))} style={{ ...inp, width: 70 }} /></label>
            <label style={{ fontSize: 12, flex: 1, minWidth: 140 }}>Name<br /><input value={rName} onChange={(e) => setRName(e.target.value)} placeholder="Your name" style={{ ...inp, width: '100%' }} /></label>
            <Button variant="line" disabled={!rName || reserve.isPending} onClick={() => reserve.mutate({ id: r.id, date: rDate, time: rTime, partySize: party, name: rName }, { onSuccess: () => setReserved(true) })}>
              {reserve.isPending ? 'Reserving…' : 'Reserve'}
            </Button>
          </div>
        )}
      </div>

      {/* Menu */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '20px 0 4px' }}>
        <h2 style={{ fontSize: 19, margin: 0 }}>Menu</h2>
        <div style={{ marginLeft: 'auto', display: 'inline-flex', border: '1.5px solid var(--line)', borderRadius: 10, overflow: 'hidden' }}>
          {(['delivery', 'dinein'] as const).map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)} style={{ cursor: 'pointer', border: 'none', padding: '7px 14px', fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit', textTransform: 'capitalize', background: mode === m ? 'var(--accent)' : 'transparent', color: mode === m ? 'var(--on-accent)' : 'var(--ink-soft)' }}>{m === 'dinein' ? 'Dine-in' : 'Delivery'}</button>
          ))}
        </div>
      </div>

      {r.sections.map((s) => (
        <section key={s.section} style={{ marginTop: 14 }}>
          <div className="eyebrow">{s.section}</div>
          {s.items.map((d) => <DishRow key={d.id} d={d} qty={cart[d.id] ?? 0} onAdd={() => add(d.id)} onSub={() => sub(d.id)} />)}
        </section>
      ))}

      {/* Sticky cart bar */}
      {itemCount > 0 && (
        <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, background: 'var(--card)', borderTop: '1px solid var(--line)', boxShadow: '0 -6px 20px rgba(0,0,0,.08)', padding: '12px 16px', zIndex: 30 }}>
          <div style={{ maxWidth: 820, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16 }}>{inr(total)}</div>
              <div className="muted" style={{ fontSize: 11.5 }}>{itemCount} item{itemCount > 1 ? 's' : ''} · {mode === 'delivery' ? `incl. ₹${packing} packing + ₹${tax} GST` : `incl. ₹${tax} GST`}</div>
            </div>
            <Button variant="accent" style={{ marginLeft: 'auto' }} onClick={() => setPayOpen(true)}>{mode === 'delivery' ? 'Order' : 'Order for dine-in'} · Pay</Button>
          </div>
        </div>
      )}

      <PaymentSheet
        open={payOpen} amountInr={total}
        label={`${r.name} · ${itemCount} item${itemCount > 1 ? 's' : ''} · ${mode === 'delivery' ? 'delivery' : 'dine-in'}`}
        pending={place.isPending} error={place.isError ? payError(place.error) : null}
        onCancel={() => setPayOpen(false)}
        onPay={(method: PayMethod) => place.mutate(
          { id: r.id, mode, items: lines.map((l) => ({ dishId: l.d.id, qty: l.qty })), method },
          { onSuccess: () => { setPayOpen(false); setCart({}); } },
        )}
      />
    </div>
  );
}

const inp = { padding: '9px 11px', border: '1.5px solid var(--line)', borderRadius: 10, fontSize: 14, fontFamily: 'inherit', background: 'var(--card)' } as const;
