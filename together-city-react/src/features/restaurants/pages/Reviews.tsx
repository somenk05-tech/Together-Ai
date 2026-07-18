import { useState } from 'react';
import { Link } from 'react-router-dom';

const split = { display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr)', gap: 28, marginTop: 24 } as const;

const TABS = ['All Reviews (24)', 'Published (20)', 'Drafts (2)', 'Photos & Videos (48)'];

const REVIEWS: { name: string; img: string; rating: string; when: string; text: string; extra: string }[] = [
  { name: 'The Imperial Table', img: 'book-a-table', rating: '★4.8', when: '2 days ago', text: 'Exceptional evening from start to finish — the truffle risotto and the chocolate dome were the highlight of our anniversary dinner.', extra: '+3' },
  { name: 'Burger Barn', img: 'landing', rating: '★4.3', when: '1 week ago', text: 'Solid cheat-day pick — the Classic Cheese Burger is generous and the fries are always crisp. Delivery ran a little late.', extra: '+1' },
  { name: 'Chaayos Cafe', img: 'find-a-meal', rating: '★4.5', when: '3 weeks ago', text: 'Great spot for a working lunch — quick service, good chai, and the seating is comfortable for a laptop afternoon.', extra: '+5' },
];

const STATS = [['Reviews', '24'], ['Media', '48'], ['Views', '22.1K'], ['Avg Rating', '4.6']] as const;
const BADGES = [['Foodie Reviewer', 'gold'], ['Rising Influencer', ''], ['Top Reviewer', ''], ['Community Star', '']] as const;

/** My Reviews — every rating, photo and note you've left behind. */
export function Reviews() {
  const [tab, setTab] = useState(0);
  return (
    <div style={{ maxWidth: 1120, margin: '0 auto', padding: '24px 16px 60px' }}>
      <div className="hero rise" style={{ minHeight: 260 }}>
        <img className="bg" src="/assets/img/resturant--images--reviews.webp" alt="Diner writing a review over a finished meal" />
        <div className="inner">
          <div className="eyebrow">Restaurants Hub · 05</div>
          <h1 style={{ fontSize: 'clamp(28px,3vw,44px)' }}>My Reviews</h1>
          <p className="sub">Your voice — every rating, photo and note you've left behind.</p>
        </div>
      </div>

      <div className="tabrow rise" style={{ marginTop: 24 }}>
        {TABS.map((t, i) => <a key={t} className={i === tab ? 'on' : undefined} onClick={() => setTab(i)}>{t}</a>)}
      </div>

      <div style={split}>
        <div>
          <div className="card" style={{ marginBottom: 18 }}>
            <h4>Write a New Review</h4>
            <p className="meta" style={{ display: 'block', margin: '8px 0 10px' }}>Share how your last meal really went.</p>
            <input placeholder="Search a restaurant to review…" style={{ width: '100%', border: '1px solid var(--line)', borderRadius: 999, padding: '11px 18px', fontSize: 13.5, background: 'var(--paper)', color: 'var(--ink)', outline: 'none', marginBottom: 10 }} />
            <span className="btn btn-gold btn-sm" style={{ cursor: 'pointer' }}>Write a New Review →</span>
          </div>

          <div className="rows">
            {REVIEWS.map((rv) => (
              <div key={rv.name} className="card" style={{ display: 'flex', gap: 16 }}>
                <img loading="lazy" src={`/assets/img/resturant--images--${rv.img}.webp`} alt={rv.name} style={{ width: 88, height: 88, borderRadius: 12, objectFit: 'cover', flexShrink: 0 }} />
                <div className="grow">
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                    <h4>{rv.name} <span style={{ color: 'var(--gold-bright)' }}>{rv.rating}</span></h4>
                    <span className="meta">{rv.when}</span>
                  </div>
                  <p style={{ fontSize: 13.5, color: 'var(--ink-soft)', marginTop: 6 }}>{rv.text}</p>
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}><span style={{ width: 38, height: 38, borderRadius: 8, background: 'var(--accent-soft)', color: 'var(--accent)', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{rv.extra}</span></div>
                  <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 11.5, letterSpacing: '.06em', fontWeight: 600, color: 'var(--muted)' }}>
                    <span style={{ cursor: 'pointer' }}>Edit</span><span style={{ cursor: 'pointer' }}>Delete</span><span style={{ cursor: 'pointer' }}>Share</span>
                    <Link to="/restaurants/checkout" style={{ color: 'inherit' }}>Order Now</Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="grid2" style={{ gap: 12 }}>
            {STATS.map(([lab, val]) => <div key={lab} className="stat"><div className="lab">{lab}</div><div className="val">{val}</div></div>)}
          </div>
          <div className="card">
            <h4>Top Reviews</h4>
            <div className="rows" style={{ marginTop: 12 }}>
              {[['The Imperial Table', '★4.8 · 3.4K views'], ['Chaayos Cafe', '★4.5 · 2.1K views']].map(([t, m]) => (
                <div key={t} className="row" style={{ boxShadow: 'none', padding: '10px 12px' }}><div className="grow"><div className="t" style={{ fontSize: 13 }}>{t}</div><div className="m">{m}</div></div></div>
              ))}
            </div>
          </div>
          <div className="card">
            <h4>Influencer Badges</h4>
            <div className="pill-row" style={{ marginTop: 12 }}>{BADGES.map(([b, cls]) => <span key={b} className={`tag${cls ? ' ' + cls : ''}`}>{b}</span>)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
