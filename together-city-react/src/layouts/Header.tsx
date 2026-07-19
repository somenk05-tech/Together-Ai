import { NavLink, Link } from 'react-router-dom';
import { NAV } from '@/config/hubs';
import { useUiStore } from '@/store/ui.store';
import { useAuth } from '@/hooks/useAuth';
import { useIncomingRequestCount, useUnreadChatCount } from '@/api';

/** Small red count bubble for pending connection requests. */
function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span aria-label={`${count} pending requests`} style={{
      position: 'absolute', top: -6, right: -8, minWidth: 16, height: 16, padding: '0 4px',
      borderRadius: 999, background: '#e0342b', color: '#fff', fontSize: 10, fontWeight: 700,
      display: 'grid', placeItems: 'center', lineHeight: 1,
    }}>{count > 9 ? '9+' : count}</span>
  );
}

/** Global header — 12 hub tabs + Requests/Mail/Chat/Profile actions, ported from tc.js buildHeader(). */
export function Header() {
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const { user } = useAuth();
  const requests = useIncomingRequestCount();
  const unreadChats = useUnreadChatCount();
  const firstName = (user?.name ?? '').trim().split(' ')[0] || 'Profile';
  const tabs = NAV.filter((n) => n.key !== 'mail'); // Mail lives in the actions, not the tab row
  return (
    <header className="tc-header">
      <button className="tc-burger" aria-label="Open menu" onClick={() => toggleSidebar()}>☰</button>
      <Link to="/" className="tc-logo">
        <span className="mark"><img src="/assets/img/tc-logo.png" alt="Together City" width={34} height={34} /></span>
        <span className="word">TOGETHER CITY</span>
      </Link>
      <nav className="tc-nav" aria-label="Hubs">
        {tabs.map((n) => (
          <NavLink key={n.key} to={n.path} className={({ isActive }) => (isActive ? 'on' : undefined)}>
            {n.label}
          </NavLink>
        ))}
      </nav>
      <div className="tc-actions">
        <Link to="/connections" aria-label="Requests" style={{ position: 'relative' }}>
          <span aria-hidden>🤝</span> <span className="lab">PEOPLE</span>
          <Badge count={requests} />
        </Link>
        <Link to="/calendar" aria-label="Calendar"><span aria-hidden>🗓</span> <span className="lab">CALENDAR</span></Link>
        <Link to="/mail/inbox" aria-label="Mail"><span aria-hidden>✉</span> <span className="lab">MAIL</span></Link>
        <Link to="/chats" aria-label="Chat" style={{ position: 'relative' }}>
          <span aria-hidden>💬</span> <span className="lab">CHAT</span>
          <Badge count={unreadChats} />
        </Link>
        <Link to="/profile" aria-label="Profile"><span aria-hidden>👤</span> <span className="lab">{firstName}</span></Link>
      </div>
    </header>
  );
}
