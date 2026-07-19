import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { Footer } from './Footer';
import { useSocket } from '@/hooks/useSocket';
import { useChatNotifications } from '@/hooks/useChatNotifications';

/** Root layout for full-width hub landings & the city home. */
export function AppShell() {
  useSocket(); // connect Socket.IO whenever authenticated (chat, presence, notifications)
  useChatNotifications(); // instant unread badge + delivery receipts, app-wide
  return (
    <>
      <Header />
      <main className="tc-main"><Outlet /></main>
      <Footer />
    </>
  );
}
