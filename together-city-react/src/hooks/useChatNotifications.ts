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
      socketClient.emit(WS.MESSAGE_DELIVERED, {
        conversationId: n.conversationId,
        messageIds: [n.messageId],
      });
    });
    return off;
  }, [qc]);
}
