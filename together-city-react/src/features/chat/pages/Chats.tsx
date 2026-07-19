import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useConversations, useMessages, useChatRealtime } from '@/api';
import { ConversationList } from '../components/ConversationList';
import { MessageThread } from '../components/MessageThread';
import { Composer } from '../components/Composer';
import { ChatStarter } from '../components/ChatStarter';
import { Spinner, EmptyState } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import type { Message } from '@/types';

/**
 * Chats — conversation list + real-time thread.
 * History via REST (TanStack Query); live send/receive & typing via Socket.IO.
 */
export function Chats() {
  const { user } = useAuth();
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
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset the live buffer whenever the conversation changes.
  useEffect(() => { setLive([]); setPeerTyping(false); }, [activeId]);

  const onMessage = useCallback((m: Message) => setLive((prev) => [...prev, m]), []);
  const onTyping = useCallback((userId: string, isTyping: boolean) => {
    if (userId === user?.id) return;
    setPeerTyping(isTyping);
  }, [user?.id]);

  const { send, setTyping } = useChatRealtime(activeId, onMessage, onTyping);

  const emitTyping = useCallback((t: boolean) => {
    setTyping(t);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    if (t) typingTimer.current = setTimeout(() => setTyping(false), 2500);
  }, [setTyping]);

  const messages = useMemo(() => [...(history.data?.items ?? []), ...live], [history.data, live]);

  if (conversations.isLoading) return <Spinner label="Loading your chats…" />;
  if (conversations.isError) return <EmptyState title="Couldn't load chats" hint="Start the backend and reload." />;

  const list = conversations.data ?? [];
  const onOpened = (id: string) => { setActiveId(id); void conversations.refetch(); };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', height: 'calc(100vh - var(--header-h))' }}>
      <div style={{ display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--line)', minHeight: 0 }}>
        <ChatStarter onOpened={onOpened} />
        {list.length === 0
          ? <p className="muted" style={{ fontSize: 13, padding: '16px 16px' }}>
              No conversations yet. Start one above, or open a member’s profile and tap Message.
            </p>
          : <ConversationList items={list} activeId={activeId} onSelect={setActiveId} />}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {activeId ? (
          <>
            {history.isLoading
              ? <Spinner />
              : <MessageThread messages={messages} currentUserId={user?.id} typing={peerTyping} />}
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
