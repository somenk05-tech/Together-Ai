import { Link } from 'react-router-dom';
import { useUnreadChatCount } from '@/api';
import { useCityDesign } from '@/hooks/useCityDesign';
import { Icon } from '@/components/ui/Icon';

/** Small red count bubble (shared with the header). */
function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span aria-label={`${count} pending`} style={{
      position: 'absolute', top: -6, right: -8, minWidth: 16, height: 16, padding: '0 4px',
      borderRadius: 'var(--r-full)', background: 'var(--danger-ink)', color: 'var(--on-accent)', fontSize: 10, fontWeight: 700,
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
  alignItems: 'center', gap: 6, whiteSpace: 'nowrap', position: 'relative',
};

/**
 * Search · Mail · Chat · Personal quick-action pills. `show` selects which to
 * render: 'all' (default), just the 'search' pill, or the 'links' group.
 *
 * PERSONAL JOINED THE PILLS on 15 Aug, at the owner's call: "make personal a
 * button tab like mail and chat and profile". It was a hub tab, sitting in a
 * row of DISTRICTS in alphabetical order between Nutrition and Property — and
 * it is not a district. Mail, Chat, Personal and Profile are the four rooms
 * that belong to the citizen rather than to the city, and they read as a set
 * only when they sit together. It stays in `NAV` (that list is what the burger
 * drawer and the Hubs page walk, and its path and label should have one home);
 * the header simply lifts it out of the tab row, exactly as it has always
 * lifted Mail.
 *
 * PEOPLE LEFT THIS BAR on 5 Aug and now lives on the profile page as "Other
 * citizens", the same move Calendar made before it. A top bar is for the two or
 * three things somebody does many times a day; a directory of everybody else in
 * the city is something you go and look at, not something you glance at — and
 * the header was already carrying fourteen hub tabs, four pills and an avatar.
 */
export function QuickActions({ show = 'all' }: { show?: 'all' | 'search' | 'links' }) {
  const unreadChats = useUnreadChatCount();
  const { hubOn } = useCityDesign();
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
          {/* THE MAIL PILL OPENS THE MAILBOX, NOT ONE FOLDER IN IT.

              It pointed at /mail/inbox — the flat list of every message. That is
              a reasonable default and the wrong front door: it skips the
              projects entirely, so somebody who files their mail into rooms
              lands on the one screen that ignores them and has to navigate back
              out of it.

              /mail is what `hubs.ts` has declared as this hub's path since it
              was written, and it shows All Emails and the projects side by side.
              The folder is one click IN from there; the mailbox was not one
              click out. The header was the only thing in the app not using the
              hub's own path. */}
          {/* Each pill answers the same `hubOn` the header tabs and the drawer
              do, so the operator's site-wide switch reaches the three doors
              that were never on the citizen's own design page. Mail and Chat
              keep arriving and keep sending either way — this is the way in,
              not the service. */}
          {hubOn('mail') && (
            <Link to="/mail" aria-label="Mail" title="Mail" style={pill}>
              <Icon name="mail" size={17} /> <span className="lab">Mail</span>
            </Link>
          )}
          {hubOn('chat') && (
            <Link to="/chats" aria-label="Chat" title="Chat" style={pill}>
              <Icon name="chat" size={17} /> <span className="lab">Chat</span>
              <Badge count={unreadChats} />
            </Link>
          )}
          {/* The drawer of one's own — Thoughts, the daybook, Drive, the album.
              `/personal` is the path `hubs.ts` declares for it, so the pill and
              the burger drawer cannot drift apart. */}
          {hubOn('personal') && (
            <Link to="/personal" aria-label="Personal" title="Personal" style={pill}>
              <Icon name="personal" size={17} /> <span className="lab">Personal</span>
            </Link>
          )}
        </>
      )}
    </div>
  );
}
