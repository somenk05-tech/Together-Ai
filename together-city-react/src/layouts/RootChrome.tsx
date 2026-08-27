import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { MiraDock } from './MiraDock';
import { useMiraShown } from '@/hooks/useCityDesign';
import { useUiStore } from '@/store/ui.store';

/**
 * ── THE CHROME THAT IS TRUE OF THE APPLICATION, NOT OF ONE LAYOUT ───────────
 *
 * WHAT THIS FIXES. MiraDock's own file opens with "her door on every page",
 * and it was mounted in AppShell — which is one of NINETEEN top-level route
 * blocks. AppShell renders the city home, the hub landings and the settings
 * pages; every inner page of Nutrition, Social, Dating, Medical, Beauty,
 * Fitness, Financial, Family, Astrology, Jobs, Real Estate, Local Services,
 * Entertainment, Travel and Mail is a HubLayout block SIBLING to it. So the
 * door was on the front of each building and on none of the rooms inside —
 * which is the majority of the application and, for "how does this page
 * work?", the majority of the reason to ask.
 *
 * THE CODEBASE HAD ALREADY LEARNED THIS TWICE AND WRITTEN IT DOWN BOTH TIMES.
 * CallCenter carried the identical comment ("wherever the citizen is") from
 * inside AppShell and had to be lifted above the router; useZoomLock's note in
 * App.tsx names it as "the same trap CallCenter fell into". This is the third
 * instance, and the reason it needed a new file rather than a third lift is
 * the one difference between them: MiraDock reads `useLocation` — it closes on
 * navigation and it tells Mira which page she was opened over — so it cannot
 * live above RouterProvider the way CallCenter does. A pathless root route is
 * the highest place inside the router, and it is the only place that is one
 * place.
 *
 * WHY NOT ADD A SECOND <MiraDock /> TO HubLayout. Because the failure being
 * fixed IS a second mounting point that somebody forgot. Two would work today
 * and the twentieth route block would be added by whoever is not reading this.
 *
 * IT RENDERS NOTHING OF ITS OWN. `<Outlet />` and the dock: no header, no
 * footer, no wrapper element. Every route block keeps its own shell exactly as
 * it was, and a route with no shell at all (/sign-in) is untouched — MiraDock
 * returns null when signed out, so it draws nothing there anyway.
 */
export function RootChrome() {
  /* ARRIVING SOMEWHERE CLOSES THE DRAWER. `sidebarOpen` is global and nothing
     reset it on navigation, so a burger pressed on a page whose drawer didn't
     render left the flag armed — and the NEXT page's drawer slid open over a
     screen the citizen never asked to cover. Every in-drawer link already
     closes on tap; this is the safety net for every other way a route can
     change. */
  const { pathname } = useLocation();
  const toggle = useUiStore((s) => s.toggleSidebar);
  const miraShown = useMiraShown();
  useEffect(() => { toggle(false); }, [pathname, toggle]);
  return (
    <>
      <Outlet />
      {/* Her mark, on every page in the city. The component decides where she
          is unwelcome — the rooms that are already a conversation — and that
          list lives with her rather than here. */}
      {/* Hidden when the operator's Mira switch is off. Her door, not her voice: /api/mira is untouched and an open conversation keeps working. */}
      {miraShown && <MiraDock />}
    </>
  );
}
