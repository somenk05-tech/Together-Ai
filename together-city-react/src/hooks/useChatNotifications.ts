import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { socketClient, WS } from '@/api';

/**
 * WHAT THE SERVER ACTUALLY SENDS — which conversation, which message.
 *
 * It used to declare `senderId` and `preview` as well, and the server used to
 * send them, for dating conversations included. Neither was ever read here.
 * Both are gone from the wire now, because a field on a frame is an invitation:
 * a toast built on this event would have shown a real name and the text of an
 * anonymous dating message without going near the code that masks them. If you
 * need to say WHO or WHAT, ask the notifications endpoint, which decides that.
 */
interface ChatNotification {
  conversationId: string;
  messageId: string;
}

/**
 * Global chat push: fires for a new message in ANY of your conversations, even
 * ones you're not viewing (the server pushes to your personal socket room).
 * Updates the unread badge instantly and acknowledges delivery (✓✓) to the sender.
 *
 * RECEIPT FRAMES ARE SCOPED AND COALESCED. This listener used to invalidate
 * every cached thread on every message_read / message_delivered frame — so one
 * receipt refetched every open transcript, and the open thread's own re-acks
 * became a loop that never went quiet (13 Aug audit). Frames now carry their
 * conversationId, so only that thread is invalidated; and a burst — 500
 * backlog receipts on somebody's reconnect — collapses into one refetch per
 * conversation per second, not five hundred.
 */
export function useChatNotifications(): void {
  const qc = useQueryClient();
  useEffect(() => {
    const off = socketClient.on<ChatNotification>(WS.CHAT_NOTIFICATION, (n) => {
      void qc.invalidateQueries({ queryKey: ['chat', 'conversations'] });
      /* AND THE THREAD ITSELF. Invalidating only the conversation list moved
         the badge and left the open transcript stale — with `staleTime: 30s`
         and `refetchOnWindowFocus: false` (queryClient.ts) the messages query
         had no other way back. If the socket frame for this particular message
         went missing, this is the second chance that puts it on screen. */
      void qc.invalidateQueries({ queryKey: ['chat', 'messages', n.conversationId] });
      socketClient.emit(WS.MESSAGE_DELIVERED, {
        conversationId: n.conversationId,
        messageIds: [n.messageId],
      });
    });
    /* The ticks still have to catch up — a receipt is a socket frame and only
       a refetch persists it into the cache — but scoped, and coalesced. */
    const pending = new Set<string>();
    let timer: number | null = null;
    const flush = () => {
      timer = null;
      const ids = [...pending];
      pending.clear();
      for (const id of ids) void qc.invalidateQueries({ queryKey: ['chat', 'messages', id] });
    };
    const receipt = (p: { conversationId?: string }) => {
      // An unscoped frame (a server mid-deploy) invalidates nothing here; the
      // open thread's own statusMap listener still advances its ticks live.
      if (!p?.conversationId) return;
      pending.add(p.conversationId);
      if (timer === null) timer = window.setTimeout(flush, 1000);
    };
    const offRead = socketClient.on<{ conversationId?: string }>(WS.MESSAGE_READ, receipt);
    const offDelivered = socketClient.on<{ conversationId?: string }>(WS.MESSAGE_DELIVERED, receipt);
    return () => {
      off(); offRead(); offDelivered();
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [qc]);
}
