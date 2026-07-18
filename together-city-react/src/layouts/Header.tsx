import { NavLink, Link } from 'react-router-dom';
import { NAV } from '@/config/hubs';
import { useUiStore } from '@/store/ui.store';
import { useAuth } from '@/hooks/useAuth';

/** Global header — 12 hub tabs + Mail/Chat/Profile actions, ported from tc.js buildHeader(). */
export function Header() {
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const { user } = useAuth();
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
        <Link to="/mail/inbox" aria-label="Mail"><span aria-hidden>✉</span> <span className="lab">MAIL</span></Link>
        <Link to="/chats" aria-label="Chat"><span aria-hidden>💬</span> <span className="lab">CHAT</span></Link>
        <Link to="/profile" aria-label="Profile"><span aria-hidden>👤</span> <span className="lab">{firstName}</span></Link>
      </div>
    </header>
  );
}
