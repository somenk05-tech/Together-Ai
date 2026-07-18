import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { Footer } from './Footer';
import { Sidebar } from './Sidebar';
import type { HubConfig } from '@/config/hubs';
import { useHubTheme } from '@/hooks/useHubTheme';

/** Two-column layout (sidebar + content) used by every hub's inner pages. */
export function HubLayout({ hub }: { hub: HubConfig }) {
  useHubTheme(hub.key);
  return (
    <>
      <Header />
      <div className="tc-shell">
        <Sidebar hub={hub} />
        <main className="tc-main"><Outlet /></main>
      </div>
      <Footer />
    </>
  );
}
