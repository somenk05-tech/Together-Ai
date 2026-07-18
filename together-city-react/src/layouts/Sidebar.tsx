import { NavLink, useNavigate } from 'react-router-dom';
import type { HubConfig } from '@/config/hubs';
import { useUiStore } from '@/store/ui.store';

/** Hub sidebar — back link + menu, ported from tc.js buildSide(). */
export function Sidebar({ hub }: { hub: HubConfig }) {
  const navigate = useNavigate();
  const open = useUiStore((s) => s.sidebarOpen);
  const toggle = useUiStore((s) => s.toggleSidebar);
  return (
    <aside className={`tc-side${open ? ' open' : ''}`} data-side={hub.key}>
      <button className="back" onClick={() => navigate(-1)}>← Back</button>
      <div className="hubname">{hub.name}</div>
      <div className="hubtag">{hub.tag}</div>
      <nav className="side-menu">
        {hub.items.map((it) => (
          <NavLink key={it.path} to={it.path} onClick={() => toggle(false)}
            className={({ isActive }) => (isActive ? 'active' : undefined)}>
            <span className="n">{it.index}</span>
            <span><span className="l">{it.label}</span><span className="s">{it.sub}</span></span>
          </NavLink>
        ))}
      </nav>
      <div className="helpcard"><b>Need help?</b>Talk to our concierge, any hour of the city.<br /><a href="/chats">Contact support →</a></div>
    </aside>
  );
}
