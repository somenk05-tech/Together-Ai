import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

/** Base path for the travel image set that ships in /public. */
export const IMG = '/assets/img/travel-hub-sub-pages--just-images--';

export function TravelHero({ eyebrow, title, sub, bg, minHeight = 260, children }: {
  eyebrow: string; title: string; sub: string; bg: string; minHeight?: number; children?: ReactNode;
}) {
  return (
    <div className="hero rise" style={{ minHeight }}>
      <img className="bg" src={bg} alt="" />
      <div className="inner">
        <div className="eyebrow">{eyebrow}</div>
        <h1 style={{ fontSize: 'clamp(28px,3vw,44px)' }}>{title}</h1>
        <p className="sub">{sub}</p>
        {children}
      </div>
    </div>
  );
}

export function TrustBar({ items }: { items: string[] }) {
  return <div className="trust">{items.map((t) => <span key={t}>◈ {t}</span>)}</div>;
}


/** Full-width tab row used by Insurance / Visa / Bookings. */
export function TabRow({ tabs, initial = 0, onChange }: { tabs: string[]; initial?: number; onChange?: (i: number) => void }) {
  const [on, setOn] = useState(initial);
  return (
    <div className="tabrow rise d1">
      {tabs.map((t, i) => (
        <a key={t} href="#" className={i === on ? 'on' : undefined}
          onClick={(e) => { e.preventDefault(); setOn(i); onChange?.(i); }}>{t}</a>
      ))}
    </div>
  );
}



export function PCard({ to, img, title, meta, price, heart }: {
  to: string; img: string; title: string; meta?: ReactNode; price?: ReactNode; heart?: boolean;
}) {
  return (
    <Link className="pcard" to={to}>
      <div className="ph"><img loading="lazy" decoding="async" src={img} alt={title} />{heart && <span className="heart">♥</span>}</div>
      <div className="pb"><h4>{title}</h4>{meta && <p className="meta">{meta}</p>}{price && <p className="price">{price}</p>}</div>
    </Link>
  );
}
