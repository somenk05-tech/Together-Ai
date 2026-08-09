import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { socketClient, WS } from '@/api';

interface ChatNotification {
  conversationId: string;
  messageId: string;
  senderId: string;
  preview?: string;
}

/**
 * Global chat push: fires for a new message in ANY of your conversations, even
 * ones you're not viewing (the server pushes to your personal socket room).
 * Updates the unread badge instantly and acknowledges delivery (✓✓) to the sender.
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
    /* THE TICKS HAVE TO CATCH UP TOO. A receipt is a socket frame and nothing
       persisted it into the cache, so a message read while the sender had the
       thread closed stayed on one tick until a reload. Re-reading the thread is
       cheap and it is the only thing that makes the tick eventually true. */
    const offRead = socketClient.on<{ conversationId?: string }>(WS.MESSAGE_READ, () => {
      void qc.invalidateQueries({ queryKey: ['chat', 'messages'] });
    });
    const offDelivered = socketClient.on<{ conversationId?: string }>(WS.MESSAGE_DELIVERED, () => {
      void qc.invalidateQueries({ queryKey: ['chat', 'messages'] });
    });
    return () => { off(); offRead(); offDelivered(); };
  }, [qc]);
}
