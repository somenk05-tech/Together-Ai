import { Link, useNavigate } from 'react-router-dom';
import { useHubTheme } from '@/hooks/useHubTheme';

/** A clickable building silhouette on the pavilion-city map. */
interface Zone { to: string; label: string; shape: 'poly' | 'ellipse'; points?: string; cx?: number; cy?: number; rx?: number; ry?: number; }
const ZONES: Zone[] = [
  { to: '/travel', label: 'Travel Hub', shape: 'poly', points: '135,335 240,272 400,230 505,242 545,290 535,355 470,385 330,398 210,388 152,368' },
  { to: '/restaurants', label: 'Restaurants', shape: 'poly', points: '508,342 540,304 715,299 756,334 758,442 706,472 545,470 508,432' },
  { to: '/nutrition', label: 'Nutrition & Groceries', shape: 'poly', points: '118,428 152,390 388,384 425,416 425,540 380,576 162,576 118,540' },
  { to: '/entertainment', label: 'Entertainment', shape: 'poly', points: '528,466 562,427 758,424 790,458 790,580 744,616 572,616 528,578' },
  { to: '/social', label: 'Social Life', shape: 'poly', points: '228,612 268,568 608,564 640,600 640,750 590,790 282,790 228,748' },
  { to: '/dating', label: 'Dating Hub', shape: 'ellipse', cx: 950, cy: 695, rx: 145, ry: 108 },
  { to: '/medical', label: 'Medical Hub', shape: 'poly', points: '1258,362 1294,322 1490,320 1524,356 1524,474 1478,514 1302,512 1258,474' },
  { to: '/realestate', label: 'Real Estate', shape: 'poly', points: '1080,496 1114,457 1300,454 1330,489 1330,594 1284,632 1120,630 1080,590' },
  { to: '/financial', label: 'Financial District', shape: 'poly', points: '1602,236 1640,196 1844,194 1880,229 1880,378 1834,418 1650,415 1600,376' },
  { to: '/beauty', label: 'Beauty Market', shape: 'poly', points: '1586,468 1624,430 1858,427 1895,462 1895,588 1849,626 1642,623 1586,586' },
  { to: '/jobs', label: 'Jobs Hub', shape: 'poly', points: '1292,626 1330,586 1588,584 1620,619 1620,762 1568,805 1352,800 1292,756' },
];

interface Pavilion { to: string; img: string; title: string; meta: string; blurb: string; soon?: boolean; }
const PAVILIONS: Pavilion[] = [
  { to: '/travel', img: 'travel-hub.webp', title: 'Travel Hub', meta: 'Flights · Trains · Hotels · Packages', blurb: 'Plan your entire journey in one place — chat with friends, split expenses, book together.' },
  { to: '/restaurants', img: 'resturants.webp', title: 'Restaurants', meta: 'Find a meal · Explore · Book a table', blurb: 'Shortlisted for quality, hygiene and consistency — you only see places that meet the standard.' },
  { to: '/nutrition', img: 'nutrition-and-groceies.webp', title: 'Nutrition & Groceries', meta: 'Meal plans · Grocery · Supplements', blurb: 'Every meal plan and grocery list personalised around your body, blood reports and goals.' },
  { to: '/social', img: 'social-life.webp', title: 'Social Life', meta: 'Feed · Explore · Circles · Events', blurb: 'Discover everything happening around you — and earn rewards for authentic contributions.' },
  { to: '/dating', img: 'dating-hub.webp', title: 'Dating Hub', meta: 'Curated matches · Activity dating', blurb: 'Instead of endless profiles, we introduce you to your most compatible matches.' },
  { to: '/entertainment', img: 'entertainment.webp', title: 'Entertainment', meta: 'Movies · Events · Comedy · Sports', blurb: "There's always something worth experiencing — personalised to you and your friends." },
  { to: '/realestate', img: 'real-estate.webp', title: 'Real Estate', meta: 'Houses · Offices · Shops', blurb: 'Properties that match your lifestyle, budget and future plans — focused, not overwhelming.' },
  { to: '/jobs', img: 'jobs-hub.webp', title: 'Jobs Hub', meta: 'Upload CV · Private matching', blurb: 'Companies come to us; we match your profile privately and send opportunities to you.' },
  { to: '/medical', img: 'medical-hub.webp', title: 'Medical Hub', meta: 'Records · Doctors · Insights', blurb: '5 GB of secure records, trusted doctors, and health insights that power your whole city.' },
  { to: '/beauty', img: 'beautymarket.webp', title: 'Beauty Market', meta: 'Profile · Dermatologist · Routine', blurb: 'A routine built from your skin, your goals and verified expertise — not marketing.' },
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
      <div className="citymap">
        <img className="bg" src={img('final-homepage.webp')} alt="Together City — golden-hour pavilion city on the waterfront" />
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
