import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { Footer } from './Footer';
import { useSocket } from '@/hooks/useSocket';

/** Root layout for full-width hub landings & the city home. */
export function AppShell() {
  useSocket(); // connect Socket.IO whenever authenticated (chat, presence, notifications)
  return (
    <>
      <Header />
      <main className="tc-main"><Outlet /></main>
      <Footer />
    </>
  );
}
