import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Icon, type IconName } from '@/components/ui/Icon';

/**
 * The phone's bottom bar (consumer review #17's other half): five doors that
 * are always under your thumb. Mobile-only (CSS hides it from 900px up),
 * signed-in only — a visitor's doors are Sign in / Join in the header.
 * The search entry opens the command palette rather than navigating.
 */
const TABS: Array<{ to: string; label: string; icon: IconName }> = [
  { to: '/dashboard', label: 'City', icon: 'sparkles' },
  { to: '/connections', label: 'People', icon: 'connection' },
  { to: '/chats', label: 'Chats', icon: 'comment' },
  { to: '/profile', label: 'Profile', icon: 'user' },
];

export function BottomNav() {
  const { user } = useAuth();
  const location = useLocation();
  // The immersive full-screen surfaces keep the whole viewport.
  const hidden = /^\/(sign-in|sign-up|reels|calls?)(\/|$)/.test(location.pathname) || location.pathname === '/';
  if (!user || hidden) return null;

  const item: React.CSSProperties = {
    flex: 1, minHeight: 48, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    gap: 2, fontSize: 10.5, fontWeight: 600, letterSpacing: '.04em', color: 'var(--muted)', textDecoration: 'none',
    background: 'transparent', border: 'none', fontFamily: 'inherit', cursor: 'pointer',
  };

  return (
    <nav className="tc-bottomnav" aria-label="Quick navigation">
      {TABS.slice(0, 2).map((t) => (
        <NavLink key={t.to} to={t.to} style={item} className={({ isActive }) => (isActive ? 'on' : undefined)}>
          <Icon name={t.icon} size={19} />{t.label}
        </NavLink>
      ))}
      <button type="button" style={item} aria-label="Search the city" onClick={() => window.dispatchEvent(new Event('tc:command'))}>
        <span aria-hidden style={{ fontSize: 19, lineHeight: '19px' }}>⌕</span>Search
      </button>
      {TABS.slice(2).map((t) => (
        <NavLink key={t.to} to={t.to} style={item} className={({ isActive }) => (isActive ? 'on' : undefined)}>
          <Icon name={t.icon} size={19} />{t.label}
        </NavLink>
      ))}
    </nav>
  );
}
