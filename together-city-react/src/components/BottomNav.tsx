import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useUnreadChatCount, useUnreadNotificationCount } from '@/api';
import { Icon, type IconName } from '@/components/ui/Icon';

/**
 * The phone's bottom bar: five doors that are always under your thumb.
 * Mobile-only (CSS hides it from 900px up), signed-in only.
 *
 * Home · Hubs · Chats · Alerts · Profile — the tab set the owner chose for
 * the mobile shell (4 Aug). Hubs replaced Search here because fourteen hubs
 * with no door was the bigger hole: the header tab row never fit a phone, so
 * on mobile most of the city was simply unreachable. Search stays one tap
 * away on the floating ⌕ pill and inside every hub sidebar.
 *
 * Chats and Alerts carry live unread counts — a bottom bar that cannot say
 * "something is waiting" makes the citizen poll their own app.
 */
// `path:` (not `to:`) so nav-audit's reference scanner counts these — the
// bottom bar IS how a citizen reaches /hubs and /alerts.
const TABS: Array<{ path: string; label: string; icon: IconName }> = [
  { path: '/dashboard', label: 'Home', icon: 'sparkles' },
  { path: '/hubs', label: 'Hubs', icon: 'place' },
  { path: '/chats', label: 'Chats', icon: 'comment' },
  { path: '/alerts', label: 'Alerts', icon: 'bell' },
  { path: '/profile', label: 'Profile', icon: 'user' },
];

function TabBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span aria-hidden style={{
      position: 'absolute', top: 3, right: 'calc(50% - 21px)', minWidth: 15, height: 15, padding: '0 4px',
      borderRadius: 'var(--r-full)', background: 'var(--danger-ink)', color: 'var(--on-accent)', fontSize: 9.5, fontWeight: 700,
      display: 'grid', placeItems: 'center', lineHeight: 1,
    }}>{count > 9 ? '9+' : count}</span>
  );
}

export function BottomNav() {
  const { user } = useAuth();
  const location = useLocation();
  const unreadChats = useUnreadChatCount(); // already a number
  const unreadAlerts = useUnreadNotificationCount();
  // The immersive full-screen surfaces keep the whole viewport.
  const hidden = /^\/(sign-in|sign-up|reels|calls?)(\/|$)/.test(location.pathname) || location.pathname === '/';
  if (!user || hidden) return null;

  const badgeFor = (path: string): number => {
    if (path === '/chats') return unreadChats;
    if (path === '/alerts') return unreadAlerts.data ?? 0;
    return 0;
  };
  const labelFor = (t: { path: string; label: string }): string => {
    const n = badgeFor(t.path);
    return n > 0 ? `${t.label}, ${n} unread` : t.label;
  };

  // GEOMETRY ONLY — `.tc-bottomnav a` in relief.css owns the material.
  const item: React.CSSProperties = {
    flex: 1, minHeight: 48, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    gap: 2, textDecoration: 'none', fontFamily: 'inherit', cursor: 'pointer', position: 'relative',
  };

  return (
    <nav className="tc-bottomnav" aria-label="Quick navigation">
      {TABS.map((t) => (
        <NavLink key={t.path} to={t.path} style={item} aria-label={labelFor(t)}
          className={({ isActive }) => (isActive ? 'on' : undefined)}>
          <Icon name={t.icon} size={19} />{t.label}
          <TabBadge count={badgeFor(t.path)} />
        </NavLink>
      ))}
    </nav>
  );
}
