import { Link } from 'react-router-dom';
import { IMG, PCard, PillRow, TravelHero, TrustBar } from '../shared';

const DEST = [
  { img: `${IMG}hotel-imahe.webp`, title: 'Dubai', meta: '120+ guides' },
  { img: `${IMG}packages.webp`, title: 'Bali', meta: '★ 4.7 · 95+ guides' },
  { img: `${IMG}flight-image.webp`, title: 'Paris', meta: '★ 4.9 · 150+ guides' },
  { img: `${IMG}trains.webp`, title: 'Tokyo', meta: '★ 4.8 · 110+ guides' },
  { img: `${IMG}mybookings-image.webp`, title: 'New York', meta: '★ 4.6 · 100+ guides' },
];
const THEMES = ['Adventure', 'Family', 'Luxury', 'Budget', 'Food & culture', 'Nature'];
const GUIDES = [
  { img: `${IMG}hotel-imahe.webp`, title: 'Ultimate Dubai Guide', meta: 'Sarah Khan · ★ 4.9' },
  { img: `${IMG}packages-image.webp`, title: 'Bali Beyond Beaches', meta: 'Rohan Mehta · ★ 4.7' },
  { img: `${IMG}trains-image.webp`, title: 'Europe in 10 Days', meta: 'Elena Fischer · ★ 4.8' },
  { img: `${IMG}travel-guide.webp`, title: 'Japan Travel Essentials', meta: 'Kenji Watanabe · ★ 4.9' },
];
const TIPS = [
  { img: `${IMG}mybookings-image.webp`, t: 'How to pack smart for any trip', m: '5 min read' },
  { img: `${IMG}flight-image.webp`, t: 'Top 10 travel apps for 2026', m: '4 min read' },
];

const themetile: React.CSSProperties = {
  background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 'var(--radius)',
  padding: '22px 18px', textAlign: 'center', fontWeight: 600, fontSize: 13.5,
};

export function TravelGuide() {
  return (
    <>
      <TravelHero eyebrow="Travel Hub · 08" title="Travel Guide" sub="Explore the world with expert guides and travel tips." bg={`${IMG}travel-guide-images.webp`}>
        <input type="text" placeholder="Search destinations, guides, experiences…" aria-label="Search the travel guide"
          style={{ width: '100%', maxWidth: 560, border: '1px solid var(--line)', background: 'var(--card)', borderRadius: 999, padding: '15px 22px', fontSize: 14, color: 'var(--ink)', outline: 'none', fontFamily: 'inherit', marginTop: 18 }} />
      </TravelHero>

      <PillRow pills={['Destination guides', 'Travel tips', 'Local experiences', 'Itineraries', 'Offline access']} />

      <section className="blk rise d2">
        <div className="blk-head"><h2>Popular destinations</h2></div>
        <div className="grid5">
          {DEST.map((d) => <PCard key={d.title} to="/travel/guide" img={d.img} title={d.title} meta={d.meta} />)}
        </div>
      </section>

      <section className="blk rise d2">
        <div className="blk-head"><h2>Travel by theme</h2></div>
        <div className="grid3" style={{ gridTemplateColumns: 'repeat(6,1fr)' }}>
          {THEMES.map((t) => <a key={t} className="themetile" href="#themes" style={themetile}>{t}</a>)}
        </div>
      </section>

      <section className="blk rise d3">
        <div className="blk-head"><h2>Featured guides</h2></div>
        <div className="grid4">
          {GUIDES.map((g) => <PCard key={g.title} to="/travel/guide" img={g.img} title={g.title} meta={g.meta} />)}
        </div>
      </section>

      <section className="blk rise d4">
        <div className="blk-head"><h2>Travel tips</h2></div>
        <div className="rows">
          {TIPS.map((t) => (
            <Link key={t.t} className="row" to="/travel/guide">
              <img loading="lazy" decoding="async" className="thumb" src={t.img} alt="" />
              <div className="grow"><div className="t">{t.t}</div><div className="m">{t.m}</div></div>
            </Link>
          ))}
        </div>
      </section>

      <TrustBar items={['Editorial & verified', 'Offline access', 'Local experts', 'Updated weekly']} />
    </>
  );
}
