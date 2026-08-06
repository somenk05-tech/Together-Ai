import { useState } from 'react';
import { Spinner } from '@/components/ui';
import { useReviews, stars } from './api';

/**
 * THE BUSINESS, OPENED.
 *
 * A directory card is a promise that there is more behind it. Until now there
 * was not: one photograph, three lines of About and two buttons, with the
 * gallery the owner uploaded and the price list they typed sitting in the
 * database where nobody could reach them. A citizen deciding between two
 * salons needs to see the room and the prices, and a card that hides both
 * makes them leave to go and look somewhere else.
 *
 * It opens IN PLACE rather than on its own page. The filters, the scroll
 * position and the near-me search are the work the citizen just did, and
 * navigating away and back throws all three of them out.
 *
 * Everything inside is loaded only once it is open. Twenty-four cards each
 * fetching a menu and a review list on a directory page nobody has expanded is
 * a hundred requests to render nothing.
 */
export function Gallery({ photos, name }: { photos: Array<{ url: string; caption?: string }>; name: string }) {
  const [big, setBig] = useState(0);
  if (photos.length === 0) return null;
  return (
    <div>
      <img src={photos[big].url} alt={photos[big].caption ?? `${name}, photo ${big + 1}`}
        style={{ display: 'block', width: '100%', aspectRatio: '16 / 10', objectFit: 'cover', borderRadius: 12 }} />
      {photos[big].caption && (
        <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>{photos[big].caption}</p>
      )}
      {photos.length > 1 && (
        <div className="swipe-row" style={{ display: 'flex', gap: 8, marginTop: 8, overflowX: 'auto' }}>
          {photos.map((p, i) => (
            <button key={p.url} type="button" onClick={() => setBig(i)}
              aria-label={`Photo ${i + 1} of ${photos.length}`} aria-current={i === big}
              style={{
                flex: '0 0 auto', width: 74, height: 56, padding: 0, cursor: 'pointer', borderRadius: 9,
                overflow: 'hidden', background: 'none',
                border: i === big ? '2px solid var(--accent)' : '1.5px solid var(--line)',
              }}>
              <img src={p.url} alt="" loading="lazy"
                style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Reviews({ listingId }: { listingId: string }) {
  const q = useReviews(listingId);
  if (q.isLoading) return <Spinner label="Loading reviews…" />;
  // Not silence. An unreachable review list is not the same as a business
  // nobody has reviewed, and rendering nothing would state the second.
  if (q.isError) {
    return (
      <p className="muted" style={{ fontSize: 12.5, marginTop: 14 }} role="alert">
        Reviews could not be loaded just now.
      </p>
    );
  }
  if (!q.data || q.data.items.length === 0) return null;
  return (
    <div style={{ borderTop: '1px solid var(--line)', marginTop: 16, paddingTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 14 }}>What people said</strong>
        {/* Withheld below three, and the count shown instead. */}
        {q.data.rating != null ? (
          <span style={{ fontSize: 12.5 }}>
            <span style={{ color: 'var(--warn-ink)', letterSpacing: 1 }}>{stars(Math.round(q.data.rating))}</span>
            <span style={{ fontWeight: 700, marginLeft: 6 }}>{q.data.rating}</span>
            <span className="muted"> · {q.data.count} reviews</span>
          </span>
        ) : (
          <span className="muted" style={{ fontSize: 12.5 }}>
            {q.data.count} {q.data.count === 1 ? 'review' : 'reviews'} — too few for an average
          </span>
        )}
      </div>
      <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
        {q.data.items.slice(0, 6).map((r) => (
          <div key={r.id}>
            <div style={{ fontSize: 12.5 }}>
              <span style={{ color: 'var(--warn-ink)', letterSpacing: 1 }}>{stars(r.rating)}</span>
              <span className="muted" style={{ marginLeft: 8 }}>{r.alias}</span>
            </div>
            {r.body && <p style={{ fontSize: 13.5, margin: '3px 0 0' }}>{r.body}</p>}
            {r.ownerReply && (
              <p className="muted" style={{ fontSize: 12.5, margin: '4px 0 0', paddingLeft: 12, borderLeft: '2px solid var(--line)' }}>
                <strong>Reply:</strong> {r.ownerReply}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

