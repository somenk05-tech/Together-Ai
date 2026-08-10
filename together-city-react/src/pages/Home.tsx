import { Link, useNavigate } from 'react-router-dom';
import { useHubTheme } from '@/hooks/useHubTheme';
import { useAuthStore } from '@/store/auth.store';
import { CityHeader } from '@/components/CityHeader';
import { RecentPanel } from '@/components/RecentPanel';
import { HUBS } from '@/config/hubs';
import type { HubKey } from '@/types';
import { HUB_ICON } from '@/nav/registry';
import { Icon } from '@/components/ui/Icon';
import { InstallCity } from '@/components/InstallCity';

/** A clickable building silhouette on the pavilion-city map. */
interface Zone { to: string; label: string; shape: 'poly' | 'ellipse'; points?: string; cx?: number; cy?: number; rx?: number; ry?: number; }
// Clickable building zones, mapped to the new homepage video (buildings are
// static; only the billboards animate). Coords are in the SVG viewBox (1903x826).
// The News and E-Commerce buildings are in the photograph and have no hub
// behind them, so they are not zoned — E-Commerce is no longer a district. The
// Cars building is still in the render and no longer clickable — the hub it led
// to is gone, and a zone onto a redirect is a link that lies about where it goes.
const ZONES: Zone[] = [
  { to: '/travel', label: 'Travel Hub', shape: 'poly', points: '264.9,227.9 488.7,227.9 488.7,343.8 264.9,343.8' },
  { to: '/nutrition', label: 'Nutrition & Groceries', shape: 'poly', points: '178.4,364.2 461.2,364.2 461.2,496.4 178.4,496.4' },
  { to: '/social', label: 'Social Life', shape: 'poly', points: '173.3,502.5 381.9,502.5 381.9,652.1 173.3,652.1' },
  { to: '/astrology', label: 'Astrology Hub', shape: 'poly', points: '183.5,665.3 381.9,665.3 381.9,794.5 183.5,794.5' },
  { to: '/dating', label: 'Matchmaking Hub', shape: 'ellipse', cx: 951.5, cy: 524.9, rx: 132.2, ry: 73.2 },
  { to: '/medical', label: 'Medical Hub', shape: 'poly', points: '1144.8,290.9 1441.8,290.9 1441.8,415.0 1144.8,415.0' },
  { to: '/jobs', label: 'Jobs Hub', shape: 'poly', points: '1195.6,504.6 1401.1,504.6 1401.1,652.1 1195.6,652.1' },
  { to: '/beauty', label: 'Beauty Market', shape: 'poly', points: '1154.9,659.2 1401.1,659.2 1401.1,789.4 1154.9,789.4' },
  { to: '/financial', label: 'Financial District', shape: 'poly', points: '1490.6,199.4 1790.7,199.4 1790.7,345.9 1490.6,345.9' },
  { to: '/realestate', label: 'Real Estate', shape: 'poly', points: '1490.6,372.3 1795.8,372.3 1795.8,518.8 1490.6,518.8' },
  { to: '/fitness', label: 'Fitness Hub', shape: 'poly', points: '1490.6,557.4 1790.7,557.4 1790.7,753.8 1490.6,753.8' },
];

interface Pavilion { to: string; img: string; title: string; meta: string; blurb: string; }
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
];

/* Twelve tiles, six across and two down. This used to be `slice(0, 12)`,
   which was not a cap — it was how the thirteenth entry, a coming-soon
   E-Commerce tile, was kept off the grid while staying in the array. The
   entry is gone, so the slice would now be a rule with nothing to enforce. */
const FALLBACK = PAVILIONS;

/**
 * "Walk the districts" — the hub landing heroes laid out inline on the home
 * page, full-bleed and stacked so you scroll through them one by one. Each
 * panel links straight INTO the hub (its first inner page), not the hub
 * landing, so the landing isn't shown twice. Copy comes from the hub config.
 */
/**
 * THE DISTRICTS' OWN VOICE (owner's master list, 9 Aug 2026).
 *
 * One noun and one sentence per district — "TRAVEL / Your world, planned your
 * way." The hub configs keep their own tags for the rooms inside; this is the
 * street-level copy the billboards wear, and it lives here rather than in
 * hubs.ts so a hub's interior label and its billboard line can differ without
 * either pretending to be the other.
 *
 * Local Services is absent DELIBERATELY: the master list names CARS, and this
 * city has no cars hub — /cars redirects into Local Services. A plate that
 * announced a room the app does not have would be the one thing the golden
 * rule forbids, so Services keeps its config copy until it is given a line.
 */
const DISTRICT_COPY: Partial<Record<HubKey, { name: string; line: string }>> = {
  travel: { name: 'Travel', line: 'Your world, planned your way.' },
  nutrition: { name: 'Nutrition', line: 'Your food, personalized to you.' },
  dating: { name: 'Matchmaking', line: 'Your connection, intelligently matched.' },
  entertainment: { name: 'Entertainment', line: 'Your world of things you love.' },
  jobs: { name: 'Jobs', line: 'Your career, your next move.' },
  medical: { name: 'Medical', line: 'Your health, all in one place.' },
  financial: { name: 'Financial', line: 'Your money, working toward your goals.' },
  realestate: { name: 'Real Estate', line: 'Your perfect space, found for you.' },
  fitness: { name: 'Fitness', line: 'Your body. Your goals. Your journey.' },
  beauty: { name: 'Beauty', line: 'Your look, your way.' },
  social: { name: 'Social Life', line: 'Your people. Your communities. Your world.' },
  astrology: { name: 'Astrology', line: 'Your stars. Your journey. Your timing.' },
};

/**
 * THE NAME A DISTRICT WEARS, IN ONE PLACE.
 *
 * Two sources now: the billboard copy above, then the hub config. There used
 * to be a third — a literal for E-Commerce, the one district with no hub
 * behind it — and every place this key was handled carried a branch for that
 * one exception. The run is SORTED by this name, and a sort keyed on one
 * spelling while the screen prints another is the kind of bug that looks like
 * a mystery, so it is worth having exactly one answer here.
 */
function districtName(key: HubKey): string {
  return DISTRICT_COPY[key]?.name ?? HUBS[key].name;
}

interface Panel { key: HubKey; img: string; }
const PANELS: Panel[] = [
  { key: 'travel', img: 'travel-hub.webp' },
  { key: 'astrology', img: 'astrology-hub.webp' },
  { key: 'nutrition', img: 'nutrition-and-groceies.webp' },
  { key: 'social', img: 'social-life.webp' },
  { key: 'dating', img: 'dating-hub.webp' },
  { key: 'entertainment', img: 'entertainment.webp' },
  { key: 'realestate', img: 'real-estate.webp' },
  { key: 'jobs', img: 'jobs-hub.webp' },
  { key: 'medical', img: 'medical-hub.webp' },
  { key: 'beauty', img: 'beautymarket.webp' },
  { key: 'fitness', img: 'fitness-hero.webp' },
  { key: 'financial', img: 'financial-district.webp' },
  // Waiting on its photograph. The plate is built for that — the well is lit
  // and the picture fades onto it when local-services.webp lands in assets/img.
  { key: 'services', img: 'local-services.webp' },
];

/**
 * THE ORDER YOU WALK THEM IN: A TO Z, BY WHAT THE PLATE SAYS.
 *
 * The owner asked for alphabetical. Sorted here rather than retyped into
 * PANELS because the two can disagree: a district's billboard name is not its
 * key and not always its hub name — `dating` reads "Matchmaking" and sorts
 * under M, `services` reads "Local Services" and sorts under L. A hand-typed
 * order would be correct today and quietly wrong the first time a district is
 * renamed. This cannot be.
 *
 * PANELS keeps its own order because it is a different list: which districts
 * exist and which photograph each one wears.
 */
const DISTRICTS: Panel[] = [...PANELS].sort((a, b) => districtName(a.key).localeCompare(districtName(b.key)));

/** City home — the pavilion city, ported 1:1 from index.html. */
export function Home() {
  const authed = useAuthStore((s) => Boolean(s.tokens?.accessToken && s.user));
  /* The page reads differently on a phone: no key into a city you are already
     standing in, the city grid at the foot, and the resume shelf after it. */
  const phone = typeof window !== 'undefined' && window.matchMedia('(max-width: 899px)').matches;
  useHubTheme(null);
  const navigate = useNavigate();
  const img = (f: string) => `/assets/img/${f}`;

  return (
    <div>
      {/* ============ THE PAVILION CITY ============ */}
      <div className="citymap" style={{ position: 'relative', background: 'var(--media-bg)' }}>
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

      <div className="wrap" style={{ maxWidth: 1240, margin: '0 auto', padding: '88px 32px 24px' }}>
        {/* ============ WELCOME ============ */}
        <div className="center rise" style={{ textAlign: 'center' }}>
          <div className="eyebrow" style={{ fontSize: 'clamp(14px, 1.5vw, 18px)', letterSpacing: '0.22em' }}>Welcome to Together City</div>
          <h1 style={{ maxWidth: '22ch', margin: '0 auto', fontSize: 'clamp(34px, 5.2vw, 64px)', lineHeight: 1.1 }}>A personalized engine for every aspect of your life.</h1>
          <p className="lede" style={{ margin: '22px auto 0', fontSize: 'clamp(18px, 1.9vw, 23px)', lineHeight: 1.6, maxWidth: '58ch' }}>
            Set your preferences once, and every service in Together City is personalized just for you. No more random browsing.
          </p>
          <div style={{ marginTop: 30, display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
            {authed ? (
              /* A citizen who is signed in is already inside; the key is for a
                 desk, where the hero is a poster you look at rather than a
                 page you have walked into. */
              phone ? null : <Link className="btn btn-gold" to="/dashboard">Enter your city</Link>
            ) : (
              <>
                <Link className="btn btn-gold" to="/sign-up">Join the city</Link>
                <Link className="btn" to="/sign-in">Sign in</Link>
              </>
            )}
          </div>
          {/* The city is built for a phone; this is where it says so. */}
          <InstallCity />
        </div>

        <div className="rule" />

        {/* ============ CONTINUE WHERE YOU LEFT OFF ============ */}
        {!phone && <RecentPanel />}
      </div>

      {/* ============ WALK THE DISTRICTS — full-bleed hub heroes, stacked ============ */}
      <section aria-label="Walk the districts">
        <div className="district-head">
          {/* ONE DOOR PER RUN. "Your city today →" sat at the right-hand end of
              this line and went to the social feed, which is not a district —
              a second call to action, in the accent colour, competing with the
              thirteen photographs underneath it for the same thumb. The
              heading stays because it is the one label the run has. The feed
              keeps every other way in it already had. */}
          <div className="blk-head"><h2>Walk the districts</h2></div>
        </div>
        <div className="district-run">
          {DISTRICTS.map((p, panelIndex) => {
            const cfg = HUBS[p.key];
            const soon = cfg.items.length === 0;   // a hub with no inner pages is not yet a room
            const name = districtName(p.key);
            const tag = DISTRICT_COPY[p.key]?.line ?? cfg.name;
            // A room nobody can enter is not linked, only labelled. No district
            // is in that state today; the branch stays because the next one to
            // be built will pass through it before its pages exist.
            const to = soon ? null : (cfg.items[0]?.path ?? cfg.backPath);
            const inner = (
              <>
                <div className="hub-plate-art">
                  {/* A panel waiting on its photo is a lit stage, not a grey hole
                      (consumer review #4): the well is already there and the
                      picture fades onto it when it arrives. */}
                  <img className="no-case" src={img(p.img)} alt=""
                    loading={panelIndex < 2 ? 'eager' : 'lazy'} decoding="async"
                    style={{ opacity: 0, transition: 'opacity .5s ease' }}
                    onLoad={(e) => { e.currentTarget.style.opacity = '1'; }} />
                </div>
                <div className="hub-plate-foot">
                  <span className="hub-plate-icon" aria-hidden>
                    <Icon name={HUB_ICON[p.key] ?? 'product'} size={30} strokeWidth={2} />
                  </span>
                  <div className="hub-plate-said">
                    <h2>{name}</h2>
                    <p>{tag}</p>
                  </div>
                  <span className="hub-plate-cta">{soon ? 'Coming soon' : 'Explore'}</span>
                </div>
              </>
            );
            return to
              ? <Link key={p.key} to={to} className="hub-plate district-plate">{inner}</Link>
              : <div key={p.key} className="hub-plate district-plate is-soon">{inner}</div>;
          })}
        </div>
      </section>

      {/* THE CITY GRID, AT THE FOOT. It used to sit at the top of a phone,
          above the welcome — twelve doors before a word of introduction. It is
          the same twelve tiles and the same markup; only the place and the
          shape changed (six across, two down; see index.css). */}
      <div className="cityfallback">
        {FALLBACK.map((p) => (
          <Link key={p.to} to={p.to}><img loading="lazy" src={img(p.img)} alt="" /><span>{p.title}</span></Link>
        ))}
      </div>

      {/* On a phone the resume shelf sits here, at the end: 'continue where you
          left off' is the last thing you want offered, not the first thing in
          front of a city you have not looked at yet. */}
      {phone && <div className="wrap" style={{ maxWidth: 1240, margin: '0 auto', padding: '8px 20px 0' }}><RecentPanel /></div>}

      <div className="wrap" style={{ maxWidth: 1240, margin: '0 auto', padding: '48px 32px 24px' }}>
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
