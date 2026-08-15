import { Link } from 'react-router-dom';
import { Icon, type IconName } from '@/components/ui/Icon';

/**
 * PERSONAL — THE CITIZEN'S OWN DRAWER.
 *
 * Four rooms that are nobody else's business: the journal, the calendar, the
 * documents, the album. The owner asked for the tab (15 Aug) and named its
 * contents; three of the four already existed and were listed NOWHERE — you
 * could reach Calendar and Drive only by knowing their URLs or by luck in the
 * command palette, and Thoughts was boarding in the Social Life rail for want
 * of anywhere else to sleep.
 *
 * IT IS NOT A HUB, AND THAT IS THE DESIGN. A hub is a district: a photograph,
 * a billboard line, a consent gate, a rail of rooms with a shared subject.
 * This is a drawer — the pages inside it are city-level pages that belong to
 * the person rather than to a part of the city, and they keep their own
 * full-width chrome exactly as they had it. So there is no HubLayout here, no
 * hero art commissioned from a place that does not exist, and no `HubKey`
 * entry: the tab is a `TabKey`, which is a smaller idea (see config/hubs.ts).
 *
 * The plate at the top is the citizen card — the city's own object rather
 * than a photograph of somewhere, which is the honest picture for the one
 * screen in Together City that is about you and not about the city.
 */

interface Room { to: string; icon: IconName; label: string; line: string }

const ROOMS: Room[] = [
  { to: '/thoughts', icon: 'journal', label: 'Thoughts', line: 'Your private journal — nobody sees this but you.' },
  { to: '/calendar', icon: 'calendar', label: 'Calendar', line: 'Everything the city has you down for, in one week.' },
  { to: '/drive', icon: 'doc', label: 'Drive', line: 'Your documents, kept where you can find them again.' },
  { to: '/personal/album', icon: 'image', label: 'Album', line: 'Every photo and video you have posted to the city.' },
];

export function PersonalHome() {
  return (
    <div className="page">
      <div className="sl-head rise">
        <div className="sl-head-t">
          <div className="eyebrow">Together City · Personal</div>
          <h1>Yours, and only yours</h1>
          <p>Your journal, your week, your documents and your pictures — the part of the city that belongs to you.</p>
        </div>
      </div>

      {/* The citizen card, the city's own object. `no-case` keeps the image out
          of the framed-photograph treatment: this is a card, not a view. */}
      <div className="card rise" style={{ overflow: 'hidden', padding: 0, marginBottom: 18 }}>
        <img className="no-case" src="/assets/img/citizen-card.webp" alt=""
          style={{ display: 'block', width: '100%', height: 'auto' }} />
      </div>

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
        {ROOMS.map((r) => (
          <Link key={r.to} to={r.to} className="card rise"
            style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '16px 18px',
              minHeight: 44, textDecoration: 'none', color: 'var(--ink)' }}>
            <span aria-hidden style={{ flex: 'none', display: 'grid', placeItems: 'center', width: 38, height: 38,
              borderRadius: 'var(--r-full)', background: 'var(--wash)', color: 'var(--ink)' }}>
              <Icon name={r.icon} size={17} />
            </span>
            <span style={{ minWidth: 0 }}>
              <b style={{ display: 'block', fontSize: 15 }}>{r.label}</b>
              <span className="muted" style={{ display: 'block', fontSize: 12.5, lineHeight: 1.5, marginTop: 2 }}>{r.line}</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
