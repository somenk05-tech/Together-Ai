import { useSyncExternalStore } from 'react';
import { NavLink } from 'react-router-dom';
import { NAV, HUBS } from '@/config/hubs';
import type { HubKey } from '@/types';
import { tabIcon } from '@/nav/registry';
import { Icon } from '@/components/ui/Icon';
import { useUiStore } from '@/store/ui.store';
import { useCityDesign } from '@/hooks/useCityDesign';
import { DrawerScrim, useSwipeClose } from './drawerDismiss';

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
/* THE BURGER'S OWN BREAKPOINT, HEARD LIVE. Two bugs lived on this line.
   It checked 899px while `.tc-burger` appears at 1100px, so a 900–1100px
   window showed a burger wired to nothing. And it read matchMedia ONCE at
   mount, so a rotate was never re-evaluated. useSyncExternalStore is the
   React-shaped subscription: the drawer appears and disappears exactly when
   the burger does. */
const DRAWER_MQ = '(max-width: 1100px)';
const subscribeMq = (cb: () => void) => {
  const m = window.matchMedia(DRAWER_MQ);
  m.addEventListener('change', cb);
  return () => m.removeEventListener('change', cb);
};
const readMq = () => window.matchMedia(DRAWER_MQ).matches;

export function CityDrawer() {
  const open = useUiStore((s) => s.sidebarOpen);
  const toggle = useUiStore((s) => s.toggleSidebar);
  const close = () => toggle(false);
  // A hook, so it is called before the early return below like every other one.
  const swipe = useSwipeClose(close);
  const phone = useSyncExternalStore(subscribeMq, readMq, () => false);
  // DESIGN YOUR SERVICES: same filter the header tabs wear, for the same
  // reason — this drawer IS the header on a phone. Mail and Personal are the
  // citizen's own doors, never designable, so hubOn always answers true for
  // them and they keep their place.
  const { hubOn } = useCityDesign();
  /* THE `inHub` NULL-CHECK IS GONE, AND IT WAS THE DEAD BURGER. It returned
     null whenever the path sat on or under a hub's backPath, assuming those
     pages render Sidebar. They don't — AppShell and HubLayout are SIBLING
     route blocks, so on every AppShell route (all fifteen hub landings, every
     store screen) this component is the only drawer there is, and nulling it
     left the burger opening nothing on ~28 screens. Inside a HubLayout route
     AppShell is not mounted at all, so the two drawers can never coexist and
     there is nothing for the check to prevent. */
  if (!phone) return null;
  return (
    <>
    <DrawerScrim open={open} onClose={close} />
    <aside className={`tc-side${open ? ' open' : ''}`} role="dialog" aria-modal="true"
      aria-label="City menu" {...swipe}>
      <div className="hubname">Together City</div>
      <div className="hubtag">Every hub, one door.</div>
      {/* THE SAME SEARCH THE HUB DRAWER CARRIES. Hiding the header's Search
          pill on a phone was justified by this drawer's search entry — which
          only existed in Sidebar.tsx, so Home and every hub landing had no way
          to open the palette at all. One button, same event, both drawers. */}
      <button type="button" className="back" style={{ minHeight: 44 }}
        onClick={() => { window.dispatchEvent(new Event('tc:command')); toggle(false); }}>
        ⌕ Search the city
      </button>
      <nav className="side-menu" aria-label="The city">
        <NavLink to="/" end onClick={() => toggle(false)}
          className={({ isActive }) => (isActive ? 'active' : undefined)}>
          <span className="n" aria-hidden><Icon name="sparkles" size={15} /></span>
          <span><span className="l">Home</span><span className="s">Your Together City</span></span>
        </NavLink>
        {NAV.filter((n) => hubOn(n.key)).map((n) => (
          <NavLink key={n.key} to={n.path} onClick={() => toggle(false)}
            className={({ isActive }) => (isActive ? 'active' : undefined)}>
            <span className="n" aria-hidden><Icon name={tabIcon(n.key)} size={15} /></span>
            <span><span className="l">{n.label}</span><span className="s">{HUBS[n.key as HubKey]?.tag}</span></span>
          </NavLink>
        ))}
      </nav>
      {/* Below the hairline, the citizen's own overview doors — the rooms that
          are not districts. Dashboard was linked from exactly one place in the
          whole app: the 404 page. It carries the only aggregated unread counts
          a phone has, so it gets a door where a phone can reach it. */}
      <nav className="side-menu" aria-label="Your own pages"
        style={{ borderTop: '1px solid var(--line)', marginTop: 14, paddingTop: 10 }}>
        <NavLink to="/dashboard" onClick={() => toggle(false)}
          className={({ isActive }) => (isActive ? 'active' : undefined)}>
          <span className="n" aria-hidden><Icon name="sparkles" size={15} /></span>
          <span><span className="l">Your city</span><span className="s">Today, across every hub</span></span>
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
