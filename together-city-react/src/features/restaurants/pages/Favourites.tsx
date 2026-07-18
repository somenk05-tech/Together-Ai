import { useState } from 'react';
import { Link } from 'react-router-dom';

const split = { display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr)', gap: 28, marginTop: 24 } as const;

const TABS = ['All Favourites (12)', 'Recently Visited (5)', 'Want to Try (7)', 'Collections (2)'];

const PLACES: { name: string; img: string; meta: string }[] = [
  { name: 'The Imperial Table', img: 'book-a-table', meta: 'Multi-cuisine · ★4.8 · Connaught Place' },
  { name: 'Burger Barn', img: 'landing', meta: 'American · ★4.3 · Cyber Hub, Gurgaon' },
  { name: 'Olive Bar & Kitchen', img: 'explore', meta: 'Mediterranean · ★4.6 · Bandra West, Mumbai' },
  { name: 'Sushi Story', img: 'find-a-meal', meta: 'Japanese · ★4.5 · Koramangala, Bengaluru' },
  { name: 'The Leela Pavilion', img: 'reviews', meta: 'Fine Dine · ★4.8 · Hauz Khas' },
];

const STATS = [['Favourites', '12'], ['Restaurants', '8'], ['Areas', '6'], ['Avg Rating', '4.6']] as const;
const POPULAR = [['The Imperial Table', 'Visited 6 times'], ['Burger Barn', 'Visited 4 times'], ['The Leela Pavilion', 'Visited 3 times']] as const;

/** My Favourites — every place you've loved, saved in one list. */
export function Favourites() {
  const [tab, setTab] = useState(0);
  return (
    <div style={{ maxWidth: 1120, margin: '0 auto', padding: '24px 16px 60px' }}>
      <div className="hero rise" style={{ minHeight: 260 }}>
        <img className="bg" src="/assets/img/resturant--images--favourites.webp" alt="Intimate restaurant corner table" />
        <div className="inner">
          <div className="eyebrow">Restaurants Hub · 04</div>
          <h1 style={{ fontSize: 'clamp(28px,3vw,44px)' }}>My Favourites</h1>
          <p className="sub">Every place you've loved, saved in one list.</p>
        </div>
      </div>

      <div className="tabrow rise" style={{ marginTop: 24 }}>
        {TABS.map((t, i) => <a key={t} className={i === tab ? 'on' : undefined} onClick={() => setTab(i)}>{t}</a>)}
      </div>

      <div style={split}>
        <div>
          <div className="grid3" style={{ gap: 16 }}>
            {PLACES.map((p) => (
              <Link key={p.name} className="pcard" to="/restaurants/discover">
                <div className="ph"><img loading="lazy" src={`/assets/img/resturant--images--${p.img}.webp`} alt={p.name} /><span className="heart">♥</span></div>
                <div className="pb"><h4>{p.name}</h4><p className="meta">{p.meta}</p></div>
              </Link>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="grid2" style={{ gap: 12 }}>
            {STATS.map(([lab, val]) => <div key={lab} className="stat"><div className="lab">{lab}</div><div className="val">{val}</div></div>)}
          </div>
          <div className="card">
            <h4>Popular in Your List</h4>
            <div className="rows" style={{ marginTop: 12 }}>
              {POPULAR.map(([t, m]) => (
                <div key={t} className="row" style={{ boxShadow: 'none', padding: '10px 12px' }}><div className="grow"><div className="t" style={{ fontSize: 13 }}>{t}</div><div className="m">{m}</div></div></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
