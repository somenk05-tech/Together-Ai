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

/** Standard entertainment page frame: centered column, matching the static `.main` width. */
export function EntPage({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={className} style={{ maxWidth: 1080, margin: '0 auto', padding: '28px 20px 48px' }}>
      {children}
    </div>
  );
}
