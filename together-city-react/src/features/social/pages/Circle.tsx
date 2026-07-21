import { Link } from 'react-router-dom';
import { IMG } from '../shared';

const MEMBERS = ['PR', 'RH', 'NS', 'RM', 'GS'];

const PINNED = [
  {
    to: '/entertainment/discover', img: `${IMG}entertainment--3.-events.webp`,
    title: 'City Food Festival', meta: 'Pinned event · 2.5K joined',
    alt: 'City Food Festival — pinned event',
  },
  {
    to: '/restaurants/explore', img: `${IMG}resturant--images--explore.webp`,
    title: "This month's favourite", meta: 'Bombay Brasserie · voted by circle',
    alt: "This month's favourite restaurant",
  },
];

const FEED = [
  { av: 'RM', to: '/restaurants/reviews', t: 'Rohan Mehta rated Bombay Brasserie 5★', m: 'Yesterday, 9:40 PM' },
  { av: 'PR', to: '/social/feed', t: 'Priya — "Just tried the new sushi place in Financial District"', m: '8:50 AM' },
  { av: 'RH', to: '/social/feed', t: 'Rahul shared a photo from the tasting menu night', m: '2 days ago' },
  { av: 'GS', to: '/social/feelings', t: 'The Gourmet Soul posted a guide: "5 hidden cafés in Bandra"', m: '3 days ago' },
];

/** Social Life · Circle — the "Foodies of Together City" community page. */
export function SocialCircle() {
  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '28px 16px' }}>
      <div className="cband rise" style={{ position: 'relative', height: 220, borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <img
          loading="lazy" decoding="async"
          src={`${IMG}social-life--social-life.webp`}
          alt="Foodies of Together City — circle cover, café gathering"
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top,rgba(8,9,8,.75),transparent 60%)' }} />
        <div style={{ position: 'absolute', left: 26, bottom: 20, zIndex: 2, color: '#fff' }}>
          <div className="eyebrow" style={{ color: 'var(--gold-bright)' }}>Circle</div>
          <h1 style={{ color: '#fff', fontSize: 'clamp(24px,3vw,32px)', textShadow: '0 2px 16px rgba(0,0,0,.4)' }}>
            Foodies of Together City
          </h1>
        </div>
      </div>

      <div
        className="rise d1"
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, marginTop: 20 }}
      >
        <div>
          <div style={{ display: 'flex', margin: '22px 0 8px' }}>
            {MEMBERS.map((m, i) => (
              <div
                key={m} className="av"
                style={{ marginLeft: i === 0 ? 0 : -10, border: '3px solid var(--card)' }}
              >
                {m}
              </div>
            ))}
            <div
              style={{
                width: 44, height: 44, borderRadius: '50%', background: 'var(--accent-soft)',
                color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 600, marginLeft: -10, border: '3px solid var(--card)',
              }}
            >
              +19
            </div>
          </div>
          <p style={{ fontSize: 12.5, color: 'var(--muted)' }}>
            24 members · trading real reviews from every corner of the city
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link className="btn btn-line btn-sm" to="/social/messages">Circle chat</Link>
          <Link className="btn btn-gold btn-sm" to="/social/feed">Joined ✓</Link>
        </div>
      </div>

      <section className="blk rise d2" style={{ marginTop: 36 }}>
        <div className="blk-head"><h2>Pinned</h2></div>
        <div className="grid3">
          {PINNED.map((p) => (
            <Link key={p.title} className="pcard" to={p.to}>
              <div className="ph"><img loading="lazy" decoding="async" src={p.img} alt={p.alt} /></div>
              <div className="pb"><h4>{p.title}</h4><p className="meta">{p.meta}</p></div>
            </Link>
          ))}
        </div>
      </section>

      <section className="blk rise d3">
        <div className="blk-head"><h2>Circle feed</h2></div>
        <div className="rows">
          {FEED.map((f, i) => (
            <Link key={i} className="row" to={f.to}>
              <div className="av">{f.av}</div>
              <div className="grow"><div className="t">{f.t}</div><div className="m">{f.m}</div></div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
