import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { usePackage, useBookPackage, inr, type Tier } from '../api';
import { ShareToChat } from '@/features/chat/share';
import { PaymentSheet } from '@/features/financial/PaymentSheet';
import { payError, type PayMethod } from '@/features/financial/api';

export function PackageDetail() {
  const { id = '' } = useParams();
  const q = usePackage(id);
  const book = useBookPackage();
  const [tier, setTier] = useState<Tier | null>(null);
  const [pax, setPax] = useState(2);
  const [payOpen, setPayOpen] = useState(false);
  const [booked, setBooked] = useState(false);

  if (q.isLoading) return <Spinner label="Loading trip…" />;
  if (q.isError || !q.data) return <EmptyState title="Couldn't load this trip" hint="It may have been removed." />;
  const p = q.data;
  const chosen = tier ?? p.tiers[0];
  const total = (chosen?.priceInr ?? 0) * pax;

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '20px 16px' }}>
      <Link to="/travel/explore" style={{ fontSize: 12.5, color: 'var(--accent-ink)', fontWeight: 600 }}>← Explore</Link>

      <div style={{ marginTop: 12, borderRadius: 16, overflow: 'hidden', aspectRatio: '16 / 8', position: 'relative' }}>
        <img src={p.heroUrl} alt={p.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        <div style={{ position: 'absolute', left: 18, bottom: 16, color: 'var(--on-accent)' }}>
          <span style={{ fontSize: 12.5, fontWeight: 700 }}>{p.icon} {p.categoryLabel}</span>
          <h1 style={{ fontSize: 28, margin: '2px 0 0' }}>{p.title}</h1>
          <div style={{ fontSize: 13.5 }}>{p.destination}, {p.country} · {p.nights}N / {p.days}D</div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
        <p style={{ fontSize: 14, lineHeight: 1.55, margin: 0, flex: 1 }}>{p.summary}</p>
        <ShareToChat item={{
          kind: 'trip', hub: 'Travel', title: p.title, subtitle: `${p.destination}, ${p.country} · ${p.nights}N/${p.days}D`,
          image: p.heroUrl, priceInr: p.priceFromInr, deepLink: `/travel/package/${p.id}`, meta: [p.categoryLabel, `${p.days} days`],
        }} />
      </div>

      {p.highlights.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
          {p.highlights.map((h) => <span key={h} style={{ fontSize: 12, border: '1px solid var(--line)', borderRadius: 999, padding: '4px 12px' }}>✦ {h}</span>)}
        </div>
      )}

      <div className="card" style={{ marginTop: 16 }}>
        <div className="eyebrow">Day-by-day itinerary</div>
        {p.itinerary.map((d) => (
          <div key={d.day} style={{ display: 'flex', gap: 12, padding: '10px 0', borderTop: '1px solid var(--line)' }}>
            <div style={{ width: 44, flexShrink: 0 }}><div style={{ width: 34, height: 34, borderRadius: '50%', display: 'grid', placeItems: 'center', background: 'var(--accent-soft)', color: 'var(--accent-ink)', fontWeight: 800, fontSize: 13 }}>D{d.day}</div></div>
            <div><div style={{ fontWeight: 700, fontSize: 14 }}>{d.title}</div><div className="muted" style={{ fontSize: 13 }}>{d.detail}</div></div>
          </div>
        ))}
      </div>

      {p.inclusions.length > 0 && (
        <div className="card" style={{ marginTop: 14 }}>
          <div className="eyebrow">What's included</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
            {p.inclusions.map((i) => <span key={i} style={{ fontSize: 12.5 }}>✓ {i}</span>)}
          </div>
        </div>
      )}

      {booked ? (
        <div className="card" style={{ marginTop: 16, borderLeft: '4px solid var(--accent)' }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--accent-ink)' }}>🎉 Trip booked!</div>
          <p className="muted" style={{ fontSize: 13, margin: '4px 0 10px' }}>Paid from your city wallet — see it in My Trips.</p>
          <Link to="/travel/trips"><Button variant="accent" size="sm">View my trips</Button></Link>
        </div>
      ) : (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="eyebrow">Choose your package</div>
          <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
            {p.tiers.map((t) => {
              const on = chosen?.name === t.name;
              return (
                <button key={t.name} type="button" onClick={() => setTier(t)}
                  style={{ cursor: 'pointer', textAlign: 'left', borderRadius: 12, padding: '12px 14px', fontFamily: 'inherit', border: `1.5px solid ${on ? 'var(--accent)' : 'var(--line)'}`, background: on ? 'var(--accent-soft)' : 'transparent' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 15, height: 15, borderRadius: '50%', border: `2px solid ${on ? 'var(--accent)' : 'var(--line)'}`, background: on ? 'var(--accent)' : 'transparent', flexShrink: 0 }} />
                    <div style={{ flex: 1 }}><div style={{ fontWeight: 700, fontSize: 14 }}>{t.name}</div><div className="muted" style={{ fontSize: 11.5 }}>{t.perks}</div></div>
                    <strong style={{ fontSize: 15 }}>{inr(t.priceInr)}<span className="muted" style={{ fontWeight: 400, fontSize: 11 }}> /pp</span></strong>
                  </div>
                </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 14, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="muted" style={{ fontSize: 13 }}>Travellers</span>
              <Button variant="line" size="sm" onClick={() => setPax((n) => Math.max(1, n - 1))}>–</Button>
              <strong style={{ fontSize: 15, minWidth: 18, textAlign: 'center' }}>{pax}</strong>
              <Button variant="line" size="sm" onClick={() => setPax((n) => Math.min(20, n + 1))}>+</Button>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ fontWeight: 800, fontSize: 18 }}>{inr(total)}</div>
              <Button variant="accent" onClick={() => setPayOpen(true)}>Book trip</Button>
            </div>
          </div>
        </div>
      )}

      <PaymentSheet
        open={payOpen} amountInr={total} label={`${p.title} · ${chosen?.name} · ${pax} traveller${pax > 1 ? 's' : ''}`}
        pending={book.isPending} error={book.isError ? payError(book.error) : null}
        onCancel={() => setPayOpen(false)}
        onPay={(method: PayMethod) => book.mutate({ id: p.id, tier: chosen.name, pax, method }, { onSuccess: () => { setBooked(true); setPayOpen(false); } })}
      />
    </div>
  );
}
