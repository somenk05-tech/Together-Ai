import type { ReactNode } from 'react';

export interface HeroProps { image: string; eyebrow?: string; title: string; sub?: string; children?: ReactNode; objectPosition?: string; }

/** Ported .hero banner (image + gradient + overlay content). */
export function Hero({ image, eyebrow, title, sub, children, objectPosition }: HeroProps) {
  return (
    <div className="hero" style={{ marginBottom: 28 }}>
      <img className="bg" src={image} alt="" style={objectPosition ? { objectPosition } : undefined} />
      <div className="inner">
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1 style={{ fontSize: 'clamp(26px,3vw,42px)' }}>{title}</h1>
        {sub && <p className="sub">{sub}</p>}
        {children && <div style={{ marginTop: 24, display: 'flex', gap: 14, flexWrap: 'wrap' }}>{children}</div>}
      </div>
    </div>
  );
}
