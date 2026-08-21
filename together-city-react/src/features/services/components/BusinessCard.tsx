import { Link, useNavigate } from 'react-router-dom';
import { Card, Button } from '@/components/ui';
import {
  serviceHref, humanDistance, rupees, useEnquire, useToggleRegular, type ServiceCard,
} from '../api';
import { TrustBadge } from '../Verification';

/**
 * A BUSINESS, AS A CARD.
 *
 * The old tile was a photograph, a name and a trade — an answer to "who is
 * there" and to nothing else. What a citizen scanning a directory is actually
 * deciding is which of these strangers to let into their house, and that
 * decision needs five things the tile did not carry: what was checked about
 * them, what other people said, how far away they are, what they start at, and
 * a way to write to them without leaving the page.
 *
 * WHAT IT WILL NOT DO IS INVENT ANY OF THAT. Every line below is absent when
 * the fact behind it is absent — no placeholder stars, no "₹₹" band derived
 * from nothing, no distance on a search that had no centre to measure from.
 * A directory that fills its gaps with plausible-looking furniture is a
 * directory whose true rows cannot be told from its decorated ones.
 */

/** ★ 4.8 · 12 reviews — or the honest smaller sentence underneath it.
 *  The average is withheld below three reviews by the server; one five-star
 *  review is one happy customer, and printing 5.0 off it is a number the
 *  business will be judged by. */
function Rating({ rating, count }: { rating?: number | null; count?: number }) {
  const n = count ?? 0;
  if (rating != null) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 5, fontSize: 12.5 }}>
        <span aria-hidden style={{ color: 'var(--warn-ink)' }}>★</span>
        <strong>{rating}</strong>
        <span className="muted">· {n} {n === 1 ? 'review' : 'reviews'}</span>
      </span>
    );
  }
  if (n > 0) {
    return (
      <span className="muted" style={{ fontSize: 12.5 }}>
        {n} {n === 1 ? 'review' : 'reviews'} — too few for a rating
      </span>
    );
  }
  return <span className="muted" style={{ fontSize: 12.5 }}>No reviews yet</span>;
}

/** The checks that actually passed, at most two, and a count for the rest.
 *  Nothing is shown for a listing where none have — an absence of a claim,
 *  never a claim of absence. */
function Checks({ trust }: { trust: ServiceCard['trust'] }) {
  const checks = trust?.checks ?? [];
  const passed = checks.filter((c) => c.done);
  if (passed.length === 0) return null;
  const shown = passed.slice(0, 2);
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
      {shown.map((c) => (
        <span key={c.key} style={{ fontSize: 11.5, color: 'var(--ok-ink)', fontWeight: 600 }}>
          <span aria-hidden>✓ </span>{c.label}
        </span>
      ))}
      {trust?.done != null && trust.total != null && (
        <span className="muted" style={{ fontSize: 11.5 }}>
          {trust.done} of {trust.total} checks
        </span>
      )}
    </div>
  );
}

export function BusinessCard({ s, saved }: { s: ServiceCard; saved: boolean }) {
  const nav = useNavigate();
  const keep = useToggleRegular();
  const enquire = useEnquire();

  const message = () =>
    enquire.mutate({ id: s.id }, {
      onSuccess: (t) => nav(`/services/messages/${t.id}`),
    });

  return (
    /* `lift` is the city's own hover, in CSS, at the ceiling's duration. A
       hand-written transform here would be a second answer to a question relief
       has already answered, and invisible to the motion audit. */
    <Card lift style={{ display: 'flex', flexDirection: 'column', gap: 0, padding: 0, overflow: 'hidden', height: '100%' }}>
      <div style={{ position: 'relative' }}>
        <Link to={serviceHref(s)} style={{ display: 'block' }} aria-label={`${s.businessName}, ${s.categoryLabel}`}>
          {s.photos.length > 0 ? (
            <img src={s.photos[0].url} alt="" loading="lazy"
              style={{ display: 'block', width: '100%', aspectRatio: '4 / 3', objectFit: 'cover' }} />
          ) : (
            /* A shop with no photograph still needs a shape, or the grid falls
               into steps. The hub's own wash, not a grey apology. */
            <div aria-hidden style={{ width: '100%', aspectRatio: '4 / 3', background: 'var(--accent-soft)' }} />
          )}
        </Link>
        <button type="button"
          onClick={() => keep.mutate({ id: s.id, saved })}
          disabled={keep.isPending}
          aria-pressed={saved}
          aria-label={saved ? `Stop keeping ${s.businessName}` : `Keep ${s.businessName}`}
          style={{
            /* 44 because a thumb is 44. It is the largest control on the card
               and it sits over a photograph, so the fill is the card's own
               surface rather than a scrim invented for it. */
            position: 'absolute', top: 8, right: 8, width: 44, height: 44, borderRadius: 'var(--r-full)',
            display: 'grid', placeItems: 'center', cursor: 'pointer', fontSize: 17, lineHeight: 1,
            border: '1px solid var(--line)', background: 'var(--card)', fontFamily: 'inherit',
            color: saved ? 'var(--danger-ink)' : 'var(--muted)',
          }}>
          {saved ? '♥' : '♡'}
        </button>
      </div>

      <div style={{ padding: '13px 15px 15px', display: 'grid', gap: 7 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <Link to={serviceHref(s)} style={{ textDecoration: 'none', color: 'inherit' }}>
            <strong style={{ fontSize: 15 }}>{s.businessName}</strong>
          </Link>
          <TrustBadge trust={s.trust} />
        </div>

        <Rating rating={s.rating} count={s.count} />

        <div className="muted" style={{ fontSize: 12.5 }}>
          {s.categoryLabel}
          {s.priceFrom != null && <> · from {rupees(s.priceFrom)}</>}
        </div>

        <div className="muted" style={{ fontSize: 12.5 }}>
          {s.distanceKm != null ? (
            <span style={{ color: 'var(--accent-ink)', fontWeight: 600 }}>
              <span aria-hidden>📍 </span>{humanDistance(s.distanceKm)} away
            </span>
          ) : (
            <>{s.areas.length ? s.areas.join(' · ') : s.city}</>
          )}
        </div>

        <Checks trust={s.trust} />

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 2 }}>
          <Button variant="accent" size="sm" disabled={enquire.isPending} onClick={message}>
            {enquire.isPending ? 'Opening…' : 'Message'}
          </Button>
          <Link to={serviceHref(s)}><Button variant="line" size="sm">View business</Button></Link>
        </div>
      </div>
    </Card>
  );
}
