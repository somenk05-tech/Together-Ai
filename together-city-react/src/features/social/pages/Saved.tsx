import { useState } from 'react';
import { Link } from 'react-router-dom';
import { IMG } from '../shared';

interface SavedItem {
  to: string; img: string; alt: string; title: string; meta: string;
}

const ITEMS: SavedItem[] = [
  { to: '/social/feed', img: `${IMG}travel-hub-sub-pages--just-images--packages-image.webp`, alt: 'Saved post — Maldives travel plan', title: 'Neha Sharma — Maldives trip', meta: 'Post · Goa trip collection' },
  { to: '/restaurants/reviews', img: `${IMG}resturant--images--reviews.webp`, alt: 'Saved place — Bombay Brasserie', title: 'Bombay Brasserie', meta: 'Place · Date night collection' },
  { to: '/entertainment/events', img: `${IMG}entertainment--3.-events.webp`, alt: 'Saved event — Sunset Jazz', title: 'Sunset Jazz Night', meta: 'Event · 8:00 PM, Marina Amphitheatre' },
  { to: '/social/circle', img: `${IMG}social-life.webp`, alt: 'Saved circle — Foodies of Together City', title: 'Foodies of Together City', meta: 'Circle · 24 members' },
  { to: '/social/feed', img: `${IMG}social-life--social-life.webp`, alt: 'Saved post — Marine Drive sunset', title: 'Karan Malhotra — Marine Drive', meta: 'Post · #SunsetVibes' },
  { to: '/travel/hotels', img: `${IMG}travel-hub-sub-pages--just-images--hotel-imahe.webp`, alt: 'Saved hotel — Goa resort', title: 'Goa beach resort', meta: 'Hotel · Goa trip collection · price dropped' },
  { to: '/entertainment/events', img: `${IMG}entertainment--home-page.webp`, alt: 'Saved event — City Food Festival', title: 'City Food Festival', meta: 'Event · 2.5K joined' },
  { to: '/social/feelings', img: `${IMG}social-life.webp`, alt: 'Saved place — Pali Hill Café', title: 'Pali Hill Café', meta: 'Place · 3.2 km away' },
];

const FILTERS = ['All', 'Posts', 'Places', 'Events', 'Goa trip', 'Date night'];

/** Social Life · Saved — bookmarked posts, places and events. */
export function SocialSaved() {
  const [filter, setFilter] = useState(0);
  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '28px 16px' }}>
      <div
        className="rise"
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 16, marginBottom: 28 }}
      >
        <div>
          <div className="eyebrow">Social Life · Saved</div>
          <h1 style={{ fontSize: 'clamp(26px,3vw,38px)' }}>Kept for later</h1>
          <p className="lede" style={{ marginTop: 6 }}>Bookmarked posts, places and events, organised into collections.</p>
        </div>
        <div className="pill-row">
          {FILTERS.map((f, i) => (
            <span key={f} className={i === filter ? 'pill on' : 'pill'} style={{ cursor: 'pointer' }} onClick={() => setFilter(i)}>{f}</span>
          ))}
        </div>
      </div>

      <div className="rise d1" style={{ columns: '4 220px', columnGap: 16 }}>
        {ITEMS.map((it, i) => (
          <Link
            key={i} className="mitem" to={it.to}
            style={{
              display: 'block', breakInside: 'avoid', marginBottom: 16, borderRadius: 'var(--radius)',
              overflow: 'hidden', background: 'var(--card)', border: '1px solid var(--line)',
              boxShadow: 'var(--shadow)', textDecoration: 'none', color: 'inherit',
            }}
          >
            <img loading="lazy" decoding="async" src={it.img} alt={it.alt} style={{ width: '100%', display: 'block' }} />
            <div style={{ padding: '10px 12px' }}>
              <h4 style={{ fontSize: 13 }}>{it.title}</h4>
              <div className="m" style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{it.meta}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
