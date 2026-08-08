import { Link } from 'react-router-dom';
import type { HubConfig } from '@/config/hubs';

/**
 * THE MEDICAL HUB'S FRONT DOOR: amber air, white steam, smoked glass.
 *
 * The steam is DRAWN, not photographed. The reference is a studio photograph
 * of a plume, and a photograph is one crop that is correct at exactly one
 * viewport — this hub is opened on phones and ultrawides in the same hour.
 * feTurbulence displacing a soft radial blob gives real cloud edges, wispy
 * and self-similar at every scale, for zero bytes on the wire. Three plumes
 * at three scales, because one is a smudge.
 *
 * THE PLUME BILLOWS PAST THE PANEL, not squarely behind its headline. The
 * measured finding that shaped this whole look: clear glass over white steam
 * is 1.23:1, the same glass beside the steam is 6.1:1 — so the composition
 * keeps the bright core high and spilling left of the glass, and the smoked
 * pane (tokens.css) handles whatever still drifts through.
 *
 * The drift is SMIL rather than CSS on purpose. It is scenery — a property
 * of the drawing, like the tilt of a passport stamp — not interface motion,
 * and the motion ceiling governs the interface. It is rendered only when the
 * citizen has not asked for reduced motion, because SMIL does not listen to
 * that preference by itself.
 */
const still = typeof window !== 'undefined'
  && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function Drift({ dur, back }: { dur: string; back?: boolean }) {
  if (still) return null;
  return (
    <animateTransform attributeName="transform" type="translate" additive="sum"
      values={back ? '0 0; 22 -14; 0 0' : '0 0; -26 -16; 0 0'}
      dur={dur} repeatCount="indefinite" />
  );
}

function Steam() {
  return (
    <div className="masteam" aria-hidden="true">
      <svg viewBox="0 0 1400 900" preserveAspectRatio="xMidYMid slice">
        <defs>
          {/* Displacement, then a LITTLE blur — in that order and no more. At
              scale ~235 the blob is displaced further than its own radius,
              which does not make a cloud billow, it dissolves it into
              unrelated smudges. The billow lives at about a fifth of the
              radius; the octaves supply the wisps. */}
          <filter id="maf1" x="-45%" y="-45%" width="190%" height="190%">
            <feTurbulence type="fractalNoise" baseFrequency="0.0085 0.013" numOctaves="6" seed="7" result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale="92" xChannelSelector="R" yChannelSelector="G" />
            <feGaussianBlur stdDeviation="3.5" />
          </filter>
          <filter id="maf2" x="-45%" y="-45%" width="190%" height="190%">
            <feTurbulence type="fractalNoise" baseFrequency="0.016 0.021" numOctaves="5" seed="23" result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale="64" xChannelSelector="R" yChannelSelector="G" />
            <feGaussianBlur stdDeviation="3" />
          </filter>
          <filter id="maf3" x="-50%" y="-50%" width="200%" height="200%">
            <feTurbulence type="fractalNoise" baseFrequency="0.024" numOctaves="5" seed="41" result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale="52" xChannelSelector="R" yChannelSelector="G" />
            <feGaussianBlur stdDeviation="4" />
          </filter>
          {/* currentColor, not a hex: the steam's white is set by .masteam in
              relief.css, where an achromatic literal is allowed to live. */}
          <radialGradient id="maga">
            <stop offset="0%" stopColor="currentColor" stopOpacity=".95" />
            <stop offset="55%" stopColor="currentColor" stopOpacity=".55" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="magb">
            <stop offset="0%" stopColor="currentColor" stopOpacity=".58" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </radialGradient>
        </defs>
        <g filter="url(#maf1)" opacity=".95">
          <Drift dur="34s" />
          <ellipse cx="560" cy="290" rx="250" ry="185" fill="url(#maga)" />
          <ellipse cx="390" cy="370" rx="185" ry="140" fill="url(#maga)" />
          <ellipse cx="800" cy="240" rx="165" ry="130" fill="url(#maga)" />
          <ellipse cx="950" cy="335" rx="130" ry="105" fill="url(#magb)" />
        </g>
        <g filter="url(#maf2)" opacity=".62">
          <Drift dur="46s" back />
          <ellipse cx="250" cy="290" rx="165" ry="80" fill="url(#magb)" />
          <ellipse cx="120" cy="252" rx="115" ry="58" fill="url(#magb)" />
          <ellipse cx="1200" cy="205" rx="140" ry="72" fill="url(#magb)" />
        </g>
        <g filter="url(#maf3)" opacity=".5">
          <ellipse cx="1140" cy="600" rx="175" ry="100" fill="url(#magb)" />
          <ellipse cx="300" cy="650" rx="150" ry="82" fill="url(#magb)" />
        </g>
      </svg>
    </div>
  );
}

/** The landing itself: one glass hero, then the hub's sections as glass
 *  chips. Everything on it is a GLANCE — the reading happens inside, on
 *  paper. Data-driven from the same HubConfig every other landing uses. */
export function AtmosphereLanding({ cfg, to }: { cfg: HubConfig; to: string }) {
  return (
    <section className="mafield">
      <Steam />
      <div className="mashell">
        <div className="mapane mahero">
          <p className="maeyebrow">Together City</p>
          <h1>{cfg.name}</h1>
          <p className="malede">{cfg.tag}</p>
          <Link to={to} className="macta">Explore now<span aria-hidden> →</span></Link>
        </div>
        <nav className="masections" aria-label={`${cfg.name} sections`}>
          {cfg.items.map((it) => <Link key={it.path} to={it.path}>{it.label}</Link>)}
        </nav>
      </div>
    </section>
  );
}
