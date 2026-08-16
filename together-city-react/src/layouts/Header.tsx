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
      borderRadius: 999, background: 'var(--danger-ink)', color: 'var(--on-accent)', fontSize: 10, fontWeight: 700,
      display: 'grid', placeItems: 'center', lineHeight: 1,
    }}>{count > 9 ? '9+' : count}</span>
  );
}

const ICON_FOR: Record<string, IconName> = {
  like: 'heart', comment: 'comment', follow: 'follow', connection_request: 'connection',
  connection_accepted: 'accepted', post_live: 'sparkles', mention: 'mention',
  message: 'comment', dating_like: 'heart', dating_match: 'sparkles',
  // The Till. Every one of these is money arriving or moving, so they share
  // the wallet mark rather than each inventing a glyph.
  invoice_sent: 'wallet', invoice_paid: 'wallet', invoice_paid_business: 'wallet',
  invoice_cancelled: 'wallet', invoice_refunded: 'wallet',
  payout_settled: 'wallet', payout_failed: 'wallet',
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
        // Geometry only — see the note on QuickActions' `pill`. `padding: 0` and
        // `background: transparent` here beat relief.css and flattened this
        // button against a page where everything else was raised.
        style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 6,
          fontFamily: 'inherit', cursor: 'pointer' }}>
        <Icon name="bell" size={17} /> <span className="lab">Alerts</span>
        <Badge count={unread.data ?? 0} />
      </button>
      {open && (
        /* THE PANEL IS NOT AN ACTION-BAR ITEM, AND HAS TO SAY SO OUT LOUD.
           `.tc-actionbar button` is a DESCENDANT selector in two files — a
           32px black pill in layout.css and relief.css — and this dropdown is
           rendered inside the action bar, so every row in it was claiming that
           rule. See the `.notif-panel` reset in layout.css. */
        <div className="notif-panel" style={{ position: 'absolute', top: 'calc(100% + 10px)', right: 0, width: 340, maxHeight: 460, overflowY: 'auto',
          background: 'var(--card)', border: 0, borderRadius: 20, boxShadow: 'var(--e3)', zIndex: 90 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderBottom: '1px solid var(--line)' }}>
            <strong style={{ fontSize: 14 }}>Notifications</strong>
            {items.some((n) => !n.read) && (
              <button type="button" onClick={() => markAll.mutate()} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-ink)', fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }}>Mark all read</button>
            )}
          </div>
          {items.length === 0 ? (
            <p className="muted" style={{ fontSize: 13, padding: '28px 16px', textAlign: 'center' }}>You're all caught up.</p>
          ) : items.slice(0, 20).map((n) => (
            <button key={n.id} type="button" onClick={() => openItem(n.id, n.href, n.read)}
              style={{ display: 'flex', gap: 10, width: '100%', textAlign: 'left', padding: '11px 14px', border: 'none', borderBottom: '1px solid var(--line)',
                background: n.read ? undefined : 'var(--well)', boxShadow: n.read ? undefined : 'var(--carve)',
                cursor: 'pointer', fontFamily: 'inherit' }}>
              <Icon name={ICON_FOR[n.kind] ?? 'bell'} size={16} style={{ marginTop: 1, color: 'var(--accent-ink)' }} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13, fontWeight: n.read ? 500 : 700 }}>{n.title}</span>
                {n.body && <span className="muted" style={{ display: 'block', fontSize: 12, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.body}</span>}
                <span className="muted" style={{ fontSize: 11 }}>{timeAgo(n.createdAt)} ago</span>
              </span>
            </button>
          ))}
          <button type="button" onClick={() => { setOpen(false); nav('/social/notifications'); }}
            style={{ display: 'block', width: '100%', textAlign: 'center', padding: '11px', border: 'none', background: 'none', cursor: 'pointer', color: 'var(--ink)', fontWeight: 600, fontSize: 13, fontFamily: 'inherit' }}>
            See all notifications →
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Global header — THREE ROWS ON ONE AXIS (owner, 15 Aug, with the layout he
 * wanted photographed off the live site).
 *
 *    the name of the city
 *    Mail · Chat · Personal · Alerts · you
 *    ASTROLOGY · BEAUTY · DATING · …
 *
 * It arrived here in two moves. The bar left the TAB row first, because five
 * personal doors on the same shelf as twelve districts made the header say
 * they were the same kind of thing — and left the tabs fighting them for
 * width, which is why this file once carried two `--chip-fs` step-downs and
 * 9.5px capitals on a 1340px window. Then the bar came off the signature row
 * too: pinned to the right of the wordmark it was a corner of the header, and
 * centred under it, it is the second line of one masthead.
 *
 * THE MONOGRAM IS GONE, THE WORDMARK STAYS. Two files in the same hand said
 * the same name twice — the TC in the corner and "Together City" in the
 * middle — and at three centred rows the corner one is the only thing on the
 * page not on the axis. One signature, said once, in full.
 */
export function Header() {
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const { user } = useAuth();
  const authed = Boolean(user);
  const firstName = fromName(user?.name) ?? 'Profile';
  // THE TAB ROW IS DISTRICTS ONLY. Mail has always been lifted out of it into
  // the action bar; Personal joins it there (owner, 15 Aug) for the same
  // reason — neither is a district, and a drawer of your own filed
  // alphabetically between Nutrition and Property reads as one more place in
  // the city to visit. Both stay in NAV, which is the one list carrying every
  // tab's path and label for the burger drawer and the Hubs page.
  const IN_THE_BAR: ReadonlySet<string> = new Set(['mail', 'personal']);
  // The sort is belt-and-braces: the list in config is already alphabetical,
  // and sorting here means a hub appended to it lands in its place rather than
  // on the end.
  const tabs = NAV.filter((n) => !IN_THE_BAR.has(n.key))
    .slice()
    .sort((a, b) => a.label.localeCompare(b.label));
  useTrackRecent(); // remember where we've been — powers Recently Viewed + breadcrumbs
  return (
    <header className="tc-header">
      <CommandPalette />
      <FloatingSearch />
      {/* Row 1 — the signature, centred (burger pinned left for mobile). */}
      <div className="tc-header-top">
        <button className="tc-burger" aria-label="Open menu" onClick={() => toggleSidebar()}><Icon name="menu" size={20} /></button>
        {/* ONE SIGNATURE, SAID ONCE, IN FULL.
            The owner's hand-lettered monogram used to sit in the top left
            corner with the name in the same hand in the middle — the city's
            name written twice, in two files, because the relationship between
            them was a layout that changed with the viewport. On a masthead of
            three centred rows the corner mark is the only thing on the page
            that is not on the axis, so it is gone (owner, 15 Aug) and the
            wordmark carries the name alone. It keeps the alt text: a screen
            reader hears the city once, which is what it always did. */}
        <Link to="/" className="tc-logo">
          <img className="word" src="/assets/img/tc-word.svg" alt="Together City" width={77} height={30} />
        </Link>
      </div>
      {/* Row 2 — THE CITIZEN'S OWN DOORS, centred under the name: Mail · Chat ·
          Personal · Alerts · Profile. In flow now rather than pinned to the
          right of the signature, which is the whole of the redesign: on the
          corner they were chrome, under the name they are the second line of
          the masthead. */}
      <div className="tc-actionrow">
        <div className="tc-actionbar">
          {authed ? (
            <>
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
            </>
          ) : (
            <>
              {/* A visitor gets doors that open (consumer review #10) — not four
                  buttons that each end at the login wall. */}
              <Link to="/sign-in" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Icon name="user" size={17} /> <span className="lab">Sign in</span>
              </Link>
              <Link to="/sign-up" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                Join the city
              </Link>
            </>
          )}
        </div>
      </div>
      {/* Row 3 — the districts, on the same centre as the two rows above. */}
      <div className="tc-navrow">
        <nav className="tc-nav" aria-label="Hubs">
          {tabs.map((n) => (
            <NavLink key={n.key} to={n.path} className={({ isActive }) => (isActive ? 'on' : undefined)}>
              {n.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </header>
  );
}
