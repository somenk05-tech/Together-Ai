import { z } from 'zod';
import { useCallback, useEffect, useMemo } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPost, apiPut } from './http';
import { socketClient, WS } from './socket';
import { useAuthed } from '@/store/useAuthed';
import {
  ConversationSchema, MessagePageSchema, MessageSchema,
  type Conversation, type Message, type MessagePage, type ShareCard,
} from './schemas';

const ContactSchema = z.object({ id: z.string(), handle: z.string(), name: z.string(), profileImage: z.string().nullable().optional() });
export type Contact = z.infer<typeof ContactSchema>;

/** What the composer hands the socket after the bytes are already in storage.
 *  Mirrors the API's AttachmentSchema — url, size and mimeType are required
 *  there, so they are required here rather than discovered by a 400. */
export interface OutgoingAttachment {
  url: string;
  mimeType: string;
  size: number;
  name?: string;
  duration?: number;
}

/** The message type a set of attachments makes it. The server stores it on the
 *  row; a mixed send is a FILE message, because that is the honest floor. */
function messageTypeFor(list: OutgoingAttachment[]): 'IMAGE' | 'VIDEO' | 'VOICE' | 'FILE' {
  const every = (p: string) => list.every((a) => a.mimeType.startsWith(p));
  if (every('image/')) return 'IMAGE';
  if (every('video/')) return 'VIDEO';
  if (every('audio/')) return 'VOICE';
  return 'FILE';
}

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
  markRead: (conversationId: string): Promise<{ ok: boolean }> =>
    apiPost(`/chat/${conversationId}/read`, {}, z.object({ ok: z.boolean() })),
  /**
   * Remove a conversation from MY left panel. Deliberately not called
   * `deleteConversation`: the server sets clearedAt on my own membership row
   * and nothing else. The other people in the thread keep it, the messages are
   * not destroyed, and it returns to my panel the moment somebody writes to it
   * again. The UI copy has to say that, so the method name may as well too.
   */
  clearConversation: (conversationId: string): Promise<{ ok: boolean }> =>
    apiDelete(`/chat/${conversationId}`, z.object({ ok: z.boolean() })),
  deleteMessage: (messageId: string, scope: 'ME' | 'EVERYONE'): Promise<{ deleted: boolean; scope: string }> =>
    apiDelete(`/messages/${messageId}`, z.object({ deleted: z.boolean(), scope: z.string() }), { data: { scope } }),
  editMessage: (messageId: string, body: string): Promise<Message> =>
    apiPut(`/messages/${messageId}`, { text: body }, MessageSchema),
};

/* ---------------- React Query hooks ---------------- */
export function useConversations() {
  // Signed out, there is nobody to have conversations. Without this the header's
  // unread badge polls this endpoint every fifteen seconds on every page,
  // including the sign-in page, and every call is a 401. See useAuthed.
  const authed = useAuthed();
  return useQuery({
    queryKey: ['chat', 'conversations'],
    queryFn: () => chatApi.conversations(),
    enabled: authed,
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
/**
 * A CONVERSATION IS NOT ITS LAST THIRTY MESSAGES.
 *
 * This was a flat `useQuery` that asked for one page and threw the cursor away.
 * The server has always returned `nextCursor`, the schema has always carried
 * it, and nothing has ever read it — so a thread with a hundred messages showed
 * the newest thirty and the rest were simply unreachable from the UI. Not lost,
 * not deleted: unreachable, which is worse, because nothing says so.
 *
 * The shape of the return is kept deliberately: `data.items` and
 * `data.nextCursor`, so the two existing readers (Chats, DatingChats) do not
 * change. `fetchNextPage` / `hasNextPage` are the new surface — pages are
 * flattened oldest-first, which is the order the transcript renders in.
 */
export function useMessages(conversationId: string | undefined) {
  const q = useInfiniteQuery({
    queryKey: ['chat', 'messages', conversationId],
    queryFn: ({ pageParam }) => chatApi.messages(conversationId as string, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: MessagePage) => last.nextCursor ?? undefined,
    enabled: Boolean(conversationId),
  });
  // Page 0 is the newest window; page N is older still. Reversing the pages and
  // concatenating gives one oldest→newest transcript.
  const items = useMemo(
    () => (q.data?.pages ?? []).slice().reverse().flatMap((p) => p.items),
    [q.data],
  );
  return {
    ...q,
    data: q.data ? { items, nextCursor: q.data.pages[q.data.pages.length - 1]?.nextCursor ?? null } : undefined,
  };
}

/* ---------------- Realtime (Socket.IO) ---------------- */
interface TypingPayload { conversationId: string; userId: string }

export function useChatRealtime(
  conversationId: string | undefined,
  onMessage: (m: Message) => void,
  onTyping?: (userId: string, isTyping: boolean) => void,
  onDeleted?: (messageId: string) => void,
  onEdited?: (m: Message) => void,
) {
  useEffect(() => {
    if (!conversationId) return;
    socketClient.emit(WS.JOIN_CONVERSATION, { conversationId });
    /* AND AGAIN ON EVERY RECONNECT. Socket.IO rooms belong to a CONNECTION, and
       this effect is keyed on the conversation id — so a thread opened once and
       left open asked to join exactly once, and a wifi blip or a backend deploy
       handed it a fresh connection that had joined nothing. The thread stayed
       on screen and went quiet. CallCenter has always re-synced on `connect`;
       chat was the one place that did not.
       The server now re-joins these rooms itself on handshake, which is the
       real fix — this is the belt to that pair of braces, and it costs one
       listener. */
    const sock = socketClient.raw();
    const rejoin = () => socketClient.emit(WS.JOIN_CONVERSATION, { conversationId });
    sock.on('connect', rejoin);
    const offMsg = socketClient.on<Message>(WS.RECEIVE_MESSAGE, (m) => { if (m.conversationId === conversationId) onMessage(m); });
    const offStart = socketClient.on<TypingPayload>(WS.TYPING_START, (e) => { if (e.conversationId === conversationId) onTyping?.(e.userId, true); });
    const offStop = socketClient.on<TypingPayload>(WS.TYPING_STOP, (e) => { if (e.conversationId === conversationId) onTyping?.(e.userId, false); });
    const offDel = socketClient.on<{ messageId: string }>(WS.MESSAGE_DELETED, ({ messageId }) => onDeleted?.(messageId));
    const offEdit = socketClient.on<Message>(WS.MESSAGE_EDITED, (m) => { if (m.conversationId === conversationId) onEdited?.(m); });
    return () => {
      socketClient.emit(WS.LEAVE_CONVERSATION, { conversationId });
      sock.off('connect', rejoin);
      offMsg(); offStart(); offStop(); offDel(); offEdit();
    };
  }, [conversationId, onMessage, onTyping, onDeleted, onEdited]);

  /**
   * Send text, attachments, or both.
   *
   * The socket schema has accepted `attachments` and `messageType` since it was
   * written — SocketSendSchema IS SendMessageSchema, which permits a message
   * with no text so long as it carries an attachment. The web simply never
   * offered a way to make one, so voice notes and files were a backend that
   * nothing could reach.
   */
  const send = useCallback((body: string, attachments?: OutgoingAttachment[]) => {
    if (!conversationId) return;
    const list = attachments?.length ? attachments : undefined;
    socketClient.emit(WS.SEND_MESSAGE, {
      conversationId,
      body,
      clientId: crypto.randomUUID(),
      ...(list ? { attachments: list, messageType: messageTypeFor(list) } : null),
    });
  }, [conversationId]);
  const setTyping = useCallback((isTyping: boolean) => {
    if (conversationId) socketClient.emit(isTyping ? WS.TYPING_START : WS.TYPING_STOP, { conversationId });
  }, [conversationId]);

  return { send, setTyping };
}

/**
 * Clear a conversation from your own panel.
 *
 * The list is invalidated rather than filtered locally: the server decides what
 * belongs in the panel — a thread that has a message newer than my clear stays
 * — and a client that guessed would show a row the next poll took away.
 */
export function useClearConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (conversationId: string) => chatApi.clearConversation(conversationId),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['chat', 'conversations'] }); },
  });
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
