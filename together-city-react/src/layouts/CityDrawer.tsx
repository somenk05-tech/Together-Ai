import { NavLink, useLocation } from 'react-router-dom';
import { NAV, HUBS } from '@/config/hubs';
import { HUB_ICON } from '@/nav/registry';
import { Icon } from '@/components/ui/Icon';
import { useUiStore } from '@/store/ui.store';

/**
 * The burger's drawer for every page that is NOT inside a hub. The button
 * rendered on Home and toggled `sidebarOpen` — and nothing anywhere read it:
 * a door handle wired to no door. This is the door: Home and all fourteen
 * hubs, the whole city from anywhere.
 *
 * Hub pages keep their own rail (Sidebar.tsx owns the drawer there, listing
 * the hub's rooms); this renders null inside a hub so one burger opens one
 * drawer. Phone-only by the same mount-time matchMedia the sign-in backdrop
 * and the poster walk use — on desktop `.tc-side` is a static flex column
 * and would wedge itself into pages that never asked for a sidebar.
 */
export function CityDrawer() {
  const open = useUiStore((s) => s.sidebarOpen);
  const toggle = useUiStore((s) => s.toggleSidebar);
  const { pathname } = useLocation();
  const phone = typeof window !== 'undefined' && window.matchMedia('(max-width: 899px)').matches;
  const inHub = Object.values(HUBS).some(
    (h) => pathname === h.backPath || pathname.startsWith(`${h.backPath}/`),
  );
  if (!phone || inHub) return null;
  return (
    <aside className={`tc-side${open ? ' open' : ''}`}>
      <div className="hubname">Together City</div>
      <div className="hubtag">Every hub, one door.</div>
      <nav className="side-menu" aria-label="The city">
        <NavLink to="/" end onClick={() => toggle(false)}
          className={({ isActive }) => (isActive ? 'active' : undefined)}>
          <span className="n" aria-hidden><Icon name="sparkles" size={15} /></span>
          <span><span className="l">Home</span><span className="s">Your Together City</span></span>
        </NavLink>
        {NAV.map((n) => (
          <NavLink key={n.key} to={n.path} onClick={() => toggle(false)}
            className={({ isActive }) => (isActive ? 'active' : undefined)}>
            <span className="n" aria-hidden><Icon name={HUB_ICON[n.key] ?? 'place'} size={15} /></span>
            <span><span className="l">{n.label}</span><span className="s">{HUBS[n.key]?.tag}</span></span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
