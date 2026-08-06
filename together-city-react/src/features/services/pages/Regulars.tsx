import { Link } from 'react-router-dom';
import { Card, Button, Spinner, EmptyState } from '@/components/ui';
import { useRegulars, useToggleRegular, useEnquire, rupees, offerWhen } from '../api';

/**
 * REGULARS — a personal marketplace built out of the public directory.
 *
 * A citizen who has found their plumber does not want to find them again. This
 * is the short list of people they keep going back to, and it is the difference
 * between a directory and something you use twice.
 *
 * THE BUSINESS IS NEVER TOLD. Being saved is a bookmark, not a relationship —
 * a shopkeeper who could see who had saved them would have a list of warm
 * leads, and the citizen who saved them would have made a disclosure they never
 * intended. There is no notification here and no count on the owner's card,
 * deliberately.
 *
 * A closed business stays on the list and says it is closed, rather than
 * quietly disappearing. Somebody who saved a shop that has since shut should
 * see that the shop shut, not wonder whether the app lost their bookmark.
 */
export function Regulars() {
  const q = useRegulars();
  const toggle = useToggleRegular();
  const enquire = useEnquire();

  if (q.isLoading) return <Spinner label="Loading your regulars…" />;
  if (q.isError) return <EmptyState title="Couldn't load your regulars" hint="Nothing has been lost — try again in a moment." />;

  const rows = q.data?.items ?? [];

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', width: '100%' }}>
      <div className="eyebrow">Local Services</div>
      <h1 style={{ fontSize: 26 }}>Regulars</h1>
      <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 18px', maxWidth: '62ch' }}>
        The businesses you keep. Nobody is told they have been saved — this list is yours
        and only yours.
      </p>

      {rows.length === 0 ? (
        <>
          <EmptyState
            title="Nothing saved yet"
            hint="When you find someone worth keeping — the electrician who turns up, the tiffin you actually like — press Keep on their card and they land here."
          />
          <Link to="/services/browse"><Button variant="accent">Find a service</Button></Link>
        </>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 14 }}>
          {rows.map((r) => (
            <Card key={r.id} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '16px 18px', opacity: r.closed ? 0.7 : 1 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <strong style={{ fontSize: 16 }}>{r.businessName}</strong>
                <span className="muted" style={{ fontSize: 12.5 }}>{r.categoryLabel}</span>
                {r.closed && (
                  <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--muted)', border: '1px solid var(--line)', borderRadius: 999, padding: '2px 8px' }}>Closed</span>
                )}
              </div>
              <div className="muted" style={{ fontSize: 12.5 }}>
                {r.areas.length ? r.areas.join(' · ') : r.city}
                {r.priceFrom != null && <> · from {rupees(r.priceFrom)}</>}
              </div>

              {/* What is on today, from somebody you already trust — the reason
                  a personal list beats a directory. */}
              {r.offersToday.length > 0 && (
                <div style={{ borderLeft: '2px solid var(--accent)', paddingLeft: 10 }}>
                  {r.offersToday.map((o) => (
                    <div key={o.id} style={{ fontSize: 13 }}>
                      <strong>{o.title}</strong>
                      <span className="muted" style={{ marginLeft: 6, fontSize: 11.5 }}>{offerWhen(o)}</span>
                    </div>
                  ))}
                </div>
              )}

              {r.note && <p className="muted" style={{ fontSize: 12.5, margin: 0, fontStyle: 'italic' }}>“{r.note}”</p>}

              <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                {!r.closed && (
                  <Button variant="accent" size="sm" disabled={enquire.isPending}
                    onClick={() => enquire.mutate({ id: r.id })}>Chat</Button>
                )}
                <Button variant="line" size="sm" disabled={toggle.isPending}
                  onClick={() => toggle.mutate({ id: r.id, saved: true })}>Forget</Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
