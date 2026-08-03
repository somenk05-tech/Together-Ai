import { Link } from 'react-router-dom';
import { Button } from '@/components/ui';

/**
 * Cars Hub — teaser / coming-soon landing. Reachable from the Cars building on
 * the city map and from /cars. Pure teaser: no data, no auth, matching the
 * gateway-lite look of the other hub landings.
 */
export function CarsComingSoon() {
  return (
    <div className="gateway-lite" style={{ position: 'relative', minHeight: 'calc(100vh - var(--header-h))', display: 'flex', alignItems: 'flex-end', color: 'var(--on-accent)', overflow: 'hidden' }}>
      <img className="bg" src="/assets/img/cars-hub.webp" alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top,rgba(8,9,8,.86),rgba(8,9,8,.25))' }} />
      <div style={{ position: 'relative', zIndex: 2, padding: '0 64px 72px', maxWidth: 900 }}>
        <div className="eyebrow" style={{ color: 'var(--gold-bright)' }}>Cars Hub</div>
        <span style={{ display: 'inline-block', margin: '2px 0 14px', padding: '5px 14px', borderRadius: 999, border: '1px solid rgba(255,255,255,.35)', background: 'rgba(255,255,255,.08)', fontSize: 12, fontWeight: 700, letterSpacing: '.16em', textTransform: 'uppercase' }}>Coming Soon</span>
        <h1 style={{ color: 'var(--on-accent)', fontSize: 'clamp(30px,4vw,52px)', maxWidth: '16ch', textShadow: '0 2px 24px rgba(0,0,0,.45)' }}>Drive the future.</h1>
        <p style={{ maxWidth: '48ch', fontSize: 'clamp(15px,1.4vw,18px)', color: 'rgba(255,255,255,.82)', marginTop: 10 }}>
          New &amp; used cars, EVs, servicing, car loans and insurance — all in one place. We&rsquo;re building it now.
        </p>
        <div style={{ marginTop: 28 }}>
          <Link to="/"><Button variant="gold">Back to the city</Button></Link>
        </div>
      </div>
    </div>
  );
}
