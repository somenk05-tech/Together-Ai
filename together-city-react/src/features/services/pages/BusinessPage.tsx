import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button, Card, Spinner, EmptyState } from '@/components/ui';
import { MenuView } from '../MenuView';
import { Gallery, Reviews } from '../ListingPanel';
import {
  useService, useEnquire, useToggleRegular, useRegulars, useOffersToday, useReviews,
  rupees, humanDistance, stars,
} from '../api';

/**
 * ONE BUSINESS, ITS OWN PAGE.
 *
 * A directory card is a summary. This is the thing it summarises — the page a
 * shopkeeper would send somebody who asked "where can I see what you do?", and
 * it has to survive being that: a picture at the top, what they do, what it
 * costs, what is on today, what people said, and one obvious way to talk to
 * them.
 *
 * It is a real route, so it can be linked, bookmarked, sent to a friend and
 * reopened tomorrow. That is most of what "a page of their own" means and none
 * of it works from a panel that only exists while a list is scrolled to the
 * right place.
 *
 * The one thing this page does NOT become is a shopfront that takes money.
 * Picking items writes a message; there is no basket, no payment and no
 * confirmed time anywhere on it, and every button that could be mistaken for
 * one says what it actually does.
 */
const section: React.CSSProperties = { marginTop: 22 };
const h2: React.CSSProperties = { fontSize: 17, margin: '0 0 8px' };

export function BusinessPage() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const q = useService(id);
  const enquire = useEnquire();
  const keep = useToggleRegular();
  const regulars = useRegulars();
  const offers = useOffersToday();
  const reviews = useReviews(id);
  const [err, setErr] = useState<string | null>(null);

  if (q.isLoading) return <Spinner label="Opening the page…" />;
  // A page that cannot be loaded says so. Rendering an empty shell would tell
  // the citizen this business has nothing on it, which is a claim about
  // somebody else's shop that was never checked.
  if (q.isError || !q.data) {
    return (
      <EmptyState title="That business page could not be opened"
        hint="It may have closed, or the link may be old. The directory is still there."
        action={<Button variant="line" onClick={() => nav('/services/browse')}>Back to Find a service</Button>} />
    );
  }

  const s = q.data;
  const saved = (regulars.data?.items ?? []).some((r) => r.id === s.id);
  const mine = (offers.data?.items ?? []).filter((o) => o.listingId === s.id);
  const cover = s.photos[0]?.url;

  const chat = () => {
    setErr(null);
    enquire.mutate({ id: s.id }, {
      onSuccess: () => nav('/services/messages'),
      onError: () => setErr('That conversation could not be opened just now. Try again in a moment.'),
    });
  };

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', width: '100%' }}>
      <div style={{ marginBottom: 12 }}>
        <Link to="/services/browse" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--accent-ink)' }}>
          ← All local services
        </Link>
      </div>

      {/* The shopfront. A business with no picture gets a band in the hub's own
          colour rather than a grey box apologising for the absence. */}
      <div style={{
        position: 'relative', borderRadius: 16, overflow: 'hidden',
        background: 'var(--accent-soft)', minHeight: cover ? 0 : 128,
      }}>
        {cover && (
          <img src={cover} alt="" style={{ display: 'block', width: '100%', aspectRatio: '21 / 9', objectFit: 'cover' }} />
        )}
      </div>

      <div style={{ marginTop: 14 }}>
        <div className="eyebrow">{s.categoryLabel}</div>
        <h1 style={{ fontSize: 30, margin: '4px 0 0' }}>{s.businessName}</h1>
        <div className="muted" style={{ fontSize: 13.5, marginTop: 6 }}>
          {s.distanceKm != null && <strong style={{ color: 'var(--accent-ink)' }}>{humanDistance(s.distanceKm)} away · </strong>}
          {s.areas.length ? s.areas.join(' · ') : s.city}
          {s.priceFrom != null && <> · from {rupees(s.priceFrom)}</>}
        </div>
        {(reviews.data?.count ?? 0) > 0 && (
          <div style={{ fontSize: 13, marginTop: 6 }}>
            {reviews.data?.rating != null ? (
              <>
                <span style={{ color: 'var(--warn-ink)', letterSpacing: 1 }}>{stars(Math.round(reviews.data.rating))}</span>
                <span style={{ fontWeight: 700, marginLeft: 6 }}>{reviews.data.rating}</span>
                <span className="muted"> · {reviews.data.count} reviews</span>
              </>
            ) : (
              <span className="muted">
                {reviews.data?.count} {reviews.data?.count === 1 ? 'review' : 'reviews'} — too few for an average
              </span>
            )}
          </div>
        )}
      </div>

      {/* The one obvious thing to do, kept above everything a citizen has to
          scroll for. */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
        <Button variant="accent" disabled={enquire.isPending} onClick={chat}>
          {enquire.isPending ? 'Opening…' : 'Chat with this business'}
        </Button>
        <Button variant="line" disabled={keep.isPending}
          onClick={() => keep.mutate({ id: s.id, saved })}>
          {saved ? '✓ Kept' : 'Keep'}
        </Button>
      </div>
      {err && <p style={{ color: 'var(--danger-ink)', fontSize: 13, marginTop: 8 }} role="alert">{err}</p>}
      <p className="muted" style={{ fontSize: 12, margin: '8px 0 0' }}>
        They will see you as a neighbour, not by name. The conversation stays in this hub and
        never reaches your Chats.
      </p>

      {s.about && (
        <div style={section}>
          <h2 style={h2}>About</h2>
          <p style={{ fontSize: 14, margin: 0, whiteSpace: 'pre-wrap' }}>{s.about}</p>
        </div>
      )}

      {mine.length > 0 && (
        <div style={section}>
          <h2 style={h2}>On today</h2>
          <div style={{ display: 'grid', gap: 8 }}>
            {mine.map((o) => (
              <Card key={o.id} style={{ padding: '12px 16px' }}>
                <strong style={{ fontSize: 14 }}>{o.title}</strong>
                {o.detail && <p className="muted" style={{ fontSize: 13, margin: '3px 0 0' }}>{o.detail}</p>}
              </Card>
            ))}
          </div>
          <p className="muted" style={{ fontSize: 11.5, margin: '8px 0 0' }}>
            Offers are what the business says they are running. Ask them before you set out.
          </p>
        </div>
      )}

      {/* Menu for a restaurant, price list for everyone else — MenuView takes
          its words from the category group. Renders nothing at all when the
          business has not published one. */}
      <MenuView listingId={s.id} group={s.categoryGroup} onSent={() => nav('/services/messages')} />

      {s.photos.length > 1 && (
        <div style={section}>
          <h2 style={h2}>Photos</h2>
          <Gallery photos={s.photos} name={s.businessName} />
        </div>
      )}

      <Reviews listingId={s.id} />
      {reviews.data?.canReview && (
        <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>
          You have spoken to this business, so you can review them —{' '}
          <Link to="/services/messages" style={{ fontWeight: 600, color: 'var(--accent-ink)' }}>
            from your conversation
          </Link>, where it is signed with the name they already know you by.
        </p>
      )}

      {(s.lat != null && s.lng != null) && (
        <div style={section}>
          <h2 style={h2}>Where they are</h2>
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            Pinned at {s.lat.toFixed(5)}, {s.lng.toFixed(5)}
            {s.radiusKm != null && ` · travels about ${s.radiusKm} km`}
          </p>
        </div>
      )}
    </div>
  );
}
