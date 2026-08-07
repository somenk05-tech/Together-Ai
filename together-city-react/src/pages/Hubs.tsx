import { Link } from 'react-router-dom';
import { NAV, HUBS } from '@/config/hubs';
import { HUB_ICON } from '@/nav/registry';
import { HUB_HERO } from '@/pages/HubLanding';
import { Icon } from '@/components/ui/Icon';

/**
 * The City — every hub as a door, sized for a thumb.
 *
 * This is the mobile bottom bar's second tab. On a phone the fourteen hubs
 * cannot live in a header tab row (they didn't fit; they scrolled off the
 * right edge), so this page is where the whole city becomes visible at once:
 * each hub with its own commissioned picture and its own line, in the order
 * the header has always used. Nothing here is new inventory — same NAV list,
 * same HUB_HERO art, same taglines from config — just laid out for touch.
 *
 * It works on desktop too (it is reachable, not adapted): the grid simply
 * gets more columns.
 */
export function Hubs() {
  return (
    <div className="page">
      <div className="eyebrow">Together City</div>
      <h1 style={{ fontSize: 26, margin: '0 0 4px' }}>The city</h1>
      <p className="muted" style={{ fontSize: 13.5, marginBottom: 18 }}>Every hub, one screen. Tap a door.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
        {NAV.map((n) => {
          const cfg = HUBS[n.key];
          const hero = HUB_HERO[n.key];
          return (
            <Link key={n.key} to={n.path} className="card lift" style={{ padding: 0, overflow: 'hidden', display: 'block' }}>
              <div style={{ aspectRatio: '16 / 10', background: 'var(--media-bg)', position: 'relative' }}>
                {hero
                  ? <img className="no-case" src={`/assets/img/${hero}`} alt="" loading="lazy"
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  : (
                    <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--muted)' }}>
                      <Icon name={HUB_ICON[n.key] ?? 'place'} size={28} />
                    </div>
                  )}
              </div>
              <div style={{ padding: '10px 12px 12px', display: 'flex', gap: 9, alignItems: 'center' }}>
                <span aria-hidden style={{ color: 'var(--accent-ink)', display: 'grid', placeItems: 'center' }}>
                  <Icon name={HUB_ICON[n.key] ?? 'place'} size={17} />
                </span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontWeight: 700, fontSize: 14, lineHeight: 1.2 }}>{n.label}</span>
                  {cfg?.tag && (
                    <span className="muted" style={{ display: 'block', fontSize: 11, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {cfg.tag}
                    </span>
                  )}
                </span>
              </div>
            </Link>
          );
        })}
      </div>

      {/* The people layer — not hubs, but the doors a citizen reaches for daily. */}
      <div className="eyebrow" style={{ margin: '26px 0 10px' }}>Your city, your people</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
        {[
          { to: '/connections', label: 'People', sub: 'Friends & requests', icon: 'people' as const },
          { to: '/mail', label: 'Mail', sub: 'Your city inbox', icon: 'mention' as const },
          { to: '/calendar', label: 'Calendar', sub: 'Everything booked', icon: 'star' as const },
          { to: '/drive', label: 'Drive', sub: 'Your documents', icon: 'share' as const },
        ].map((d) => (
          <Link key={d.to} to={d.to} className="card lift" style={{ display: 'flex', gap: 10, alignItems: 'center', minHeight: 64 }}>
            <span aria-hidden style={{ color: 'var(--accent-ink)' }}><Icon name={d.icon} size={20} /></span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontWeight: 700, fontSize: 14 }}>{d.label}</span>
              <span className="muted" style={{ display: 'block', fontSize: 11.5 }}>{d.sub}</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
