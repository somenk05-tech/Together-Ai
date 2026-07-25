import { Link, useNavigate } from 'react-router-dom';
import { useHubTheme } from '@/hooks/useHubTheme';
import { CityHeader } from '@/components/CityHeader';
import { RecentPanel } from '@/components/RecentPanel';

/** A clickable building silhouette on the pavilion-city map. */
interface Zone { to: string; label: string; shape: 'poly' | 'ellipse'; points?: string; cx?: number; cy?: number; rx?: number; ry?: number; }
// Clickable building zones, mapped to the new homepage video (buildings are
// static; only the billboards animate). Coords are in the SVG viewBox (1903x826).
// News, Cars and E-Commerce buildings have no hub route yet, so they're not zoned.
const ZONES: Zone[] = [
  { to: '/travel', label: 'Travel Hub', shape: 'poly', points: '264.9,227.9 488.7,227.9 488.7,343.8 264.9,343.8' },
  { to: '/nutrition', label: 'Nutrition & Groceries', shape: 'poly', points: '178.4,364.2 461.2,364.2 461.2,496.4 178.4,496.4' },
  { to: '/social', label: 'Social Life', shape: 'poly', points: '173.3,502.5 381.9,502.5 381.9,652.1 173.3,652.1' },
  { to: '/astrology', label: 'Astrology Hub', shape: 'poly', points: '183.5,665.3 381.9,665.3 381.9,794.5 183.5,794.5' },
  { to: '/cars', label: 'Cars Hub', shape: 'poly', points: '575.2,659.2 768.4,659.2 768.4,789.4 575.2,789.4' },
  { to: '/dating', label: 'Matchmaking Hub', shape: 'ellipse', cx: 951.5, cy: 524.9, rx: 132.2, ry: 73.2 },
  { to: '/medical', label: 'Medical Hub', shape: 'poly', points: '1144.8,290.9 1441.8,290.9 1441.8,415.0 1144.8,415.0' },
  { to: '/jobs', label: 'Jobs Hub', shape: 'poly', points: '1195.6,504.6 1401.1,504.6 1401.1,652.1 1195.6,652.1' },
  { to: '/beauty', label: 'Beauty Market', shape: 'poly', points: '1154.9,659.2 1401.1,659.2 1401.1,789.4 1154.9,789.4' },
  { to: '/financial', label: 'Financial District', shape: 'poly', points: '1490.6,199.4 1790.7,199.4 1790.7,345.9 1490.6,345.9' },
  { to: '/realestate', label: 'Real Estate', shape: 'poly', points: '1490.6,372.3 1795.8,372.3 1795.8,518.8 1490.6,518.8' },
  { to: '/fitness', label: 'Fitness Hub', shape: 'poly', points: '1490.6,557.4 1790.7,557.4 1790.7,753.8 1490.6,753.8' },
];

interface Pavilion { to: string; img: string; title: string; meta: string; blurb: string; soon?: boolean; }
const PAVILIONS: Pavilion[] = [
  { to: '/travel', img: 'travel-hub.webp', title: 'Travel Hub', meta: 'Flights · Trains · Hotels · Packages', blurb: 'Plan your entire journey in one place — chat with friends, split expenses, book together.' },
  { to: '/astrology', img: 'astrology-hub.webp', title: 'Astrology Hub', meta: 'Birth chart · Horoscope · Compatibility', blurb: 'Your natal chart, daily readings and cosmic compatibility — guidance written in the stars, personalised to you.' },
  { to: '/nutrition', img: 'nutrition-and-groceies.webp', title: 'Nutrition & Groceries', meta: 'Meal plans · Grocery · Supplements', blurb: 'Every meal plan and grocery list personalised around your body, blood reports and goals.' },
  { to: '/social', img: 'social-life.webp', title: 'Social Life', meta: 'Feed · Explore · Circles · Events', blurb: 'Discover everything happening around you — and earn rewards for authentic contributions.' },
  { to: '/dating', img: 'dating-hub.webp', title: 'Dating Hub', meta: 'Curated matches · Activity dating', blurb: 'Instead of endless profiles, we introduce you to your most compatible matches.' },
  { to: '/entertainment', img: 'entertainment.webp', title: 'Entertainment', meta: 'Movies · OTT · Trailers · Curated', blurb: "There's always something worth experiencing — personalised to you and your friends." },
  { to: '/realestate', img: 'real-estate.webp', title: 'Real Estate', meta: 'Houses · Offices · Shops', blurb: 'Properties that match your lifestyle, budget and future plans — focused, not overwhelming.' },
  { to: '/jobs', img: 'jobs-hub.webp', title: 'Jobs Hub', meta: 'Upload CV · Private matching', blurb: 'Companies come to us; we match your profile privately and send opportunities to you.' },
  { to: '/medical', img: 'medical-hub.webp', title: 'Medical Hub', meta: 'Records · Doctors · Insights', blurb: '5 GB of secure records, trusted doctors, and health insights that power your whole city.' },
  { to: '/beauty', img: 'beautymarket.webp', title: 'Beauty Market', meta: 'Profile · Market · Routine', blurb: 'A routine built from your skin, your goals and verified expertise — not marketing.' },
  { to: '/fitness', img: 'fitness-hero.webp', title: 'Fitness Hub', meta: 'Workouts · Walks · Supplements', blurb: 'Personalised home & gym plans, a live guided timer, and everything tracked.' },
  { to: '/financial', img: 'financial-district.webp', title: 'Financial District', meta: 'Budget · Wallet · Payments', blurb: 'All your city spending in one simple dashboard — understand, plan, decide.' },
  { to: '#', img: 'e-commerce.webp', title: 'E-Commerce', meta: 'Vetted products only', blurb: 'Every product checked against quality and safety standards. We research, you shop.', soon: true },
];

const FALLBACK = PAVILIONS.slice(0, 12);

/** City home — the pavilion city, ported 1:1 from index.html. */
export function Home() {
  useHubTheme(null);
  const navigate = useNavigate();
  const img = (f: string) => `/assets/img/${f}`;

  return (
    <div>
      {/* ============ THE PAVILION CITY ============ */}
      <div className="citymap" style={{ position: 'relative' }}>
        {/* Dynamic city strip — location · date · live weather, top-left in the sky.
            z-index above the clickable map SVG (which is z-index 5). */}
        <div style={{ position: 'absolute', top: 18, left: 18, zIndex: 20, pointerEvents: 'none' }}>
          <CityHeader />
        </div>
        {/* Looping city background video. The still image is the poster, so the
            page looks identical until the video loads (and if the video is ever
            missing) — the clickable building zones below never break. */}
        <video
          className="bg"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          poster={img('final-homepage.webp')}
          aria-label="Together City — golden-hour pavilion city on the waterfront"
        >
          <source src="/assets/video/together-city-loop.webm" type="video/webm" />
          <source src="/assets/video/together-city-loop.mp4" type="video/mp4" />
        </video>
        <svg className="bmap" viewBox="0 0 1903 826" preserveAspectRatio="xMidYMid slice" aria-label="Together City map">
          {ZONES.map((z) => (
            <g key={z.to} role="link" aria-label={z.label} onClick={() => navigate(z.to)} style={{ cursor: 'pointer' }}>
              <title>{z.label}</title>
              {z.shape === 'ellipse'
                ? <ellipse cx={z.cx} cy={z.cy} rx={z.rx} ry={z.ry} />
                : <polygon points={z.points} />}
            </g>
          ))}
        </svg>
      </div>

      {/* mobile fallback grid */}
      <div className="cityfallback">
        {FALLBACK.map((p) => (
          <Link key={p.to} to={p.to}><img loading="lazy" src={img(p.img)} alt="" /><span>{p.title}</span></Link>
        ))}
      </div>

      <div className="wrap" style={{ maxWidth: 1240, margin: '0 auto', padding: '88px 32px 24px' }}>
        {/* ============ WELCOME ============ */}
        <div className="center rise" style={{ textAlign: 'center' }}>
          <div className="eyebrow" style={{ fontSize: 'clamp(14px, 1.5vw, 18px)', letterSpacing: '0.22em' }}>Welcome to Together City</div>
          <h1 style={{ maxWidth: '22ch', margin: '0 auto', fontSize: 'clamp(34px, 5.2vw, 64px)', lineHeight: 1.1 }}>The world&apos;s largest digital city. Everything. Personalized.</h1>
          <p className="lede" style={{ margin: '22px auto 0', fontSize: 'clamp(18px, 1.9vw, 23px)', lineHeight: 1.6, maxWidth: '58ch' }}>
            Every hub belongs to the same city but carries its own atmosphere. Walk the waterfront, step into a pavilion, and everything — travel, dining, health, home, work, love — is personalised around one identity: yours.
          </p>
          <div style={{ marginTop: 30, display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link className="btn btn-gold" to="/dashboard">Enter your city</Link>
          </div>
        </div>

        <div className="rule" />

        {/* ============ CONTINUE WHERE YOU LEFT OFF ============ */}
        <RecentPanel />

        {/* ============ WALK THE DISTRICTS ============ */}
        <section className="blk">
          <div className="blk-head"><h2>Walk the districts</h2><Link className="more" to="/social/feed">Your city today →</Link></div>
          <div className="grid3">
            {PAVILIONS.map((p) => {
              const inner = (
                <>
                  <div className="ph"><img src={img(p.img)} alt={`${p.title} pavilion`} /></div>
                  <div className="pb">
                    <h4>{p.title}{p.soon && <span className="tag soon" style={{ marginLeft: 8 }}>Coming soon</span>}</h4>
                    <p className="meta">{p.meta}</p>
                    <p className="muted" style={{ fontSize: 13 }}>{p.blurb}</p>
                  </div>
                </>
              );
              return p.soon
                ? <div key={p.title} className="pcard" style={{ cursor: 'default' }}>{inner}</div>
                : <Link key={p.to} className="pcard" to={p.to}>{inner}</Link>;
            })}
          </div>
        </section>

        <div className="trust">
          <span>◈ One identity, every hub</span>
          <span>◈ Curated, never cluttered</span>
          <span>◈ Private by default</span>
          <span>◈ Split &amp; plan with friends</span>
          <span>◈ Concierge always on</span>
        </div>
      </div>
    </div>
  );
}
