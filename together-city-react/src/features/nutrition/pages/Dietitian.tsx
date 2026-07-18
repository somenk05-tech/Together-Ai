import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { useBookDietitian, useDietitians } from '../hooks';

/** Expert Care — book a dietitian; booking opens a real chat conversation. */
export function Dietitian() {
  const dietitians = useDietitians();
  const book = useBookDietitian();
  const [bookedId, setBookedId] = useState<string | null>(null);

  if (dietitians.isLoading) return <Spinner label="Finding your experts…" />;
  if (dietitians.isError) return <EmptyState title="Couldn't load experts" hint="Start the backend and reload." />;

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '28px 16px' }}>
      <div className="eyebrow">Nutrition Hub · Expert Care</div>
      <h1 style={{ fontSize: 26 }}>Talk to a dietitian</h1>
      <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 16px' }}>
        Booking connects you instantly — your consultation continues as a private chat,
        where they can see the plan and blood panel you choose to share.
      </p>

      {dietitians.data?.map((d) => (
        <article key={d.id} className="card" style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <div style={{
              width: 52, height: 52, borderRadius: '50%', display: 'grid', placeItems: 'center', flexShrink: 0,
              background: 'var(--accent-soft)', color: 'var(--accent)', fontWeight: 700, fontSize: 17,
            }}>
              {d.name.replace('Dr. ', '').split(' ').map((w) => w[0]).slice(0, 2).join('')}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 15.5 }}>{d.name} <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>★ {d.rating}</span></div>
              <div className="muted" style={{ fontSize: 12.5 }}>{d.specialty}</div>
              <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>{d.languages.join(' · ')}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>₹{d.priceInr}</div>
              <div className="muted" style={{ fontSize: 11 }}>per session</div>
            </div>
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 10, alignItems: 'center' }}>
            {bookedId === d.id ? (
              <>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--accent)' }}>✓ Booked — they've messaged you</span>
                <Link to="/chats"><Button variant="accent" size="sm">Open chat</Button></Link>
              </>
            ) : (
              <Button
                variant="line" size="sm" disabled={book.isPending}
                onClick={() => book.mutate(d.id, { onSuccess: () => setBookedId(d.id) })}
              >
                {book.isPending ? 'Booking…' : 'Book consultation'}
              </Button>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}
