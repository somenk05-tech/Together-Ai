import { Link } from 'react-router-dom';

const split = { display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr)', gap: 28, marginTop: 24 } as const;

/** Explore Restaurants — curated nearby places, verified for quality & hygiene. */
export function Explore() {
  return (
    <div style={{ maxWidth: 1120, margin: '0 auto', padding: '24px 16px 60px' }}>
      <div className="hero rise" style={{ minHeight: 260 }}>
        <img className="bg" src="/assets/img/resturant--images--explore.webp" alt="Elegant restaurant dining room, moody lighting" />
        <div className="inner">
          <div className="eyebrow">Restaurants Hub · 02</div>
          <h1 style={{ fontSize: 'clamp(28px,3vw,44px)' }}>Explore Restaurants</h1>
          <p className="sub">15 Restaurants Nearby — based on your location.</p>
          <div className="pill-row" style={{ marginTop: 14 }}><span className="tag dark">Quality Assured</span><span className="tag dark">Hygiene Verified</span><span className="tag dark">Together City Rated</span></div>
        </div>
      </div>

      <div className="card rise" style={{ marginBottom: 28, marginTop: 24, display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="pill-row"><span className="pill on">All</span><span className="pill">Gourmet</span><span className="pill">Mid Range</span><span className="pill">Budget Friendly</span><span className="pill">Cuisines ▾</span><span className="pill">More Filters</span></div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 12, color: 'var(--muted)' }}>
          Sort: <b style={{ color: 'var(--ink)' }}>Top Rated</b>
          <Link className="btn btn-line btn-sm" to="/restaurants/discover">Browse all</Link>
        </div>
      </div>

      <div className="note rise" style={{ margin: '0 0 16px', fontSize: 12.5 }}>
        🌿 Showing all restaurants for your <b>Everything</b> profile. <Link to="/nutrition/preferences" style={{ color: 'var(--gold-bright)', fontWeight: 600 }}>Change dietary preference →</Link>
      </div>

      <div style={split}>
        <div>
          <div className="empty" style={{ textAlign: 'center', padding: '46px 24px', border: '1px dashed var(--line)', borderRadius: 'var(--radius-lg)' }}>
            <div style={{ fontSize: 34, marginBottom: 8 }}>📍</div>
            <h3 style={{ marginBottom: 6 }}>Find restaurants near you</h3>
            <p className="muted" style={{ fontSize: 13, maxWidth: '46ch', margin: '0 auto 16px' }}>Browse the full curated list, verified by Together City for quality and hygiene, or jump straight into cuisine-based discovery.</p>
            <Link className="btn btn-gold btn-sm" to="/restaurants/discover">Browse curated restaurants →</Link>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
            <h4>Why Choose Restaurants by Together City?</h4>
            <p className="meta" style={{ display: 'block', marginTop: 10 }}>Every listing passes a hygiene audit, a quality check and real customer verification before it earns the badge you see here.</p>
          </div>
          <div className="card">
            <h4>Dining Preferences</h4>
            <div className="pill-row" style={{ margin: '12px 0' }}><span className="pill on">Vegetarian ✓</span><span className="pill">Low Carb</span><span className="pill">High Protein</span><span className="pill">No Onion</span><span className="pill">No Garlic</span></div>
            <Link className="btn btn-line btn-sm" to="/nutrition/preferences">Edit preferences →</Link>
          </div>
          <div className="card"><h4>Saved a place already?</h4><p className="meta" style={{ display: 'block', margin: '8px 0 14px' }}>Keep track of everywhere you love.</p><Link className="btn btn-line btn-sm" to="/restaurants/favourites" style={{ width: '100%', justifyContent: 'center' }}>View Favourites →</Link></div>
          <div className="card"><h4>Feeling social tonight?</h4><p className="meta" style={{ display: 'block', margin: '8px 0 14px' }}>Reserve a table in under a minute.</p><Link className="btn btn-gold btn-sm" to="/restaurants/book" style={{ width: '100%', justifyContent: 'center' }}>Book a Table →</Link></div>
        </div>
      </div>
    </div>
  );
}
