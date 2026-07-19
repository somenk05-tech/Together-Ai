import { z } from 'zod';
import { useCallback, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from './http';
import { socketClient, WS } from './socket';
import {
  ConversationSchema, MessagePageSchema, MessageSchema,
  type Conversation, type Message, type MessagePage, type ShareCard,
} from './schemas';

const ContactSchema = z.object({ id: z.string(), handle: z.string(), name: z.string(), profileImage: z.string().nullable().optional() });
export type Contact = z.infer<typeof ContactSchema>;

/** REST — conversations + message history (cursor pagination). */
export const chatApi = {
  conversations: (): Promise<Conversation[]> =>
    apiGet('/chat/conversations', z.array(ConversationSchema)),
  messages: (conversationId: string, cursor?: string, limit = 30): Promise<MessagePage> =>
    apiGet(`/chat/${conversationId}/messages`, MessagePageSchema, { params: { cursor, limit } }),
  send: (conversationId: string, body: string): Promise<Message> =>
    apiPost('/messages', { conversationId, body }, MessageSchema),
  sendShare: (conversationId: string, body: string, share: ShareCard): Promise<Message> =>
    apiPost('/messages', { conversationId, body, share }, MessageSchema),
  startDirect: (handle: string): Promise<Conversation> =>
    apiPost('/chat/start', { handle }, ConversationSchema),
  contacts: (): Promise<Contact[]> =>
    apiGet('/chat/contacts', z.array(ContactSchema)),
  createGroup: (title: string, memberIds: string[]): Promise<Conversation> =>
    apiPost('/chat/group', { title, memberIds }, ConversationSchema),
};

/* ---------------- React Query hooks ---------------- */
export function useConversations() {
  return useQuery({
    queryKey: ['chat', 'conversations'],
    queryFn: () => chatApi.conversations(),
    // Poll so new messages / unread counts surface as a badge without a reload.
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });
}

/** Total unread messages across all conversations — for the header Chat badge. */
export function useUnreadChatCount(): number {
  const { data } = useConversations();
  return (data ?? []).reduce((sum, c) => sum + (c.unread ?? 0), 0);
}
export function useMessages(conversationId: string | undefined) {
  return useQuery({
    queryKey: ['chat', 'messages', conversationId],
    queryFn: () => chatApi.messages(conversationId as string),
    enabled: Boolean(conversationId),
  });
}

/* ---------------- Realtime (Socket.IO) ---------------- */
interface TypingPayload { conversationId: string; userId: string }

export function useChatRealtime(
  conversationId: string | undefined,
  onMessage: (m: Message) => void,
  onTyping?: (userId: string, isTyping: boolean) => void,
) {
  useEffect(() => {
    if (!conversationId) return;
    socketClient.emit(WS.JOIN_CONVERSATION, { conversationId });
    const offMsg = socketClient.on<Message>(WS.RECEIVE_MESSAGE, (m) => { if (m.conversationId === conversationId) onMessage(m); });
    const offStart = socketClient.on<TypingPayload>(WS.TYPING_START, (e) => { if (e.conversationId === conversationId) onTyping?.(e.userId, true); });
    const offStop = socketClient.on<TypingPayload>(WS.TYPING_STOP, (e) => { if (e.conversationId === conversationId) onTyping?.(e.userId, false); });
    return () => {
      socketClient.emit(WS.LEAVE_CONVERSATION, { conversationId });
      offMsg(); offStart(); offStop();
    };
  }, [conversationId, onMessage, onTyping]);

  const send = useCallback((body: string) => {
    if (conversationId) socketClient.emit(WS.SEND_MESSAGE, { conversationId, body, clientId: crypto.randomUUID() });
  }, [conversationId]);
  const setTyping = useCallback((isTyping: boolean) => {
    if (conversationId) socketClient.emit(isTyping ? WS.TYPING_START : WS.TYPING_STOP, { conversationId });
  }, [conversationId]);

  return { send, setTyping };
}

export function useStartDirect() {
  return useMutation({ mutationFn: (handle: string) => chatApi.startDirect(handle) });
}
export function useChatContacts() {
  return useQuery({ queryKey: ['chat', 'contacts'], queryFn: () => chatApi.contacts() });
}
export function useCreateGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { title: string; memberIds: string[] }) => chatApi.createGroup(v.title, v.memberIds),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['chat', 'conversations'] }); },
  });
}
