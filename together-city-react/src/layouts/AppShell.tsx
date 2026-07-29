import { Outlet, useLocation } from 'react-router-dom';
import { Header } from './Header';
import { Footer } from './Footer';
import { useSocket } from '@/hooks/useSocket';
import { useChatNotifications } from '@/hooks/useChatNotifications';
import { useWebPush } from '@/hooks/useWebPush';
import { useConnectionSync } from '@/api/connections.api';
import { CookRoot } from '@/features/nutrition/components/CookMode';
import { NotificationToaster } from './NotificationToaster';
import { VerifyEmailBanner } from '@/features/auth/VerifyEmailBanner';
import { CallCenter } from '@/features/calls/CallCenter';

/** Root layout for full-width hub landings & the city home. */
export function AppShell() {
  useSocket(); // connect Socket.IO whenever authenticated (chat, presence, notifications)
  useChatNotifications(); // instant unread badge + delivery receipts, app-wide
  useWebPush(); // keep the browser push subscription fresh when already granted
  useConnectionSync(); // live hub-permission sync — People + hub pages never drift
  // Chat is a full-viewport app screen: its thread scrolls internally and the
  // composer is pinned to the bottom. Rendering the footer there adds page
  // scroll, which pushes the composer below the fold — so no footer on /chats.
  const isChat = useLocation().pathname.startsWith('/chats');
  return (
    // CallCenter wraps everything because a call has to outlive the screen it
    // started on, and an incoming one has to appear wherever the citizen is.
    <CallCenter>
      <Header />
      <VerifyEmailBanner />
      <main className="tc-main" style={isChat ? { minHeight: 0, overflow: 'hidden' } : undefined}><Outlet /></main>
      {!isChat && <Footer />}
      <CookRoot /> {/* guided cook overlay + background timer — only renders while cooking */}
      <NotificationToaster /> {/* app-wide live toasts for notifications + chat */}
    </CallCenter>
  );
}
