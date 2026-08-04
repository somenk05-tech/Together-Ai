import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { priceLabel, bhkLabel, useEnquire, type PropertyCard } from '../api';

/** A property card for the browse / my-listings grids. */
export function PropertyCardView({ p }: { p: PropertyCard }) {
  const navigate = useNavigate();
  const enquire = useEnquire();
  const [err, setErr] = useState('');
  // Connect lives on the card too (like dating): straight from Explore into a
  // chat with the seller. Hidden on your own listings and platform listings.
  const canConnect = !p.postedByYou && p.verified.listedBy === 'owner';
  const connect = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation(); // the whole card is a Link
    setErr('');
    enquire.mutate({ id: p.id }, {
      onSuccess: (r) => navigate(`/chats?c=${r.conversationId}`),
      onError: (ex) => setErr(
        (ex as { response?: { data?: { message?: string } } })?.response?.data?.message
        ?? 'Couldn’t open the chat — please try again.'),
    });
  };
  return (
    <Link to={`/realestate/property/${p.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
      <article className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ position: 'relative', aspectRatio: '4 / 3', background: 'var(--line)' }}>
          {p.coverPhoto ? <img src={p.coverPhoto} alt={p.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--muted)' }}>No photo</div>}
          <span style={{ position: 'absolute', top: 10, left: 10, fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--on-accent)', background: p.listingType === 'rent' ? 'var(--info-ink)' : 'var(--ok-ink)', borderRadius: 999, padding: '3px 10px' }}>
            {p.listingType === 'rent' ? 'For rent' : 'For sale'}
          </span>
          {p.status === 'under_construction' && (
            <span style={{ position: 'absolute', top: 10, right: 10, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--on-accent)', background: 'var(--warn-ink)', borderRadius: 999, padding: '3px 9px' }}>Under construction</span>
          )}
          <span style={{ position: 'absolute', bottom: 10, right: 10, fontSize: 11, fontWeight: 600, color: 'var(--on-accent)', background: 'rgba(0,0,0,.55)', borderRadius: 6, padding: '2px 8px' }}>📷 {p.photoCount}</span>
        </div>
        <div style={{ padding: '12px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <strong style={{ fontSize: 16 }}>{priceLabel(p.priceInr, p.listingType)}</strong>
            {p.postedByYou && <span style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', color: 'var(--accent-ink)', border: '1px solid var(--accent)', borderRadius: 999, padding: '1px 6px' }}>Yours</span>}
          </div>
          <div style={{ fontWeight: 600, fontSize: 14, marginTop: 2 }}>{p.title}</div>
          <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>{bhkLabel(p)} · {p.areaSqft.toLocaleString('en-IN')} sqft · ₹{p.pricePerSqft.toLocaleString('en-IN')}/sqft</div>
          <div className="muted" style={{ fontSize: 12, marginTop: 1 }}>{p.locality}, {p.city}</div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 6, alignItems: 'center' }}>
            {p.verified.photo && <span style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--ok-ink)', background: 'var(--ok-soft)', borderRadius: 999, padding: '1px 7px' }}>✓ Photo-verified</span>}
            {p.verified.rera && <span style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--info-ink)', background: 'var(--info-soft)', borderRadius: 999, padding: '1px 7px' }}>✓ RERA</span>}
            {canConnect && (
              <button type="button" className="btn btn-accent btn-sm" disabled={enquire.isPending} onClick={connect}
                style={{ marginLeft: 'auto', fontSize: 11.5, padding: '4px 12px' }}>
                {enquire.isPending ? 'Opening…' : '💬 Connect'}
              </button>
            )}
          </div>
          {err && <div style={{ fontSize: 11.5, color: 'var(--danger-ink)', fontWeight: 600, marginTop: 4 }}>{err}</div>}
          {p.status === 'under_construction' && p.progressPct != null && (
            <div style={{ marginTop: 8 }}>
              <div style={{ height: 6, borderRadius: 999, background: 'var(--line)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${p.progressPct}%`, background: 'var(--warn-ink)' }} />
              </div>
              <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>{p.progressPct}% built · possession {p.possessionDate}</div>
            </div>
          )}
        </div>
      </article>
    </Link>
  );
}
