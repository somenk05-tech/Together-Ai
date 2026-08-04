import { NavLink, Outlet } from 'react-router-dom';
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
  return (
    <>
      <Header />
      <VerifyEmailBanner />
      <div className="tc-shell">
        <Sidebar hub={hub} />
        <main className="tc-main">
          <div style={{ maxWidth: 1180, margin: '0 auto', width: '100%', padding: '0 16px' }}>
            <Breadcrumbs />
          </div>
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
        </main>
      </div>
      <Footer />
      <CookRoot /> {/* guided cook overlay + background timer — recipe pages live under this layout */}
    </>
  );
}
