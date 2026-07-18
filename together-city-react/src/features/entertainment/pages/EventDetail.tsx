import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { useEvent, useBookTicket, inr, eventDate, type Tier } from '../api';
import { PaymentSheet } from '@/features/financial/PaymentSheet';
import { payError, type PayMethod } from '@/features/financial/api';
import { ShareToChat } from '@/features/chat/share';

export function EventDetail() {
  const { id = '' } = useParams();
  const q = useEvent(id);
  const book = useBookTicket();
  const [tier, setTier] = useState<Tier | null>(null);
  const [qty, setQty] = useState(1);
  const [payOpen, setPayOpen] = useState(false);
  const [booked, setBooked] = useState(false);

  if (q.isLoading) return <Spinner label="Loading event…" />;
  if (q.isError || !q.data) return <EmptyState title="Couldn't load this event" hint="It may have been removed." />;
  const e = q.data;
  const chosen = tier ?? e.tiers[0];
  const total = (chosen?.priceInr ?? 0) * qty;

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '20px 16px' }}>
      <Link to="/entertainment/discover" style={{ fontSize: 12.5, color: 'var(--accent)', fontWeight: 600 }}>← Discover</Link>

      <div style={{ display: 'flex', gap: 18, marginTop: 12, flexWrap: 'wrap' }}>
        <img src={e.posterUrl} alt={e.title} style={{ width: 220, borderRadius: 14, aspectRatio: '3/4', objectFit: 'cover' }} />
        <div style={{ flex: 1, minWidth: 260 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>{e.icon} {e.categoryLabel}</span>
          <h1 style={{ fontSize: 26, margin: '4px 0 0' }}>{e.title}</h1>
          <div className="muted" style={{ fontSize: 13.5, marginTop: 4 }}>📅 {eventDate(e.date)} · {e.time}</div>
          <div className="muted" style={{ fontSize: 13.5 }}>📍 {e.venue}, {e.city}</div>
          <p style={{ fontSize: 13.5, lineHeight: 1.55, marginTop: 12 }}>{e.description}</p>
          <div style={{ marginTop: 10 }}>
            <ShareToChat item={{
              kind: 'event', hub: 'Entertainment', title: e.title, subtitle: `${e.venue}, ${e.city}`,
              image: e.posterUrl, priceInr: e.priceFromInr, deepLink: `/entertainment/event/${e.id}`,
              meta: [e.categoryLabel, eventDate(e.date), e.time],
            }} />
          </div>
        </div>
      </div>

      {booked ? (
        <div className="card" style={{ marginTop: 18, borderLeft: '4px solid var(--accent)' }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--accent)' }}>🎉 Booked!</div>
          <p className="muted" style={{ fontSize: 13, margin: '4px 0 10px' }}>Your pass is in My Tickets — paid from your city wallet.</p>
          <Link to="/entertainment/tickets"><Button variant="accent" size="sm">View my tickets</Button></Link>
        </div>
      ) : (
        <div className="card" style={{ marginTop: 18 }}>
          <div className="eyebrow">Choose your tickets</div>
          <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
            {e.tiers.map((t) => {
              const on = chosen?.name === t.name;
              return (
                <button key={t.name} type="button" onClick={() => setTier(t)} disabled={t.available === 0}
                  style={{ cursor: t.available === 0 ? 'not-allowed' : 'pointer', textAlign: 'left', borderRadius: 12, padding: '12px 14px', fontFamily: 'inherit',
                    border: `1.5px solid ${on ? 'var(--accent)' : 'var(--line)'}`, background: on ? 'var(--accent-soft)' : 'transparent', opacity: t.available === 0 ? 0.5 : 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 15, height: 15, borderRadius: '50%', border: `2px solid ${on ? 'var(--accent)' : 'var(--line)'}`, background: on ? 'var(--accent)' : 'transparent', flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{t.name}</div>
                      <div className="muted" style={{ fontSize: 11.5 }}>{t.available === 0 ? 'Sold out' : `${t.available} available`}</div>
                    </div>
                    <strong style={{ fontSize: 15 }}>{inr(t.priceInr)}</strong>
                  </div>
                </button>
              );
            })}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 14, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="muted" style={{ fontSize: 13 }}>Qty</span>
              <Button variant="line" size="sm" onClick={() => setQty((n) => Math.max(1, n - 1))}>–</Button>
              <strong style={{ fontSize: 15, minWidth: 18, textAlign: 'center' }}>{qty}</strong>
              <Button variant="line" size="sm" onClick={() => setQty((n) => Math.min(10, n + 1))}>+</Button>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ fontWeight: 800, fontSize: 18 }}>{inr(total)}</div>
              <Button variant="accent" disabled={!chosen || chosen.available === 0} onClick={() => setPayOpen(true)}>Book now</Button>
            </div>
          </div>
        </div>
      )}

      <PaymentSheet
        open={payOpen}
        amountInr={total}
        label={`${e.title} · ${chosen?.name} ×${qty}`}
        pending={book.isPending}
        error={book.isError ? payError(book.error) : null}
        onCancel={() => setPayOpen(false)}
        onPay={(method: PayMethod) => book.mutate({ eventId: e.id, tier: chosen!.name, qty, method }, { onSuccess: () => { setBooked(true); setPayOpen(false); } })}
      />
    </div>
  );
}
