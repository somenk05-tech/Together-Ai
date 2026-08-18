import { Outlet, useLocation } from 'react-router-dom';
import { Header } from './Header';
import { Footer } from './Footer';
import { useSocket } from '@/hooks/useSocket';
import { useChatNotifications } from '@/hooks/useChatNotifications';
import { useWebPush } from '@/hooks/useWebPush';
import { useConnectionSync } from '@/api/connections.api';
import { CookRoot } from '@/features/nutrition/components/CookMode';
import { NotificationToaster } from './NotificationToaster';
import { CityDrawer } from './CityDrawer';
import { VerifyEmailBanner } from '@/features/auth/VerifyEmailBanner';

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
    // CallCenter has moved up to App, above the router. It was here, and this
    // layout is only one of several route blocks — so "wherever the citizen is"
    // meant "wherever the citizen is inside this subtree", which excluded every
    // hub inner page in the app.
    <>
      <Header />
      <VerifyEmailBanner />
      <CityDrawer /> {/* the burger's door on pages without a hub rail */}
      <main className="tc-main" style={isChat ? { minHeight: 0, overflow: 'hidden' } : undefined}><Outlet /></main>
      {!isChat && <Footer />}
      {/* MIRA IS NOT MOUNTED HERE ANY MORE, and the comment that used to sit on
          this line is why: "her mark on every page" was true of this subtree
          and false of the application. AppShell is one of nineteen top-level
          route blocks; every hub INNER page is a HubLayout sibling of it, so
          the dock reached the landings and none of the rooms. She is mounted
          once in RootChrome now, above all nineteen — the third time this
          codebase has had to lift something out of this exact file, after
          CallCenter and the zoom guard. */}
      <CookRoot /> {/* guided cook overlay + background timer — only renders while cooking */}
      <NotificationToaster /> {/* app-wide live toasts for notifications + chat */}
    </>
  );
}
