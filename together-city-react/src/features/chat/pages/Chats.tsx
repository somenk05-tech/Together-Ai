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

  // Honour a ?c=<id> deep link (e.g. "Message" from the member finder) as soon
  // as that conversation shows up in the list; otherwise fall back to the first.
  useEffect(() => {
    const list = conversations.data;
    if (!list || list.length === 0) return;
    if (requestedId && list.some((c) => c.id === requestedId)) {
      setActiveId(requestedId);
    } else if (!activeId) {
      setActiveId(list[0].id);
    }
  }, [activeId, requestedId, conversations.data]);

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
  if (!conversations.data || conversations.data.length === 0) {
    return <EmptyState icon="💬" title="No conversations yet" hint="Connect with people across the city to start chatting." />;
  }

  const onOpened = (id: string) => { setActiveId(id); void conversations.refetch(); };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', height: 'calc(100vh - var(--header-h))' }}>
      <div style={{ display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--line)', minHeight: 0 }}>
        <ChatStarter onOpened={onOpened} />
        <ConversationList items={conversations.data} activeId={activeId} onSelect={setActiveId} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {history.isLoading
          ? <Spinner />
          : <MessageThread messages={messages} currentUserId={user?.id} typing={peerTyping} />}
        <Composer onSend={send} onTyping={emitTyping} />
      </div>
    </div>
  );
}
