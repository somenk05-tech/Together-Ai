import { Link } from 'react-router-dom';
import { useUnreadChatCount } from '@/api';
import { Icon } from '@/components/ui/Icon';

/** Small red count bubble (shared with the header). */
function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span aria-label={`${count} pending`} style={{
      position: 'absolute', top: -6, right: -8, minWidth: 16, height: 16, padding: '0 4px',
      borderRadius: 999, background: 'var(--danger-ink)', color: 'var(--on-accent)', fontSize: 10, fontWeight: 700,
      display: 'grid', placeItems: 'center', lineHeight: 1,
    }}>{count > 9 ? '9+' : count}</span>
  );
}

/**
 * GEOMETRY ONLY. Every material property that used to be here —
 * `background: 'transparent'`, the uppercase, the letter-spacing — beat
 * relief.css from the style attribute, which meant these pills rendered with
 * the rim of --e1 and none of its lit face. They looked flat next to a page
 * where everything else stood up, and nothing in the stylesheet could fix it.
 * The class `.tc-actions a/button` in relief.css owns the material now.
 */
const pill: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', position: 'relative',
};

/**
 * Search · Mail · Chat quick-action pills. `show` selects which to render:
 * 'all' (default), just the 'search' pill, or the 'links' pair (Mail/Chat).
 *
 * PEOPLE LEFT THIS BAR on 5 Aug and now lives on the profile page as "Other
 * citizens", the same move Calendar made before it. A top bar is for the two or
 * three things somebody does many times a day; a directory of everybody else in
 * the city is something you go and look at, not something you glance at — and
 * the header was already carrying fourteen hub tabs, four pills and an avatar.
 */
export function QuickActions({ show = 'all' }: { show?: 'all' | 'search' | 'links' }) {
  const unreadChats = useUnreadChatCount();
  const searchOn = show === 'all' || show === 'search';
  const linksOn = show === 'all' || show === 'links';
  return (
    <div className="tc-actions">
      {searchOn && (
        <button type="button" aria-label="Search — jump to anything (Ctrl/Cmd K)" title="Search (⌘K)"
          onClick={() => window.dispatchEvent(new Event('tc:command'))}
          style={{ ...pill, cursor: 'pointer', fontFamily: 'inherit' }}>
          <Icon name="search" size={17} /> <span className="lab">Search</span>
        </button>
      )}
      {linksOn && (
        <>
          <Link to="/mail/inbox" aria-label="Mail" style={pill}>
            <Icon name="mail" size={17} /> <span className="lab">Mail</span>
          </Link>
          <Link to="/chats" aria-label="Chat" style={pill}>
            <Icon name="chat" size={17} /> <span className="lab">Chat</span>
            <Badge count={unreadChats} />
          </Link>
        </>
      )}
    </div>
  );
}
