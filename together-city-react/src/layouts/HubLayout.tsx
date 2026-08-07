import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Header } from './Header';
import { Footer } from './Footer';
import { Sidebar } from './Sidebar';
import type { HubConfig } from '@/config/hubs';
import { useHubTheme } from '@/hooks/useHubTheme';
import { CookRoot } from '@/features/nutrition/components/CookMode';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { HubConsentGate } from '@/features/privacy/HubConsentGate';
import { VerifyEmailBanner } from '@/features/auth/VerifyEmailBanner';

/** Two-column layout (sidebar + content) used by every hub's inner pages. */
export function HubLayout({ hub }: { hub: HubConfig }) {
  useHubTheme(hub.key);
  /* A ROOM PER SCREEN, FOR THE ONE HUB THAT HAS ROOMS.
     Astrology's ground is a photograph, and it is a different photograph on
     each of its five screens — so the shell carries the page's own name and
     the stylesheet decides which sky that is. Every other hub gets nothing:
     `data-sky` is absent and the CSS that reads it never matches. */
  const { pathname } = useLocation();
  const sky = hub.skies ? pathname.split('/').filter(Boolean).pop() : undefined;
  return (
    <>
      <Header />
      <VerifyEmailBanner />
      <div className="tc-shell" data-sky={sky}>
        <Sidebar hub={hub} />
        <main className="tc-main">
          {/* ONE `.page` AROUND THE BREADCRUMB *AND* THE ROUTED PAGE.
              
              The breadcrumb used to sit in its own 1180px container with a
              16px gutter, above a page that chose its own width and its own
              gutter — so it lined up with the title beneath it on none of the
              hub's screens, and lined up differently on each one. Sharing the
              grid is the whole fix: they are two children of the same column
              now and cannot disagree. */}
          <div className="page">
            <Breadcrumbs />
          {/* One-thumb hub navigation. On a phone the sidebar lives behind the
              burger — real, but two taps from anywhere. These are the same
              hub.items as chips in a horizontal rail: the mobile-native shape
              for "sections of the place you are in". CSS hides it ≥900px,
              where the sidebar is simply present. */}
            {hub.items.length > 0 && (
              <nav className="hub-chips" aria-label={`${hub.name} sections`}>
                {hub.items.map((it) => (
                  <NavLink key={it.path} to={it.path} className={({ isActive }) => `chip${isActive ? ' on' : ''}`}
                    style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>
                    {it.label}
                  </NavLink>
                ))}
              </nav>
            )}
            <HubConsentGate hub={hub.key}><Outlet /></HubConsentGate>
          </div>
        </main>
      </div>
      <Footer />
      <CookRoot /> {/* guided cook overlay + background timer — recipe pages live under this layout */}
    </>
  );
}
