import { Link } from 'react-router-dom';

interface Entry { to: string; icon: string; title: string; blurb: string; accent?: boolean }

const ENTRIES: Entry[] = [
  { to: '/restaurants/explore', icon: '🔍', title: 'Explore Restaurants', blurb: 'The Top 25 food & café destinations near you — curated live from your location by quality, hygiene, value and menus. Not a directory.', accent: true },
  { to: '/restaurants/decide', icon: '🎯', title: 'Decide What to Eat', blurb: "Can't decide? Tell us you're hungry and Together City picks the perfect spot for you — tuned to your food profile.", accent: true },
  { to: '/restaurants/explore', icon: '🍽️', title: 'Book a Table', blurb: 'Find a place you like, then reserve from its page — your booking shows up under Reservations.' },
  { to: '/restaurants/orders', icon: '🛵', title: 'My Orders', blurb: 'Your food orders and city-wallet receipts, all in one place.' },
  { to: '/restaurants/reservations', icon: '📅', title: 'Reservations', blurb: 'Your upcoming table bookings and dining plans.' },
];

/** Restaurants Hub home — the landing page for the curated food-discovery hub. */
export function RestaurantsHome() {
  return (
    <div style={{ maxWidth: 1120, margin: '0 auto', padding: '24px 16px 64px' }}>
      {/* Hero */}
      <div className="hero rise" style={{ position: 'relative', minHeight: 300, borderRadius: 'var(--radius-lg)', overflow: 'hidden', display: 'flex', alignItems: 'flex-end', color: '#fff' }}>
        <img className="bg" src="/assets/img/resturants.webp" alt="Together City restaurants" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(8,9,8,.86), rgba(8,9,8,.15))' }} />
        <div style={{ position: 'relative', zIndex: 2, padding: '0 40px 40px', maxWidth: 760 }}>
          <div className="eyebrow" style={{ color: 'var(--gold-bright)' }}>Restaurants</div>
          <h1 style={{ color: '#fff', fontSize: 'clamp(28px,4vw,48px)', margin: '4px 0 8px', textShadow: '0 2px 24px rgba(0,0,0,.5)' }}>Exceptional dining, curated for you</h1>
          <p style={{ color: 'rgba(255,255,255,.9)', fontSize: 15, maxWidth: '52ch' }}>A Michelin-style food-discovery guide — only the best food, cafés, bakeries and dessert spots in each locality, ranked by quality rather than listed at random.</p>
          <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
            <Link className="btn btn-gold" to="/restaurants/explore">Explore restaurants →</Link>
            <Link className="btn btn-line btn-sm" to="/restaurants/decide" style={{ color: '#fff', borderColor: 'rgba(255,255,255,.5)' }}>Decide what to eat</Link>
          </div>
        </div>
      </div>

      {/* Entry cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16, marginTop: 22 }}>
        {ENTRIES.map((e) => (
          <Link key={e.to} to={e.to} className="card lift" style={{ display: 'block', textDecoration: 'none', color: 'inherit', borderTop: e.accent ? '3px solid var(--gold-bright, #b8860b)' : undefined }}>
            <div style={{ fontSize: 30, marginBottom: 8 }}>{e.icon}</div>
            <h3 style={{ margin: '0 0 4px', fontSize: 18 }}>{e.title}</h3>
            <p className="muted" style={{ fontSize: 13, lineHeight: 1.5, margin: 0 }}>{e.blurb}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
