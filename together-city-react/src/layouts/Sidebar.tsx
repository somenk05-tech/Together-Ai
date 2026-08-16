import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import type { HubConfig } from '@/config/hubs';
import { Icon } from '@/components/ui/Icon';
import { useUiStore } from '@/store/ui.store';
import { MailProjectsRail, MailProjectSideRail } from '@/features/mail/ProjectRail';
import { useMailMessage, useMailProjects } from '@/features/mail/api';
import { DrawerScrim, useSwipeClose } from './drawerDismiss';

const PersonIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" />
  </svg>
);
const PeopleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="9" cy="8" r="3.4" /><path d="M2.5 20c0-3.4 3-5.2 6.5-5.2s6.5 1.8 6.5 5.2" /><path d="M16 5.2A3.4 3.4 0 0 1 16 12" /><path d="M17.5 14.9c2.7.5 4 2.3 4 5.1" />
  </svg>
);

/** Hub sidebar — back link + (nutrition/family) mode tabs + menu. */
export function Sidebar({ hub }: { hub: HubConfig }) {
  const navigate = useNavigate();
  /**
   * MAIL'S RAIL CHANGES WITH THE ROOM. Standing inside a project, "Sent" in
   * this sidebar used to be the WHOLE mailbox's Sent — it looked like the
   * project's own and it was not, which is the most expensive kind of wrong a
   * navigation can be, because nothing about it appears broken. Inside a
   * project the rail is that project's folders; everywhere else `hub.items`
   * is untouched, for all twenty-five hubs that share this layout.
   */
  const { pathname, search } = useLocation();
  /**
   * WHICH ROOM YOU ARE IN, and the composer counts.
   *
   * /mail/p/<key> is the obvious half. The other half is /mail/compose?project=
   * <key>: pressing Compose in a project's own rail took you to a URL that did
   * not look like a project, so the rail reverted to the whole mailbox's
   * mid-task — the one moment you are most sure you are still inside the room,
   * because you got there from its own menu.
   */
  /**
   * AND THE THIRD HALF: /mail/message/<id>. A message opened from a project's
   * inbox carries no project in its URL, so the rail reverted to the whole
   * mailbox's the moment the message opened — inside the room, reading the
   * room's own mail, with a sidebar claiming you had left. The URL cannot say
   * which room a message is filed in, but the message itself can: it is
   * already in the query cache (the page fetched it), and its projectId
   * resolves to a key through the projects list. Both queries are disabled
   * everywhere but a mail message route, so the other twenty-four hubs fetch
   * nothing new.
   */
  const messageId = pathname.startsWith('/mail/message/') ? (pathname.split('/')[3] ?? '') : '';
  const openMessage = useMailMessage(messageId);
  const messageProjects = useMailProjects(Boolean(messageId && openMessage.data?.projectId));
  const messageProjectKey = messageId && openMessage.data?.projectId
    ? ((messageProjects.data ?? []).find((p) => p.id === openMessage.data?.projectId)?.key ?? '')
    : '';
  const projectKey = pathname.startsWith('/mail/p/')
    ? (pathname.split('/')[3] ?? '')
    : pathname === '/mail/compose' ? (new URLSearchParams(search).get('project') ?? '')
    : messageProjectKey;
  const open = useUiStore((s) => s.sidebarOpen);
  const toggle = useUiStore((s) => s.toggleSidebar);
  const close = () => toggle(false);
  const swipe = useSwipeClose(close);

  // Nutrition and Family Nutrition are the two modes of one experience.
  const showModeTabs = hub.key === 'nutrition' || hub.key === 'family';
  // GEOMETRY ONLY — the material is `.mode-tab` in relief.css. This used to
  // fill itself with var(--accent-soft) and write in var(--accent), which put a
  // green panel and green type in a sidebar on a page where a hub's colour is
  // a dot and a hairline. Selected is now CARVED, like every other thing in
  // this application that is set rather than pressed.
  // GAP AND PADDING LEFT THIS OBJECT on 17 Aug and live in layout.css with the
  // rest of the sidebar's geometry. They were inline, which meant a stylesheet
  // could only reach them with `!important` — the problem relief.css already
  // records against these same pills. That move outlived the collapsing rail it
  // was made for, and stays.
  const modeTab = (): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', width: '100%', textAlign: 'left',
    cursor: 'pointer', fontFamily: 'inherit',
    fontSize: 16, marginBottom: 4,
  });

  return (
    <>
    <DrawerScrim open={open} onClose={close} />
    <aside className={`tc-side${open ? ' open' : ''}`} data-side={hub.key} {...swipe}>
      <button className="back" onClick={() => navigate(-1)}>← Back</button>
      <div className="hubname">{hub.key === 'family' ? 'Nutrition Hub' : hub.name}</div>
      <div className="hubtag">{hub.key === 'family' ? 'Eat healthy, live better' : hub.tag}</div>

      {showModeTabs && (
        <div style={{ borderTop: '1px solid var(--line)', margin: '14px 0', paddingTop: 14 }}>
          <button type="button" className="mode-tab" aria-pressed={hub.key === 'nutrition'}
            style={modeTab()} onClick={() => { navigate('/nutrition/blood'); toggle(false); }}>
            <PersonIcon /> Individual
          </button>
          <button type="button" className="mode-tab" aria-pressed={hub.key === 'family'}
            style={modeTab()} onClick={() => { navigate('/family'); toggle(false); }}>
            <PeopleIcon /> Family
          </button>
        </div>
      )}

      <button type="button" className="back" style={{ minHeight: 44 }}
        onClick={() => { window.dispatchEvent(new Event('tc:command')); toggle(false); }}>
        ⌕ Search the city
      </button>
      {projectKey ? (
        <MailProjectSideRail projectKey={projectKey} onNavigate={() => toggle(false)} />
      ) : (
        <>
          <nav className="side-menu">
            {hub.items.map((it) => (
              <NavLink key={it.path} to={it.path} onClick={() => toggle(false)}
                className={({ isActive }) => (isActive ? 'active' : undefined)}>
                <span className="n">{it.index}</span>
                <span><span className="l">{it.label}</span><span className="s">{it.sub}</span></span>
              </NavLink>
            ))}
          </nav>
          {/* THE WAY OUT SITS BELOW THE HAIRLINE, NOT IN THE NUMBERED LIST.
              The numbered rail is the folders of the room you are standing in,
              and "Projects" is not one of All Emails' folders — it is the door
              back to the wall. Exactly where the project rail keeps its own
              way out, and for the same reason. Mail only. */}
          {hub.key === 'mail' && (
            <nav className="side-menu mproj-side-out" aria-label="Leave All Emails">
              <NavLink to="/mail" end onClick={() => toggle(false)}
                className={({ isActive }) => (isActive ? 'active' : undefined)}>
                <span className="n" aria-hidden><Icon name="sort" size={15} /></span>
                <span><span className="l">Projects</span><span className="s">Every room in your mailbox</span></span>
              </NavLink>
            </nav>
          )}
        </>
      )}
      {/* MAIL IS THE ONE HUB WITH RAIL ENTRIES THAT ARE NOT IN CONFIG. Every
          other rail is a fixed list of screens; a citizen's projects are
          theirs, and they hang under the fixed list rather than being merged
          into it — hub.items stays the same shape for all twenty-five. */}
      {hub.key === 'mail' && <MailProjectsRail onNavigate={() => toggle(false)} />}

      {/* The way out is on the same door the way in was: Home, and the whole
          city, from any hub's drawer. */}
      <nav className="side-menu" aria-label="The city" style={{ borderTop: '1px solid var(--line)', marginTop: 14, paddingTop: 10 }}>
        <NavLink to="/" end onClick={() => toggle(false)}
          className={({ isActive }) => (isActive ? 'active' : undefined)}>
          <span className="n" aria-hidden><Icon name="sparkles" size={15} /></span>
          <span><span className="l">Home</span><span className="s">Your Together City</span></span>
        </NavLink>
        <NavLink to="/hubs" onClick={() => toggle(false)}
          className={({ isActive }) => (isActive ? 'active' : undefined)}>
          <span className="n" aria-hidden><Icon name="place" size={15} /></span>
          <span><span className="l">All hubs</span><span className="s">The whole city, one screen</span></span>
        </NavLink>
      </nav>
    </aside>
    </>
  );
}
