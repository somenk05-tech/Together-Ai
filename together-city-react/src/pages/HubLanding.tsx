import { Link } from 'react-router-dom';
import type { HubKey } from '@/types';
import { HUBS } from '@/config/hubs';
import { useHubTheme } from '@/hooks/useHubTheme';
import { Button } from '@/components/ui';

/**
 * Hub → hero image, matching the vanilla website's hub landings 1:1
 * (assets/img filenames taken from the original *.html hub pages).
 */
const HUB_HERO: Partial<Record<HubKey, string>> = {
  travel: 'travel-hub.webp',
  restaurants: 'resturants.webp',
  nutrition: 'nutrition-and-groceies.webp',
  entertainment: 'entertainment.webp',
  social: 'social-life.webp',
  dating: 'dating-hub.webp',
  realestate: 'real-estate.webp',
  jobs: 'jobs-hub.webp',
  medical: 'medical-hub.webp',
  financial: 'financial-district.webp',
  beauty: 'beautymarket.webp',
  fitness: 'fitness-hero.webp',
};

/**
 * One component that renders every hub's landing page from config — the vanilla
 * site had 12 near-identical hub homepages; here it's a single data-driven page.
 */
export function HubLanding({ hub }: { hub: HubKey }) {
  useHubTheme(hub);
  const cfg = HUBS[hub];
  const firstInner = cfg.items[0]?.path ?? cfg.backPath;
  const heroSrc = `/assets/img/${HUB_HERO[hub] ?? `${hub}.webp`}`;
  return (
    <div className="gateway-lite" style={{ position: 'relative', minHeight: 'calc(100vh - var(--header-h))', display: 'flex', alignItems: 'flex-end', color: '#fff', overflow: 'hidden' }}>
      <img className="bg" src={heroSrc} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top,rgba(8,9,8,.82),rgba(8,9,8,.2))' }} />
      <div style={{ position: 'relative', zIndex: 2, padding: '0 64px 72px', maxWidth: 900 }}>
        <div className="eyebrow" style={{ color: 'var(--gold-bright)' }}>{cfg.name}</div>
        <h1 style={{ color: '#fff', fontSize: 'clamp(30px,4vw,52px)', maxWidth: '16ch', textShadow: '0 2px 24px rgba(0,0,0,.45)' }}>{cfg.tag}</h1>
        <div style={{ marginTop: 28 }}>
          <Link to={firstInner}><Button variant="gold">Explore now</Button></Link>
        </div>
      </div>
    </div>
  );
}
