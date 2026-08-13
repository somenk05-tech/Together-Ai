import { NavLink } from 'react-router-dom';
import { useMailProjects, PROJECT_CAP } from './api';

/**
 * THE PROJECTS RUN OF THE MAIL RAIL.
 *
 * Mail is the only hub whose sidebar has entries that are not in config —
 * every other rail is a fixed list of screens, and these are one citizen's
 * rooms. So the sidebar keeps rendering hub.items exactly as it does for the
 * other twenty-four hubs, and this hangs beneath it under its own hairline.
 *
 * Numbered P1, P2… in the same hand as 01–07 above, because they are folders
 * of this mailbox and not a second navigation with its own manners. Archived
 * projects are absent: that is what archiving is for, and they are still on
 * the cards page where they can be brought back.
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
            <span className="l"><span className="mproj-dot" aria-hidden /> {p.name}</span>
            <span className="s">{p.total === 0 ? 'Nothing yet' : `${p.total} message${p.total === 1 ? '' : 's'}`}</span>
          </span>
          {p.unread > 0 && <span className="mproj-side-unread">{p.unread}</span>}
        </NavLink>
      ))}
      <NavLink to="/mail" end onClick={() => onNavigate?.()} className="mproj-side-new">
        + New project
      </NavLink>
    </nav>
  );
}
