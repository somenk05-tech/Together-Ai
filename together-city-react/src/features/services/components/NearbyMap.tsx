import { useState } from 'react';
import { Card } from '@/components/ui';
import { humanDistance, serviceHref, type ServiceCard } from '../api';
import { Link } from 'react-router-dom';

/**
 * WHERE THEY ARE, WITHOUT A MAP PROVIDER.
 *
 * Google or Mapbox is a key, a bill and a decision the owner has not taken, and
 * it has been logged as open since August. What does not need that decision is
 * the thing a citizen actually reads off a map here: who is close, who is
 * clustered, and how far the search reaches. That is coordinates and arithmetic,
 * both of which this hub already has.
 *
 * SO THIS DRAWS THE POSITIONS AND NOT THE STREETS, and says so. Every pin sits
 * at its real bearing and its real distance from the centre; the rings are the
 * real search radius. What is missing is the roads underneath, and a caption
 * saying "the street map arrives with a provider" is a better answer than a
 * screenshot of a map that is not live, or a grey box that explains nothing.
 *
 * A listing that never said where it is has nothing to draw and is listed
 * beneath rather than dropped — invisible on a map is not the same as absent
 * from the city.
 */
export function NearbyMap({
  items, centre, withinKm,
}: {
  items: ServiceCard[];
  centre: { lat: number; lng: number } | null;
  withinKm: number;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  const placed = items.filter((s) => s.lat != null && s.lng != null);
  const unplaced = items.filter((s) => s.lat == null || s.lng == null);

  // The centre is the citizen when they asked to be, and the middle of what
  // came back when they did not.
  const mid = centre ?? (placed.length
    ? {
        lat: placed.reduce((n, s) => n + (s.lat as number), 0) / placed.length,
        lng: placed.reduce((n, s) => n + (s.lng as number), 0) / placed.length,
      }
    : null);

  // How far out the plane reaches: the search radius when there is one,
  // otherwise far enough to hold the furthest pin with room around it.
  const spreadDeg = mid
    ? Math.max(
        0.004,
        ...placed.map((s) => Math.max(
          Math.abs((s.lat as number) - mid.lat),
          Math.abs((s.lng as number) - mid.lng) * Math.cos((mid.lat * Math.PI) / 180),
        )),
      ) * 1.25
    : 0.01;

  const pos = (s: ServiceCard) => {
    if (!mid) return { left: '50%', top: '50%' };
    const dx = ((s.lng as number) - mid.lng) * Math.cos((mid.lat * Math.PI) / 180);
    const dy = (s.lat as number) - mid.lat;
    return {
      left: `${50 + (dx / spreadDeg) * 46}%`,
      top: `${50 - (dy / spreadDeg) * 46}%`,
    };
  };

  const open = placed.find((s) => s.id === openId) ?? null;

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <Card style={{ position: 'relative', padding: 0, overflow: 'hidden', aspectRatio: '16 / 9', background: 'var(--accent-soft)' }}>
        {/* The rings are the search radius, drawn from the centre. Two of them
            so distance reads as a scale rather than as one arbitrary edge. */}
        {centre && [1, 0.5].map((f) => (
          <div key={f} aria-hidden style={{
            position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
            width: `${92 * f}%`, aspectRatio: '1', borderRadius: '50%',
            border: '1px dashed var(--accent-line)',
          }} />
        ))}
        {centre && (
          <div aria-hidden style={{
            position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
            width: 12, height: 12, borderRadius: 999, background: 'var(--accent)',
            border: '2px solid var(--card)',
          }} />
        )}

        {placed.map((s) => {
          const p = pos(s);
          const isOpen = openId === s.id;
          return (
            <button key={s.id} type="button" onClick={() => setOpenId(isOpen ? null : s.id)}
              aria-label={`${s.businessName}${s.distanceKm != null ? `, ${humanDistance(s.distanceKm)} away` : ''}`}
              aria-pressed={isOpen}
              style={{
                position: 'absolute', left: p.left, top: p.top, transform: 'translate(-50%,-100%)',
                padding: '4px 9px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit',
                fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap', maxWidth: 150,
                overflow: 'hidden', textOverflow: 'ellipsis',
                background: isOpen ? 'var(--accent)' : 'var(--card)',
                color: isOpen ? 'var(--on-accent)' : 'var(--ink)',
                border: `1px solid ${isOpen ? 'var(--accent)' : 'var(--line)'}`,
              }}>
              {s.businessName}
            </button>
          );
        })}

        <div style={{
          position: 'absolute', left: 12, bottom: 12, fontSize: 11.5,
          background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 999, padding: '4px 10px',
        }}>
          <strong>{placed.length}</strong> {placed.length === 1 ? 'business' : 'businesses'}
          {centre && <span className="muted"> · within {withinKm < 1 ? `${withinKm * 1000} m` : `${withinKm} km`}</span>}
        </div>
      </Card>

      {open && (
        <Card style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 12 }}>
          {open.photos.length > 0 && (
            <img src={open.photos[0].url} alt="" loading="lazy"
              style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 10, flex: '0 0 auto' }} />
          )}
          <div style={{ minWidth: 0, flex: 1 }}>
            <strong style={{ fontSize: 14.5, display: 'block' }}>{open.businessName}</strong>
            <span className="muted" style={{ fontSize: 12.5 }}>
              {open.categoryLabel}
              {open.distanceKm != null && <> · {humanDistance(open.distanceKm)} away</>}
            </span>
          </div>
          <Link to={serviceHref(open)} style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent-ink)' }}>
            View business
          </Link>
        </Card>
      )}

      <p className="muted" style={{ fontSize: 11.5, margin: 0 }}>
        Positions and distances are real. The street map underneath arrives when Together City picks a map provider.
        {unplaced.length > 0 && <> {unplaced.length} {unplaced.length === 1 ? 'business has' : 'businesses have'} not
          pinned a location and {unplaced.length === 1 ? 'is' : 'are'} in the list only.</>}
      </p>
    </div>
  );
}
