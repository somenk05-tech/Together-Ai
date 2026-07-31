import { Link } from 'react-router-dom';

const split = { display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr)', gap: 28, marginTop: 24 } as const;

const AREAS: { name: string; img: string; meta: string }[] = [
  { name: 'Connaught Place', img: 'explore', meta: '27 restaurants · Multi-cuisine, Café, Fine Dine' },
  { name: 'Hauz Khas', img: 'landing', meta: '18 restaurants · Rooftop, Continental, Bar' },
  { name: 'Cyber Hub, Gurgaon', img: 'find-a-meal', meta: '21 restaurants · Global, Nightlife, Grills' },
  { name: 'Bandra West, Mumbai', img: 'favourites', meta: '21 restaurants · Coastal, Café, Fine Dine' },
  { name: 'Koramangala, Bengaluru', img: 'reviews', meta: '19 restaurants · Microbreweries, South Indian' },
  { name: 'View All Areas', img: 'option-card---bowl', meta: '106 restaurants across the city' },
];

const PICKS = [['The Leela Pavilion', '★4.8 · Fine Dine'], ['Yauatcha', '★4.7 · Pan-Asian'], ['Olive Bar & Kitchen', '★4.6 · Mediterranean']] as const;

/** Book a Table — reserve tonight with instant confirmation. */
export function Book() {
  return (
    <div style={{ maxWidth: 1120, margin: '0 auto', padding: '24px 16px 60px' }}>
      <div className="hero rise" style={{ minHeight: 260 }}>
        <img className="bg" src="/assets/img/resturant--images--book-a-table.webp" alt="Beautifully set restaurant table, candlelight" />
        <div className="inner">
          <div className="eyebrow">Restaurants Hub · 03</div>
          <h1 style={{ fontSize: 'clamp(28px,3vw,44px)' }}>Book a Table</h1>
          <p className="sub">Reserve tonight — instant confirmation, no hidden charges.</p>
          <div className="pill-row" style={{ marginTop: 14 }}><span className="tag dark">Instant Confirmation</span><span className="tag dark">No Hidden Charges</span><span className="tag dark">Premium Experience</span></div>
        </div>
      </div>

      <div className="console rise" style={{ marginBottom: 44, marginTop: 24 }}>
        <div className="fields">
          {/* The search box and the sort control were inputs with a hardcoded
              value and no handler — neither filtered anything, and "Popularity"
              was not a sort the app can do. Removed rather than faked; Explore
              has search and filters that work. */}
          <div className="f"><label>Find a table</label><input placeholder="Search by area or restaurant" /></div>
          <div className="go"><Link className="btn btn-gold" to="/restaurants/explore">Search</Link></div>
        </div>
      </div>

      <div style={split}>
        <div>
          <div className="blk-head"><h2>Top Restaurants by Area</h2></div>
          <div className="grid3" style={{ gap: 16 }}>
            {AREAS.map((a) => (
              <Link key={a.name} className="pcard" to="/restaurants/explore">
                <div className="ph"><img loading="lazy" src={`/assets/img/resturant--images--${a.img}.webp`} alt={a.name} /></div>
                <div className="pb"><h4>{a.name}</h4><p className="meta">{a.meta}</p><p className="price" style={{ color: 'var(--gold-bright)', fontSize: 13 }}>View Restaurants →</p></div>
              </Link>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
            <h4>Why Book with Together City</h4>
            <p className="meta" style={{ display: 'block', marginTop: 10 }}>Instant confirmation, verified availability and no surprise service charges — every booking, every time.</p>
          </div>
          <div className="card">
            <h4>Your Upcoming Booking</h4>
            <div className="empty" style={{ padding: '28px 10px', textAlign: 'center' }}>
              <div style={{ fontSize: 28 }}>◈</div>
              <p className="muted" style={{ margin: '8px 0 14px' }}>No upcoming bookings yet.</p>
              <Link className="btn btn-gold btn-sm" to="/restaurants/explore">Explore Restaurants →</Link>
            </div>
          </div>
          <div className="card">
            <h4>Top Picks</h4>
            <div className="rows" style={{ marginTop: 12 }}>
              {PICKS.map(([t, m]) => (
                <div key={t} className="row" style={{ boxShadow: 'none', padding: '10px 12px' }}><div className="grow"><div className="t" style={{ fontSize: 13 }}>{t}</div><div className="m">{m}</div></div><Link className="btn btn-gold btn-sm" to="/restaurants/discover">Book Now</Link></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
