import { Link } from 'react-router-dom';
import { Card, Button, Spinner, EmptyState } from '@/components/ui';
import { useCloseService, useMyServices, useServiceInbox, rupees } from '../api';

/**
 * MY BUSINESS.
 *
 * Closing is not deleting: the listing leaves the directory and every
 * conversation already inside it stays readable. Somebody who was mid-
 * conversation about a job on Tuesday should not find the room gone on
 * Wednesday because the business took a week off.
 */
export function MyBusiness() {
  const mine = useMyServices();
  const inbox = useServiceInbox();
  const close = useCloseService();

  const asked = new Map<string, number>();
  for (const t of inbox.data?.receiving ?? []) {
    asked.set(t.listingId, (asked.get(t.listingId) ?? 0) + 1);
  }

  if (mine.isLoading) return <Spinner label="Loading your listings…" />;
  if (mine.isError) return <EmptyState title="Couldn't load your listings" hint="Nothing has been removed — try again in a moment." />;

  const rows = mine.data ?? [];
  if (rows.length === 0) {
    return (
      <div style={{ maxWidth: 720, margin: '0 auto', width: '100%' }}>
        <div className="eyebrow">Local Services</div>
        <h1 style={{ fontSize: 26 }}>My business</h1>
        <EmptyState
          title="You haven't listed anything yet"
          hint="Pick a category, say where you work, and people nearby can find you."
        />
        <Link to="/services/list"><Button variant="accent">List your business</Button></Link>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', width: '100%' }}>
      <div className="eyebrow">Local Services</div>
      <h1 style={{ fontSize: 26 }}>My business</h1>
      <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
        {rows.map((l) => {
          const removed = l.moderation === 'removed';
          const n = asked.get(l.id) ?? 0;
          return (
            <Card key={l.id} style={{ display: 'grid', gap: 8, opacity: removed ? .6 : 1 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                <strong style={{ fontSize: 17 }}>{l.businessName}</strong>
                <span className="muted" style={{ fontSize: 12.5 }}>{l.categoryLabel}</span>
                {removed && (
                  <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--muted)', border: '1px solid var(--line)', borderRadius: 999, padding: '2px 8px' }}>Closed</span>
                )}
              </div>
              <div className="muted" style={{ fontSize: 12.5 }}>
                {l.areas.length ? l.areas.join(' · ') : l.city}
                {l.priceFrom != null && <> · from {rupees(l.priceFrom)}</>}
              </div>
              {l.about && <p style={{ fontSize: 13.5, margin: 0 }}>{l.about}</p>}
              <div className="muted" style={{ fontSize: 12.5 }}>
                {n === 0 ? 'Nobody has messaged this listing yet.' : `${n} ${n === 1 ? 'neighbour has' : 'neighbours have'} messaged you.`}
                {l.phone && <> · Your number on file: {l.phone} (never shown)</>}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                <Link to="/services/messages"><Button variant="line" size="sm">Messages</Button></Link>
                {!removed && (
                  <Button variant="line" size="sm" disabled={close.isPending}
                    onClick={() => close.mutate(l.id)}>
                    {close.isPending ? 'Closing…' : 'Close listing'}
                  </Button>
                )}
              </div>
              {!removed && (
                <p className="muted" style={{ fontSize: 11.5, margin: 0 }}>
                  Closing takes it out of the directory. Conversations already open stay open.
                </p>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
