import type { ReactNode } from 'react';

/** Poster lead heading used at the top of every entertainment sub-page. */
export function PosterLead({ eyebrow, title, sub }: { eyebrow: string; title: string; sub: string }) {
  return (
    <div className="poster-lead rise">
      <div className="eyebrow">{eyebrow}</div>
      <h1 style={{ fontSize: 'clamp(26px,3vw,38px)' }}>{title}</h1>
      <p className="sub">{sub}</p>
    </div>
  );
}

/** The reassurance strip at the foot of every page. */
export function TrustBar({ items }: { items: string[] }) {
  return (
    <div className="trust">
      {items.map((t) => <span key={t}>◈ {t}</span>)}
    </div>
  );
}

/**
 * The entertainment page frame.
 *
 * It used to set its own 1080px measure and its own 28/20/48 padding, which is
 * how six pages in one hub came to be 100px narrower than the rest of the
 * application and to start 4px further in. It is a plain wrapper now — `.page`
 * in the hub layout decides the measure, once, for every screen in the city.
 * The className passes through because the hub's own theme classes hang off it.
 */
export function EntPage({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={className}>{children}</div>;
}
