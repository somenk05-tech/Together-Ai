import { Link } from 'react-router-dom';
import { priceLabel, bhkLabel, type PropertyCard } from '../api';

/** A property card for the browse / my-listings grids. */
export function PropertyCardView({ p }: { p: PropertyCard }) {
  return (
    <Link to={`/realestate/property/${p.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
      <article className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ position: 'relative', aspectRatio: '4 / 3', background: 'var(--line)' }}>
          {p.coverPhoto ? <img src={p.coverPhoto} alt={p.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--muted)' }}>No photo</div>}
          <span style={{ position: 'absolute', top: 10, left: 10, fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: '#fff', background: p.listingType === 'rent' ? '#1565c0' : '#2e7d32', borderRadius: 999, padding: '3px 10px' }}>
            {p.listingType === 'rent' ? 'For rent' : 'For sale'}
          </span>
          {p.status === 'under_construction' && (
            <span style={{ position: 'absolute', top: 10, right: 10, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#fff', background: '#e65100', borderRadius: 999, padding: '3px 9px' }}>Under construction</span>
          )}
          <span style={{ position: 'absolute', bottom: 10, right: 10, fontSize: 11, fontWeight: 600, color: '#fff', background: 'rgba(0,0,0,.55)', borderRadius: 6, padding: '2px 8px' }}>📷 {p.photoCount}</span>
        </div>
        <div style={{ padding: '12px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <strong style={{ fontSize: 16 }}>{priceLabel(p.priceInr, p.listingType)}</strong>
            {p.postedByYou && <span style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', color: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: 999, padding: '1px 6px' }}>Yours</span>}
          </div>
          <div style={{ fontWeight: 600, fontSize: 14, marginTop: 2 }}>{p.title}</div>
          <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>{bhkLabel(p)} · {p.areaSqft.toLocaleString('en-IN')} sqft · ₹{p.pricePerSqft.toLocaleString('en-IN')}/sqft</div>
          <div className="muted" style={{ fontSize: 12, marginTop: 1 }}>{p.locality}, {p.city}</div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 6 }}>
            {p.verified.photo && <span style={{ fontSize: 9.5, fontWeight: 700, color: '#2e7d32', background: '#e8f5e9', borderRadius: 999, padding: '1px 7px' }}>✓ Photo-verified</span>}
            {p.verified.rera && <span style={{ fontSize: 9.5, fontWeight: 700, color: '#1565c0', background: '#e3f2fd', borderRadius: 999, padding: '1px 7px' }}>✓ RERA</span>}
          </div>
          {p.status === 'under_construction' && p.progressPct != null && (
            <div style={{ marginTop: 8 }}>
              <div style={{ height: 6, borderRadius: 999, background: 'var(--line)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${p.progressPct}%`, background: '#e65100' }} />
              </div>
              <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>{p.progressPct}% built · possession {p.possessionDate}</div>
            </div>
          )}
        </div>
      </article>
    </Link>
  );
}
