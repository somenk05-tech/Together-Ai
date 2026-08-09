import { Link } from 'react-router-dom';
import type { HubConfig } from '@/config/hubs';

/**
 * THE MEDICAL HUB'S FRONT DOOR: gradient as environment.
 *
 * A cool out-of-focus field — blue into silver with one warm ember at the
 * corner — and a light frosted sheet carrying the city's dark ink. The steam
 * of the amber era is gone with the amber: this reference's atmosphere is
 * the gradient itself, drawn by the CSS field in tokens.css, so the landing
 * is nothing but the field, one sheet, and the hub's sections as chips.
 * Data-driven from the same HubConfig every other landing uses.
 */
export function AtmosphereLanding({ cfg, to }: { cfg: HubConfig; to: string }) {
  return (
    <section className="mafield">
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
