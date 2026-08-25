import { Link } from 'react-router-dom';
import { NAV, HUBS } from '@/config/hubs';
import { useCityDesign } from '@/hooks/useCityDesign';
import type { HubKey } from '@/types';
import { tabIcon } from '@/nav/registry';
import { HUB_HERO } from '@/pages/HubLanding';
import { Icon } from '@/components/ui/Icon';

/**
 * The City — every hub as a door, sized for a thumb.
 *
 * This is the mobile bottom bar's second tab. On a phone the hubs cannot live
 * in a header tab row (they didn't fit; they scrolled off the right edge), so
 * this page is where the whole city becomes visible at once: each hub with its
 * own commissioned picture and its own line, in the order the header has
 * always used. Nothing here is new inventory — same NAV list, same HUB_HERO
 * art, same taglines from config — just laid out for touch.
 *
 * MAIL IS NOT A HUB, AND THIS WAS THE LAST PLACE STILL SAYING IT WAS.
 * The header tab row has always filtered it out — Mail is an ACTION, it sits
 * with Chat and Alerts in the corner because it is a place you check, not a
 * district you visit. This grid mapped straight over NAV and so it put Mail
 * back among the doors, where it had no commissioned art of its own and
 * borrowed a picture that belongs to another room. Same filter as the header,
 * for the same reason: two surfaces disagreeing about what Mail IS is worse
 * than either answer.
 *
 * It works on desktop too (it is reachable, not adapted): the grid simply
 * gets more columns.
 */
/**
 * Not every tab in NAV is a district. Mail is an ACTION (it sits with Chat and
 * Alerts in the corner), and Personal is a DRAWER — the citizen's own thoughts,
 * calendar, drive and album. Neither has commissioned art, and neither is a
 * place you *visit*; both belong with the people layer below. Filtering them
 * out here keeps this grid agreeing with the header about what a hub IS.
 */
const NOT_A_DOOR = new Set<string>(['mail', 'personal']);

export function Hubs() {
  // DESIGN YOUR SERVICES: the grid shows the citizen's city, and says so out
  // loud when that is fewer doors than the whole one — a count that reads as
  // "13 hubs" with no explanation is a screen asserting an absence it never
  // established. The line below is that explanation, and the way back.
  const { hubOn, offCount } = useCityDesign();
  return (
    <div className="page">
      <div className="eyebrow">Together City</div>
      <h1 style={{ fontSize: 26, margin: '0 0 4px' }}>The city</h1>
      <p className="muted" style={{ fontSize: 13.5, marginBottom: 18 }}>Every hub, one screen. Tap a door.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
        {NAV.filter((n) => !NOT_A_DOOR.has(n.key)).filter((n) => hubOn(n.key)).map((n, i) => {
          const cfg = HUBS[n.key as HubKey];
          const hero = HUB_HERO[n.key as HubKey];
          /* THE FIRST ROW IS NOT LAZY, BECAUSE IT IS NOT BELOW THE FOLD.
             Every one of these thirteen was `loading="lazy"` and every one of
             them is visible the moment the page opens. Lazy loading defers what
             the reader cannot see; pointed at what they CAN see it does the
             opposite of its job — it takes the image out of the preload scanner
             and puts it behind everything else in the queue. Measured on the
             live page: the document was ready in 97ms and the city took over
             three seconds to appear, thirteen black rectangles until it did.
             Home.tsx has done this correctly since it was written (`panelIndex
             < 2 ? 'eager' : 'lazy'`); this page simply never copied it. */
          const above = i < 6;
          return (
            /* THE DOOR WEARS ITS ROOM'S ACCENT. `data-hub` on the card scopes
               the same four tokens the room itself re-points (foot of
               tokens.css), so the icon beside each name takes that room's
               colour — on the one screen that shows every room at once, the
               wayfinding finally does some work. No colour is written here;
               the attribute selects the block that already owns it. */
            <Link key={n.key} to={n.path} data-hub={n.key} className="card lift" style={{ padding: 0, overflow: 'hidden', display: 'block' }}>
              <div style={{ aspectRatio: '16 / 10', background: 'var(--media-bg)', position: 'relative' }}>
                {hero
                  /* AND IT IS THE TILE, NOT THE HERO. These files are 1,915px
                     wide because they are also the full-bleed plate on each
                     hub's own landing, where that is the right size. Here they
                     are drawn at about 145. The `-tile` variant is 448px with
                     the card's own 16:10 crop already baked in, so it carries
                     no pixels this card will never show: 2,075 KB of hero art
                     becomes about 296 KB of tile. The plate is untouched. */
                  ? <img className="no-case" src={`/assets/img/${hero.replace(/\.webp$/, '-tile.webp')}`}
                      alt="" width={448} height={280} decoding="async"
                      loading={above ? 'eager' : 'lazy'} fetchPriority={above ? 'high' : undefined}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  : (
                    <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--muted)' }}>
                      <Icon name={tabIcon(n.key)} size={28} />
                    </div>
                  )}
              </div>
              <div style={{ padding: '10px 12px 12px', display: 'flex', gap: 9, alignItems: 'center' }}>
                <span aria-hidden style={{ color: 'var(--accent-ink)', display: 'grid', placeItems: 'center' }}>
                  <Icon name={tabIcon(n.key)} size={17} />
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

      {offCount > 0 && (
        <p className="muted" style={{ fontSize: 12, margin: '12px 0 0', lineHeight: 1.55 }}>
          {offCount === 1 ? 'One hub is' : `${offCount} hubs are`} switched off — hidden, not
          gone. Turn {offCount === 1 ? 'it' : 'them'} back on in{' '}
          <Link to="/profile" style={{ fontWeight: 700 }}>Design your services</Link>.
        </p>
      )}

      {/* The people layer — not hubs, but the doors a citizen reaches for daily. */}
      <div className="eyebrow" style={{ margin: '26px 0 10px' }}>Your city, your people</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
        {[
          { to: '/personal', label: 'Personal', sub: 'Thoughts, album & more', icon: 'personal' as const },
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
