import { Link } from 'react-router-dom';
import { useAuthStore } from '@/store/auth.store';
import { useRecentStore } from '@/store/recent.store';
import { DESTINATIONS } from '@/nav/registry';
import { Icon, type IconName } from '@/components/ui/Icon';

function iconFor(path: string): IconName {
  return DESTINATIONS.find((d) => d.path === path)?.icon ?? 'clock';
}

/**
 * "Continue where you left off" + Recently Viewed (audit 3.3). Gives the city
 * home a memory: one prominent resume card for the last place you were, and a
 * row of recent pages, so the super-app feels continuous across sessions.
 */
export function RecentPanel() {
  const items = useRecentStore((s) => s.items);
  // The homepage is public; the trail is one citizen's private movements.
  // Render it only to the signed-in citizen who made it (consumer review #3:
  // a shared machine showed the last user's "Connect with Blood Test").
  const authed = useAuthStore((s) => Boolean(s.tokens?.accessToken && s.user));
  if (!authed || !items.length) return null;

  const [top, ...rest] = items;
  const others = rest.slice(0, 5);

  return (
    <section className="blk" aria-label="Recently viewed">
      <div className="blk-head"><h2>Continue where you left off</h2></div>

      <Link to={top.path} className="card" style={{ display: 'flex', alignItems: 'center', gap: 14, textDecoration: 'none', color: 'inherit', padding: '16px 18px', marginBottom: others.length ? 14 : 0 }}>
        <span style={{ width: 42, height: 42, borderRadius: 11, background: 'var(--accent-soft)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <Icon name={iconFor(top.path)} size={20} style={{ color: 'var(--accent-ink)' }} />
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span className="muted" style={{ display: 'block', fontSize: 11.5, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase' }}>Resume</span>
          <span style={{ display: 'block', fontSize: 16, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{top.label}</span>
        </span>
        <span aria-hidden style={{ color: 'var(--accent-ink)', fontWeight: 700, fontSize: 20 }}>→</span>
      </Link>

      {others.length > 0 && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {others.map((r) => (
            <Link key={r.path} to={r.path}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, textDecoration: 'none', color: 'inherit',
                border: '1px solid var(--line)', borderRadius: 'var(--r-full)', padding: '7px 13px', fontSize: 13, fontWeight: 600, background: 'var(--card)' }}>
              <Icon name={iconFor(r.path)} size={14} style={{ color: 'var(--accent-ink)' }} />
              {r.label}
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
