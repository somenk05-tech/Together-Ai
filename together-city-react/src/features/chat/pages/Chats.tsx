import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useConversations, useMessages, useChatRealtime, chatApi, socketClient, WS } from '@/api';
import { ConversationList } from '../components/ConversationList';
import { MessageThread } from '../components/MessageThread';
import { Composer } from '../components/Composer';
import { ChatStarter } from '../components/ChatStarter';
import { Spinner, EmptyState } from '@/components/ui';
import { CallButtons } from '@/features/calls/CallButtons';
import { useAuth } from '@/hooks/useAuth';
import type { Message } from '@/types';

/**
 * Chats — conversation list + real-time thread.
 * History via REST (TanStack Query); live send/receive & typing via Socket.IO.
 */
export function Chats() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const conversations = useConversations();
  const [searchParams] = useSearchParams();
  const requestedId = searchParams.get('c') ?? undefined;
  const [activeId, setActiveId] = useState<string | undefined>(requestedId);

  // activeId already initialises to the ?c=<id> deep link. Otherwise, once the
  // list loads, fall back to the first conversation.
  useEffect(() => {
    const list = conversations.data;
    if (!activeId && list && list.length > 0) setActiveId(list[0].id);
  }, [activeId, conversations.data]);

  const history = useMessages(activeId);
  const [live, setLive] = useState<Message[]>([]);
  const [peerTyping, setPeerTyping] = useState(false);
  const [statusMap, setStatusMap] = useState<Record<string, 'DELIVERED' | 'READ'>>({});
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());        // deleted for me
  const [tombstoned, setTombstoned] = useState<Set<string>>(new Set());       // deleted for everyone
  const [editsMap, setEditsMap] = useState<Record<string, Message>>({});      // live edits
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset the live buffer whenever the conversation changes.
  useEffect(() => { setLive([]); setPeerTyping(false); setStatusMap({}); setHiddenIds(new Set()); setTombstoned(new Set()); setEditsMap({}); }, [activeId]);

  // Live delivery/read receipts → advance the ticks on your sent messages.
  useEffect(() => {
    const offD = socketClient.on<{ messageId: string }>(WS.MESSAGE_DELIVERED, ({ messageId }) =>
      setStatusMap((s) => (s[messageId] === 'READ' ? s : { ...s, [messageId]: 'DELIVERED' })));
    const offR = socketClient.on<{ messageId: string }>(WS.MESSAGE_READ, ({ messageId }) =>
      setStatusMap((s) => ({ ...s, [messageId]: 'READ' })));
    return () => { offD(); offR(); };
  }, []);

  const onMessage = useCallback((m: Message) => {
    setLive((prev) => [...prev, m]);
    // A message arriving in the open conversation is read immediately.
    if (activeId && m.senderId !== user?.id) {
      socketClient.emit(WS.MESSAGE_READ, { conversationId: activeId, messageIds: [m.id] });
    }
  }, [activeId, user?.id]);
  const onTyping = useCallback((userId: string, isTyping: boolean) => {
    if (userId === user?.id) return;
    setPeerTyping(isTyping);
  }, [user?.id]);

  // Realtime deletions/edits from any device — applied instantly, no refresh.
  const onDeleted = useCallback((messageId: string) => {
    setTombstoned((s) => new Set(s).add(messageId));
  }, []);
  const onEdited = useCallback((m: Message) => {
    setEditsMap((s) => ({ ...s, [m.id]: m }));
  }, []);

  const { send, setTyping } = useChatRealtime(activeId, onMessage, onTyping, onDeleted, onEdited);

  /** Delete a message (soft delete server-side; synced across devices). */
  const deleteMessage = useCallback(async (messageId: string, scope: 'ME' | 'EVERYONE') => {
    try {
      await chatApi.deleteMessage(messageId, scope);
      if (scope === 'ME') setHiddenIds((s) => new Set(s).add(messageId));
      else setTombstoned((s) => new Set(s).add(messageId));
      void qc.invalidateQueries({ queryKey: ['chat', 'messages', activeId] });
    } catch { /* window passed or network — leave the message untouched */ }
  }, [activeId, qc]);

  const editMessage = useCallback(async (messageId: string, body: string) => {
    try {
      const updated = await chatApi.editMessage(messageId, body);
      setEditsMap((s) => ({ ...s, [messageId]: updated }));
      void qc.invalidateQueries({ queryKey: ['chat', 'messages', activeId] });
    } catch { /* edit window passed — keep original */ }
  }, [activeId, qc]);

  const emitTyping = useCallback((t: boolean) => {
    setTyping(t);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    if (t) typingTimer.current = setTimeout(() => setTyping(false), 2500);
  }, [setTyping]);

  const messages = useMemo(() => {
    const seen = new Set<string>();
    return [...(history.data?.items ?? []), ...live]
      .filter((m) => (seen.has(m.id) ? false : seen.add(m.id)))
      .filter((m) => !hiddenIds.has(m.id))                      // deleted for me → gone entirely
      .map((m) => (editsMap[m.id] ? { ...m, ...editsMap[m.id] } : m))
      .map((m) => (tombstoned.has(m.id) ? { ...m, deleted: true, body: '' } : m))
      .map((m) => (statusMap[m.id] ? { ...m, status: statusMap[m.id] } : m));
  }, [history.data, live, statusMap, hiddenIds, tombstoned, editsMap]);

  // Opening a conversation marks it read. REST reliably clears the unread badge
  // (independent of the socket); the socket read drives blue read-receipt ticks.
  useEffect(() => {
    if (!activeId || !history.data) return;
    const unreadIds = (history.data.items ?? [])
      .filter((m) => m.senderId !== user?.id)
      .map((m) => m.id);
    if (unreadIds.length) {
      socketClient.emit(WS.MESSAGE_READ, { conversationId: activeId, messageIds: unreadIds });
    }
    void chatApi.markRead(activeId)
      .then(() => qc.invalidateQueries({ queryKey: ['chat', 'conversations'] }))
      .catch(() => undefined);
  }, [activeId, history.data, user?.id, qc]);

  if (conversations.isLoading) return <Spinner label="Loading your chats…" />;
  if (conversations.isError) return <EmptyState title="Couldn't load chats" hint="Start the backend and reload." />;

  const list = conversations.data ?? [];
  const onOpened = (id: string) => { setActiveId(id); void conversations.refetch(); };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', height: 'calc(100vh - var(--header-h) - var(--safe-top))', overflow: 'hidden' }}>
      <div style={{ display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--line)', minHeight: 0, overflowY: 'auto' }}>
        <ChatStarter onOpened={onOpened} />
        {list.length === 0
          ? <p className="muted" style={{ fontSize: 13, padding: '16px 16px' }}>
              No conversations yet. Start one above, or open a member’s profile and tap Message.
            </p>
          : <ConversationList items={list} activeId={activeId} onSelect={setActiveId} />}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
        {activeId ? (
          <>
            {/* A slim thread header. It exists mainly to give calling a home —
                the thread itself had no bar to hang anything on. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid var(--line)' }}>
              <div style={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: 14.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {list.find((c) => c.id === activeId)?.title || 'Conversation'}
              </div>
              <CallButtons conversationId={activeId} compact />
            </div>
            {history.isLoading
              ? <Spinner />
              : <MessageThread messages={messages} currentUserId={user?.id} typing={peerTyping} onDelete={deleteMessage} onEdit={editMessage} />}
            <Composer onSend={send} onTyping={emitTyping} />
          </>
        ) : (
          <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}>
            <EmptyState icon="💬" title="No conversation selected" hint="Start a chat, or message someone from their profile." />
          </div>
        )}
      </div>
    </div>
  );
}
