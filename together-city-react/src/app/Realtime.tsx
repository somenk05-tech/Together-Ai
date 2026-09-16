import { useSocket } from '@/hooks/useSocket';
import { useChatNotifications } from '@/hooks/useChatNotifications';
import { useWebPush } from '@/hooks/useWebPush';
import { useConnectionSync } from '@/api/connections.api';

/**
 * ── THE SOCKET LIVES ABOVE THE ROUTER (16 Sep) ──────────────────────────────
 *
 * These four hooks were called from AppShell — and AppShell is one route block
 * of nineteen. Every hub's inner pages (/social/*, /matchmaking/*,
 * /nutrition/*, …) render under a HubLayout that is a SIBLING of AppShell,
 * not a child, so a deep link, a push-notification link or a reload on any of
 * them opened no socket: `socketClient.emit` on an unconnected socket simply
 * buffers, DatingChats' JOIN_CONVERSATION went nowhere, an incoming call could
 * not ring, and leaving Home for a hub cleared the presence heartbeat so the
 * citizen read as offline ninety seconds later. Realtime worked at all only
 * because the disconnect cleanup in useSocket closed over a stale `authed` and
 * never fired — dead code accidentally keeping a socket open once Home had
 * been visited.
 *
 * Same trap, same cure as CallCenter (App.tsx): none of these hooks uses a
 * router hook, so they belong above RouterProvider, inside Providers, mounted
 * once for the life of the application. `the-socket-lives-above-the-router`
 * pins that AppShell no longer calls them.
 */
export function Realtime(): null {
  useSocket(); // connect Socket.IO whenever authenticated, and keep presence alive
  useChatNotifications(); // instant unread badge + delivery receipts, app-wide
  useWebPush(); // keep the browser push subscription fresh when already granted
  useConnectionSync(); // live hub-permission sync — People + hub pages never drift
  return null;
}
