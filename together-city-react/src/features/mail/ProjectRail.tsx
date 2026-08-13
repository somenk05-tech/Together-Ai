import { NavLink, Link } from 'react-router-dom';
import { useMailProjects, PROJECT_CAP } from './api';
import { iconForName, tintOf } from './folderLook';
import { Icon } from '@/components/ui/Icon';

/**
 * THE MAIL SIDEBAR IS THE ONE THAT CHANGES WITH THE ROOM YOU ARE IN.
 *
 * Every other hub's rail is a fixed list of screens, so `hub.items` is enough
 * for twenty-four of them. Mail has rooms, and a rail that shows the same
 * eight links inside every room is worse than no rail at all: standing in the
 * ABG project, "Sent" in the sidebar went to the WHOLE mailbox's Sent. It
 * looked like the project's own and it was not — the most expensive kind of
 * wrong a navigation can be, because nothing about it looks broken.
 *
 * So there are two rails. Inside All Emails you get the mailbox's folders;
 * inside a project you get THAT PROJECT'S folders, and every one of them is
 * scoped. `hub.items` still describes the first, unchanged, for the twenty-five
 * hubs that share the layout.
 */

/** The project's own folders. Numbered in the same hand as the mailbox's, and
 *  scoped to one room without exception. */
export function MailProjectSideRail({ projectKey, onNavigate }: {
  projectKey: string; onNavigate?: () => void;
}) {
  const q = useMailProjects();
  const p = (q.data ?? []).find((x) => x.key === projectKey);
  const name = p?.name ?? projectKey;
  const base = `/mail/p/${projectKey}`;

  const items: Array<{ n: string; label: string; sub: string; to: string; end?: boolean }> = [
    { n: '01', label: 'Inbox', sub: 'Replies that came back here', to: base, end: true },
    { n: '02', label: 'Compose', sub: `Write from ${name}`, to: `/mail/compose?project=${projectKey}` },
    { n: '03', label: 'Sent', sub: 'What you sent from here', to: `${base}/sent` },
    { n: '04', label: 'Drafts & Failed', sub: 'Unfinished, and rejected', to: `${base}/unsent` },
    { n: '05', label: 'Starred', sub: 'Flagged for later', to: `${base}/starred` },
    { n: '06', label: 'Trash', sub: 'Deleted mail', to: `${base}/trash` },
  ];

  return (
    <>
      {/* Which room this rail belongs to, in the folder's own colour. Without
          it six generic folder names are indistinguishable from the mailbox's
          six, which is the confusion this whole component exists to end. */}
      <div className="mproj-side-in" data-tint={tintOf(p?.color)}>
        <span className="mproj-side-mark" aria-hidden><Icon name={iconForName(name)} size={16} /></span>
        <span>
          <span className="eyebrow">Project</span>
          <span className="mproj-side-name">{name}</span>
        </span>
      </div>
      <nav className="side-menu" aria-label={`${name} folders`}>
        {items.map((it) => (
          <NavLink key={it.to} to={it.to} end={it.end} onClick={() => onNavigate?.()}
            className={({ isActive }) => (isActive ? 'active' : undefined)}>
            <span className="n">{it.n}</span>
            <span><span className="l">{it.label}</span><span className="s">{it.sub}</span></span>
          </NavLink>
        ))}
      </nav>
      {/* The way back out, on the same door you came in by. */}
      <nav className="side-menu mproj-side-out" aria-label="Leave the project">
        <NavLink to="/mail/inbox" onClick={() => onNavigate?.()}
          className={({ isActive }) => (isActive ? 'active' : undefined)}>
          <span className="n" aria-hidden><Icon name="mail" size={15} /></span>
          <span><span className="l">All Emails</span><span className="s">Every message, always</span></span>
        </NavLink>
      </nav>
    </>
  );
}

/**
 * THE PROJECTS RUN, under whichever rail is above it.
 *
 * Numbered P1, P2… in the same hand as 01–08, because they are folders of this
 * mailbox and not a second navigation with its own manners. Archived projects
 * are absent: that is what archiving is for, and they are still on the cards
 * page where they can be brought back.
 */
export function MailProjectsRail({ onNavigate }: { onNavigate?: () => void }) {
  const q = useMailProjects();
  const projects = (q.data ?? []).filter((p) => !p.archived);

  return (
    <nav className="side-menu mproj-side" aria-label="Your projects">
      <div className="mproj-side-head">
        <span className="eyebrow">Projects</span>
        <span className="mproj-side-count">{projects.length} / {PROJECT_CAP}</span>
      </div>
      {projects.map((p, i) => (
        <NavLink key={p.id} to={`/mail/p/${p.key}`} onClick={() => onNavigate?.()}
          className={({ isActive }) => (isActive ? 'active' : undefined)}>
          <span className="n">P{i + 1}</span>
          <span>
            <span className="l"><span className="mproj-dot" data-tint={tintOf(p.color)} aria-hidden /> {p.name}</span>
            <span className="s">{p.total === 0 ? 'Nothing yet' : `${p.total} message${p.total === 1 ? '' : 's'}`}</span>
          </span>
          {p.unread > 0 && <span className="mproj-side-unread">{p.unread}</span>}
        </NavLink>
      ))}
      <Link to="/mail" onClick={() => onNavigate?.()} className="mproj-side-new">
        + New project
      </Link>
    </nav>
  );
}
