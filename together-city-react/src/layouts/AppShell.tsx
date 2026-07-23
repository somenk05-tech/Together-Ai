import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { Footer } from './Footer';
import { useSocket } from '@/hooks/useSocket';
import { useChatNotifications } from '@/hooks/useChatNotifications';
import { useWebPush } from '@/hooks/useWebPush';
import { useConnectionSync } from '@/api/connections.api';
import { CookRoot } from '@/features/nutrition/components/CookMode';
import { NotificationToaster } from './NotificationToaster';

/** Root layout for full-width hub landings & the city home. */
export function AppShell() {
  useSocket(); // connect Socket.IO whenever authenticated (chat, presence, notifications)
  useChatNotifications(); // instant unread badge + delivery receipts, app-wide
  useWebPush(); // keep the browser push subscription fresh when already granted
  useConnectionSync(); // live hub-permission sync — People + hub pages never drift
  return (
    <>
      <Header />
      <main className="tc-main"><Outlet /></main>
      <Footer />
      <CookRoot /> {/* guided cook overlay + background timer — only renders while cooking */}
      <NotificationToaster /> {/* app-wide live toasts for notifications + chat */}
    </>
  );
}
