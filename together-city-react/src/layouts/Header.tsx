import { useEffect, useRef, useState } from 'react';
import { firstName as fromName } from '@/lib/salutation';
import { NavLink, Link, useNavigate } from 'react-router-dom';
import { NAV } from '@/config/hubs';
import { useUiStore } from '@/store/ui.store';
import { useAuth } from '@/hooks/useAuth';
import {
  useUnreadNotificationCount, useNotifications, useMarkNotificationRead, useMarkAllNotificationsRead,
} from '@/api';
import { Icon, type IconName } from '@/components/ui/Icon';
import { CommandPalette } from '@/components/CommandPalette';
import { FloatingSearch } from '@/components/FloatingSearch';
import { QuickActions } from './QuickActions';
import { useTrackRecent } from '@/hooks/useTrackRecent';

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

const ICON_FOR: Record<string, IconName> = {
  like: 'heart', comment: 'comment', follow: 'follow', connection_request: 'connection',
  connection_accepted: 'accepted', post_live: 'sparkles', mention: 'mention',
  message: 'comment', dating_like: 'heart', dating_match: 'sparkles',
};
function timeAgo(iso: string): string {
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60); if (m < 60) return `${m}m`;
  const h = Math.round(m / 60); if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

/** Header notifications bell — live unread count + a dropdown of recent items. */
function NotificationBell() {
  const nav = useNavigate();
  const unread = useUnreadNotificationCount();
  const list = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const items = list.data ?? [];
  const openItem = (id: string, href?: string, read?: boolean) => {
    if (!read) markRead.mutate(id);
    setOpen(false);
    if (href) nav(href);
  };
  // Clicking the Alerts button clears the unread badge: opening the panel marks
  // everything read (optimistically, so the number vanishes immediately).
  const toggle = () => {
    if (!open && (unread.data ?? 0) > 0) markAll.mutate();
    setOpen((o) => !o);
  };

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <button type="button" aria-label="Notifications" onClick={toggle}
        style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit',
          fontSize: 'var(--chip-fs)', letterSpacing: '.05em', fontWeight: 600, textTransform: 'uppercase', padding: 0,
          border: 'none', color: 'var(--ink)', background: 'transparent', cursor: 'pointer' }}>
        <Icon name="bell" size={17} /> <span className="lab">ALERTS</span>
        <Badge count={unread.data ?? 0} />
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 10px)', right: 0, width: 340, maxHeight: 460, overflowY: 'auto',
          background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, boxShadow: '0 12px 40px rgba(0,0,0,.18)', zIndex: 90 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderBottom: '1px solid var(--line)' }}>
            <strong style={{ fontSize: 14 }}>Notifications</strong>
            {items.some((n) => !n.read) && (
              <button type="button" onClick={() => markAll.mutate()} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }}>Mark all read</button>
            )}
          </div>
          {items.length === 0 ? (
            <p className="muted" style={{ fontSize: 13, padding: '28px 16px', textAlign: 'center' }}>You're all caught up.</p>
          ) : items.slice(0, 20).map((n) => (
            <button key={n.id} type="button" onClick={() => openItem(n.id, n.href, n.read)}
              style={{ display: 'flex', gap: 10, width: '100%', textAlign: 'left', padding: '11px 14px', border: 'none', borderBottom: '1px solid var(--line)',
                background: n.read ? 'transparent' : 'var(--accent-soft)', cursor: 'pointer', fontFamily: 'inherit' }}>
              <Icon name={ICON_FOR[n.kind] ?? 'bell'} size={16} style={{ marginTop: 1, color: 'var(--accent)' }} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13, fontWeight: n.read ? 500 : 700 }}>{n.title}</span>
                {n.body && <span className="muted" style={{ display: 'block', fontSize: 12, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.body}</span>}
                <span className="muted" style={{ fontSize: 11 }}>{timeAgo(n.createdAt)} ago</span>
              </span>
            </button>
          ))}
          <button type="button" onClick={() => { setOpen(false); nav('/social/notifications'); }}
            style={{ display: 'block', width: '100%', textAlign: 'center', padding: '11px', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--accent)', fontWeight: 600, fontSize: 13, fontFamily: 'inherit' }}>
            See all notifications →
          </button>
        </div>
      )}
    </div>
  );
}

/** Global header — 12 hub tabs + Requests/Mail/Chat/Profile actions, ported from tc.js buildHeader(). */
export function Header() {
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const { user } = useAuth();
  const firstName = fromName(user?.name) ?? 'Profile';
  const tabs = NAV.filter((n) => n.key !== 'mail'); // Mail lives in the actions, not the tab row
  useTrackRecent(); // remember where we've been — powers Recently Viewed + breadcrumbs
  return (
    <header className="tc-header">
      <CommandPalette />
      <FloatingSearch />
      {/* Row 1 — centred logo (burger pinned left for mobile). */}
      <div className="tc-header-top">
        <button className="tc-burger" aria-label="Open menu" onClick={() => toggleSidebar()}><Icon name="menu" size={20} /></button>
        <Link to="/" className="tc-logo">
          <span className="mark"><img src="/assets/img/tc-logo.png" alt="Together City" width={34} height={34} /></span>
          <span className="word">TOGETHER CITY</span>
        </Link>
      </div>
      {/* Row 2 — hub tabs (left) + People · Mail · Chat · Alerts · Profile (right), one line. */}
      <div className="tc-navrow">
        <nav className="tc-nav" aria-label="Hubs">
          {tabs.map((n) => (
            <NavLink key={n.key} to={n.path} className={({ isActive }) => (isActive ? 'on' : undefined)}>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="tc-actionbar">
          <QuickActions show="links" />
          <NotificationBell />
          <Link to="/profile" aria-label="Profile" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {user?.profileImage ? (
              <img src={user.profileImage} alt="" width={24} height={24}
                style={{ borderRadius: '50%', objectFit: 'cover', display: 'block', border: '1.5px solid var(--line)' }} />
            ) : (
              <Icon name="user" size={20} />
            )}
            <span className="lab">{firstName}</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
