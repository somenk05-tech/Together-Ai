import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useConversations, useMessages, useChatRealtime, useClearConversation, useMessageSearch, useOnlineContacts, usePinnedMessage, chatApi, socketClient, WS, type OutgoingAttachment } from '@/api';
import { ConversationList } from '../components/ConversationList';
import { MiraRow } from '../mira/MiraRow';
import { MiraThread } from '../mira/MiraThread';
import { MiraConfidant } from '../mira/MiraConfidant';
import { MiraMark } from '../mira/MiraMark';

/**
 * Mira is selected by a sentinel id rather than a conversation row.
 *
 * She is not a Conversation — `Message.senderId` is a foreign key to `User`,
 * so a Mira thread would need a synthetic user, and that row would surface in
 * the people directory, in connections and in the dating pool. "Top tab" is a
 * position in this list, not a shape in the database.
 */
const MIRA_ID = '__mira__';

/**
 * THE STAGE TAKES A COLOUR. Eight palettes from the owner's cards, plus the
 * slate the stage ships in. A theme is a `data-stage` attribute on the stage
 * element — the token blocks in tokens.css do all the painting, each one
 * re-stating the FULL set of stage tokens with its own measured inks, so a
 * theme can never re-ground the room while keeping the wrong ink. Mira's
 * room has its own tokens and takes no theme: she stays red.
 *
 * The swatch colours live in tokens.css with the theme blocks (`.cstheme
 * [data-t=...]`) — relief.spec bans colour literals in page files, and it
 * is right to: a hex here and a hex there is how two swatches drift.
 */
const STAGE_THEMES = [
  { id: 'slate', name: 'Slate' },
  { id: 'navy', name: 'Navy Mirage' },
  { id: 'emerald', name: 'Emerald Depth' },
  { id: 'mandarin', name: 'Mandarin Curd' },
  { id: 'rose', name: 'Rose Mascarpone' },
  { id: 'peach', name: 'Peach Glaze' },
  { id: 'pistachio', name: 'Pistachio Mint Cream' },
  { id: 'lavender', name: 'Lavender Cream' },
  { id: 'cream', name: 'Cream Veil' },
] as const;
type StageTheme = (typeof STAGE_THEMES)[number]['id'];
const THEME_KEY = 'chat.stage';
const storedTheme = (): StageTheme => {
  const t = localStorage.getItem(THEME_KEY);
  return STAGE_THEMES.some((s) => s.id === t) ? (t as StageTheme) : 'slate';
};
import { MessageThread, ConfirmDelete, withinWindow } from '../components/MessageThread';
import { Composer } from '../components/Composer';
import { ChatStarter } from '../components/ChatStarter';
import { GroupPanel } from '../components/GroupPanel';
import { ForwardPanel } from '../components/ForwardPanel';
import { Spinner, EmptyState } from '@/components/ui';
import { CallButtons } from '@/features/calls/CallButtons';
import { useAuth } from '@/hooks/useAuth';
import { useChatRoom } from '@/hooks/useChatRoom';
import { useScaleLock } from '@/hooks/useScaleLock';
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
  const clear = useClearConversation();
  /* A PHONE SHOWS ONE ROOM AT A TIME (WhatsApp's rule, and the owner's).
     The stage is a two-column desk: a list beside a thread. Below 860px it
     already collapsed to one column — but one column holding BOTH, so a
     phone got a squeezed list stacked on a squeezed thread and neither was
     usable. Here the list IS the screen until a conversation is opened, and
     then the thread is, with a back arrow that returns. Decided at mount,
     like every other phone branch in this app. */
  const phone = typeof window !== 'undefined' && window.matchMedia('(max-width: 899px)').matches;
  // Whether the "open the first thread" fallback has already fired.
  const autoPicked = useRef(false);

  // activeId already initialises to the ?c=<id> deep link. Otherwise, once the
  // list loads, fall back to the first conversation — ONCE. Without the latch
  // this effect re-fires every time activeId goes empty, which now happens when
  // a citizen removes the thread they were reading: they would be dropped
  // straight into somebody else's conversation with the composer still focused.
  useEffect(() => {
    const list = conversations.data;
    // On a phone the list is the screen; opening the newest thread on arrival
    // would hide it. The ?c= deep link still opens straight into a thread.
    // The latch stays FIRST in this condition: remove-chat-not-delete.test.ts
    // asserts that opening literally, and it is asserting the right thing.
    if (autoPicked.current || activeId || phone || !list || list.length === 0) return;
    autoPicked.current = true;
    setActiveId(list[0].id);
  }, [activeId, conversations.data, phone]);

  /* AN OPEN CHAT IS THE WHOLE SCREEN (owner, 9 Aug).
     A thread is a room you are inside, not a panel inside a website: the
     city's header and its dock belong to the city, and while you are reading
     one conversation they are two rows of chrome charging rent. The flag goes
     on <html> rather than on this subtree because what it hides — header,
     dock, the floating search — are all outside it. It is removed the moment
     the thread closes or the page unmounts, so no other screen can inherit a
     hidden header. */
  /* THE LIST IS A SCREEN, NOT A DOCUMENT. Nobody wants to zoom a list of
     names, and a list that scales while the thread behind it does not is two
     applications wearing one coat. Held for the whole page; the room asks for
     it a second time and the count sorts them out. */
  useScaleLock();
  /* And the room itself — the flag, the visible-viewport measurement, its own
     hold on the scale lock — is in useChatRoom, because the Dating hub holds
     conversations too and a conversation is one act wherever you have it. */
  // Mira is not a conversation, so nothing that expects one may fire for her:
  // joining a socket room named after a row that does not exist, and fetching
  // its messages, would be a bogus join and a 404 on every keystroke.
  const isMira = activeId === MIRA_ID;
  const convId = isMira ? undefined : activeId;

  useChatRoom(Boolean(convId));

  const history = useMessages(convId);
  const [live, setLive] = useState<Message[]>([]);
  const [peerTyping, setPeerTyping] = useState(false);
  const [statusMap, setStatusMap] = useState<Record<string, 'DELIVERED' | 'READ'>>({});
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());        // deleted for me
  const [tombstoned, setTombstoned] = useState<Set<string>>(new Set());       // deleted for everyone
  const [editsMap, setEditsMap] = useState<Record<string, Message>>({});      // live edits
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Message ids this session has already asked to mark read — each id is
   *  acknowledged once per opened thread, never per render. */
  const ackedRead = useRef<Set<string>>(new Set());
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [kw, setKw] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [jumpToId, setJumpToId] = useState<string | null>(null);
  const [jumpNote, setJumpNote] = useState<string | null>(null);
  const [starredOnly, setStarredOnly] = useState(false);
  const hits = useMessageSearch(activeId, kw, from || undefined, to || undefined, starredOnly);

  /* PRESENCE HAD TWO IMPLEMENTATIONS AND NO AUDIENCE. The gateway works out an
     online/offline transition and broadcasts it to every conversation the
     citizen shares — and nothing listened. `useOnlineContacts` calls
     GET /users/online and nothing called IT. Both are read here: the REST list
     answers "are they here now" on open, which a socket frame cannot because it
     only ever reports a CHANGE, and the frames keep it true afterwards. */
  const onlineNow = useOnlineContacts();
  const peerId = useMemo(() => {
    const convo = (conversations.data ?? []).find((c) => c.id === activeId);
    if (!convo || convo.isGroup) return undefined;   // a group has no single "they"
    return (convo.participantIds ?? []).find((id) => id !== user?.id);
  }, [conversations.data, activeId, user?.id]);
  const [peerOnline, setPeerOnline] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  /* MIRA, INVITED INTO THIS CONVERSATION. Her mark in the header opens a side
     panel that reads THIS thread — and only this thread. The scope is
     structural rather than behavioural: what she reads is `confideTranscript`
     below, the same window this screen already renders, handed over as a
     prop at ask time. The panel fetches nothing and keeps nothing. */
  const [confide, setConfide] = useState(false);
  /* The chosen colour, held per device — a preference about this screen,
     like the day store, not a fact the server needs. */
  const [stageTheme, setStageTheme] = useState<StageTheme>(() => storedTheme());
  const pickTheme = (id: StageTheme) => {
    setStageTheme(id);
    localStorage.setItem(THEME_KEY, id);
  };
  /* Forwarding takes a LIST now, always. One message is a list of one — the
     alternative is a union the panel would have to narrow on every read. */
  const [forwarding, setForwarding] = useState<Message[] | null>(null);
  /* WHAT IS PICKED LIVES HERE. The bulk bar replaces the conversation header,
     which this page owns; a selection held inside MessageThread would have to
     be lifted out again on the first render of that bar. Ids rather than
     messages, so an edit, a receipt or a tombstone arriving mid-selection
     cannot leave a stale copy of a message sitting in the set. */
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDelete, setBulkDelete] = useState(false);
  /* Its own map rather than a partial written into editsMap, which is typed as
     whole Messages: a reaction frame carries only the list, and widening that
     map to accept fragments would let a half-message through it later. */
  const [reactionsMap, setReactionsMap] = useState<Record<string, Message['reactions']>>({});
  const pinned = usePinnedMessage(activeId);
  const activeIsGroup = useMemo(
    () => Boolean((conversations.data ?? []).find((c) => c.id === activeId)?.isGroup),
    [conversations.data, activeId],
  );
  useEffect(() => {
    setPeerOnline(Boolean(peerId && (onlineNow.data ?? []).includes(peerId)));
  }, [peerId, onlineNow.data]);
  useEffect(() => {
    if (!peerId) return;
    const on = socketClient.on<{ userId: string }>(WS.USER_ONLINE, ({ userId }) => { if (userId === peerId) setPeerOnline(true); });
    const off = socketClient.on<{ userId: string }>(WS.USER_OFFLINE, ({ userId }) => { if (userId === peerId) setPeerOnline(false); });
    return () => { on(); off(); };
  }, [peerId]);

  // Reset the live buffer whenever the conversation changes.
  useEffect(() => { setLive([]); setPeerTyping(false); setStatusMap({}); setHiddenIds(new Set()); setTombstoned(new Set()); setEditsMap({}); ackedRead.current = new Set(); setReplyTo(null); setSearchOpen(false); setKw(''); setFrom(''); setTo(''); setJumpToId(null); setJumpNote(null); setStarredOnly(false); setSelected(new Set()); setBulkDelete(false); setReactionsMap({}); setConfide(false); }, [activeId]);

  /* THE WHOLE LIST ARRIVES, so this assigns rather than merges. A frame that
     said "+1 on 👍" would need a correct count to add to, and one dropped frame
     would leave the room wrong for as long as the thread stayed open. */
  useEffect(() => {
    const off = socketClient.on<{ messageId: string; reactions: Message['reactions'] }>(
      WS.MESSAGE_REACTED,
      ({ messageId, reactions }) => setReactionsMap((s) => ({ ...s, [messageId]: reactions })),
    );
    return off;
  }, []);
  /* A pin is one row for the whole room, so the frame is a nudge and the
     refetch is the truth — it also has to reach the banner when the pinned
     message is older than anything loaded, which no frame can carry. */
  useEffect(() => {
    if (!activeId) return;
    const off = socketClient.on<{ conversationId: string }>(WS.MESSAGE_PINNED, ({ conversationId }) => {
      if (conversationId === activeId) void qc.invalidateQueries({ queryKey: ['chat', 'pinned', activeId] });
    });
    return off;
  }, [activeId, qc]);

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
    if (activeId && m.senderId !== user?.id && !ackedRead.current.has(m.id)) {
      ackedRead.current.add(m.id);
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

  /* A reply is a send that remembers. The state is cleared BEFORE the emit so
     a slow socket cannot leave the bar sitting over the composer looking like
     the next message will quote it too. */
  /* THE SHARE ARGUMENT IS ACCEPTED AND NOT FORWARDED, ON PURPOSE.
     
     `send` takes three arguments in this branch. A fourth — a share card —
     exists in an in-progress change to chat.api.ts that has not landed, and
     this call site went out ahead of it: the build passed locally against the
     modified file and failed on Vercel against the committed one, which is the
     one way a half-landed feature can pass every gate on the machine that
     wrote it.
     
     Nothing is lost by dropping it. The share control lives in Composer.tsx,
     which has not landed either, so no caller in this branch can supply one.
     The parameter is dropped rather than accepted-and-ignored: eslint has no
     underscore exemption here, and a callback taking fewer arguments is still
     assignable where more are expected — so Composer's `onSend` type continues
     to accept this, share and all, and the working tree keeps compiling. When
     the share work lands, the parameter and the fourth argument come back
     together. */
  const sendWithReply = useCallback((body: string, attachments?: OutgoingAttachment[]) => {
    const answering = replyTo?.id;
    setReplyTo(null);
    send(body, attachments, answering);
  }, [send, replyTo]);

  /* JUMPING TO A MESSAGE THAT IS NOT LOADED YET. A search hit can be a hundred
     messages back, and telling somebody "it is further up" while refusing to
     go there is the kind of answer that makes a feature not worth opening. So
     this walks history backwards a page at a time until the id is on screen —
     bounded, because a thread with thousands of messages should give up rather
     than fetch all night. */
  const jumpTo = useCallback(async (messageId: string) => {
    setJumpNote(null);
    for (let i = 0; i < 12; i++) {
      if (document.querySelector(`[data-mid="${CSS.escape(messageId)}"]`)) {
        setSearchOpen(false);
        setJumpToId(null);
        window.setTimeout(() => setJumpToId(messageId), 0);
        return;
      }
      if (!history.hasNextPage) break;
      await history.fetchNextPage();
      await new Promise((r) => window.setTimeout(r, 80));
    }
    setJumpNote('That message is further back than this conversation will load.');
  }, [history]);

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

  /* A star is optimistic on purpose: it is the reader's own bookkeeping, the
     server cannot refuse it for a message they can see, and a star that waits
     for a round trip feels broken on a phone. The refetch behind it is what
     makes it true. */
  const starMessage = useCallback(async (m: Message, on: boolean) => {
    setEditsMap((s) => ({ ...s, [m.id]: { ...(s[m.id] ?? m), starred: on } }));
    try {
      await chatApi.starMessage(m.id, on);
      void qc.invalidateQueries({ queryKey: ['chat', 'search', activeId] });
    } catch {
      setEditsMap((s) => ({ ...s, [m.id]: { ...(s[m.id] ?? m), starred: !on } }));
    }
  }, [activeId, qc]);

  /* Optimistic for the same reason a star is: the server cannot refuse a
     reaction on a message you can already see, and one that waits for a round
     trip feels broken on a phone. ONE PER PERSON is applied here too, so the
     chip you had disappears in the same frame the new one appears — the server
     is agreeing with the screen rather than correcting it. */
  const reactToMessage = useCallback(async (m: Message, emoji: string | null) => {
    const before = reactionsMap[m.id] ?? m.reactions ?? [];
    const me = user?.id;
    if (!me) return;
    const stripped = before
      .map((r) => ({ emoji: r.emoji, userIds: r.userIds.filter((id) => id !== me) }))
      .filter((r) => r.userIds.length > 0);
    const optimistic = emoji
      ? (stripped.some((r) => r.emoji === emoji)
          ? stripped.map((r) => (r.emoji === emoji ? { ...r, userIds: [...r.userIds, me] } : r))
          : [...stripped, { emoji, userIds: [me] }].sort((a, b) => a.emoji.localeCompare(b.emoji)))
      : stripped;
    setReactionsMap((s) => ({ ...s, [m.id]: optimistic }));
    try {
      const res = await chatApi.reactToMessage(m.id, emoji);
      setReactionsMap((s) => ({ ...s, [m.id]: res.reactions }));
    } catch {
      setReactionsMap((s) => ({ ...s, [m.id]: before }));
    }
  }, [reactionsMap, user?.id]);

  /* A pin is NOT optimistic. It changes what the whole room sees and it
     silently unpins somebody else's choice, so the banner should say what the
     server did rather than what this tab hoped — and the refetch is one row. */
  const pinMessage = useCallback(async (m: Message, on: boolean) => {
    try {
      await chatApi.pinMessage(m.id, on);
    } finally {
      void pinned.refetch();
    }
  }, [pinned]);

  /* Flag it and LEAVE. Staying in an open thread you have just marked unread
     is a contradiction the next render would have to resolve, and it would
     resolve it by marking it read again — the effect above does exactly that
     on open. So the gesture closes the room, which is also what somebody means
     by it: I am done here for now. */
  const leaveUnread = useCallback(async (id: string) => {
    await chatApi.markConversationUnread(id).catch(() => undefined);
    setActiveId(undefined);
    void conversations.refetch();
  }, [conversations]);

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
      .map((m) => (statusMap[m.id] ? { ...m, status: statusMap[m.id] } : m))
      .map((m) => (reactionsMap[m.id] ? { ...m, reactions: reactionsMap[m.id] } : m));
  }, [history.data, live, statusMap, hiddenIds, tombstoned, editsMap, reactionsMap]);

  /* The picked messages, in thread order, resolved from the live list on every
     render. Anything that has left the thread while it was picked — deleted for
     me, or cleared with the conversation — simply stops being in here, so the
     bar can never act on a message that is no longer on screen. */
  const picked = useMemo(() => messages.filter((m) => selected.has(m.id)), [messages, selected]);

  /* THE WINDOW MIRA MAY READ: this thread as this screen shows it — deletions
     and tombstones already applied, attachments-only rows dropped because she
     reads words. The last forty turns, the same bound the server enforces, so
     a long thread hands her a window rather than an archive. Sides are told
     apart the way the bubbles are: yours is `senderId === user.id`. */
  const confideTranscript = useMemo(() =>
    messages
      .filter((m) => !m.deleted && m.body)
      .slice(-40)
      .map((m) => ({
        who: m.senderId === user?.id ? ('me' as const) : ('them' as const),
        text: (m.body ?? '').slice(0, 1000),
      })),
  [messages, user?.id]);
  const toggleSelect = useCallback((m: Message) => {
    setSelected((s) => {
      const next = new Set(s);
      // delete() reports whether it removed anything, which is the toggle.
      if (!next.delete(m.id)) next.add(m.id);
      return next;
    });
  }, []);

  /* DELETE FOR EVERYONE IS ALL OR NOTHING. It is offered only when every picked
     message is yours and still inside the 15-minute window — the same
     `withinWindow` the thread asks about one message, imported rather than
     restated. Applying it to the eligible half and quietly downgrading the rest
     would be a delete whose outcome nobody could state afterwards, and "some of
     them are gone for everyone" is not a sentence anybody should have to work
     out from a list of bubbles. */
  const allMine = picked.length > 0 && picked.every((m) => m.senderId === user?.id);
  const canDeleteForEveryone = allMine && picked.every((m) => !m.deleted && withinWindow(m));

  /* Sequential, and the selection is emptied FIRST: a bar counting down while
     its own messages disappear underneath it is a control describing something
     that has stopped being true. Each call swallows its own failure exactly as
     the single delete does, so a message the window closed on stays put. */
  const deleteSelected = useCallback(async (scope: 'ME' | 'EVERYONE') => {
    const ids = picked.map((m) => m.id);
    setBulkDelete(false);
    setSelected(new Set());
    for (const id of ids) await deleteMessage(id, scope);
  }, [picked, deleteMessage]);

  /* A RECEIPT IS SENT ONCE, FOR SOMETHING NOT YET READ.
     This effect used to ack EVERY loaded message on every change of
     `history.data` — and the app-wide receipt listener refetches the thread on
     receipt frames, so the acks caused the very data changes that re-fired the
     acks: an open thread never went quiet (13 Aug audit). Three dampeners now:
     only messages not already READ, each id acked once per opened thread
     (ackedRead), and batches capped at the socket schema's 500. The server
     adds the fourth — a receipt is only published for a row that moved. */
  useEffect(() => {
    if (!activeId || !history.data) return;
    const unreadIds = (history.data.items ?? [])
      .filter((m) => m.senderId !== user?.id && m.status !== 'READ' && !ackedRead.current.has(m.id))
      .map((m) => m.id);
    for (const id of unreadIds) ackedRead.current.add(id);
    for (let i = 0; i < unreadIds.length; i += 500) {
      socketClient.emit(WS.MESSAGE_READ, { conversationId: activeId, messageIds: unreadIds.slice(i, i + 500) });
    }
  }, [activeId, history.data, user?.id]);
  // Opening a conversation clears its badge ONCE, by REST — the server advances
  // lastReadAt to the newest message's own timestamp, never to the clock.
  useEffect(() => {
    if (!activeId) return;
    void chatApi.markRead(activeId)
      .then(() => qc.invalidateQueries({ queryKey: ['chat', 'conversations'] }))
      .catch(() => undefined);
  }, [activeId, qc]);

  if (conversations.isLoading) return <Spinner label="Loading your chats…" />;
  if (conversations.isError) return <EmptyState title="Couldn't load chats" hint="Every conversation is still there — this didn’t reach us. Try again in a moment." />;

  const list = conversations.data ?? [];
  const onOpened = (id: string) => { setActiveId(id); void conversations.refetch(); };

  /**
   * Remove a conversation from this citizen's panel.
   *
   * If it was the open one, the right-hand side has to move somewhere, and it
   * moves to nothing rather than to the next thread down. Landing you in
   * somebody else's conversation immediately after you removed one is how a
   * message gets sent to the wrong person — the pane you were typing into is
   * now a different thread and it did not announce itself.
   */
  const onRemove = (id: string) => {
    clear.mutate(id, {
      onSuccess: () => { if (activeId === id) setActiveId(undefined); },
    });
  };

  const activeTitle = list.find((c) => c.id === activeId)?.title || 'Conversation';
  const pinnedMsg = pinned.data?.pinned ?? null;

  return (
    /* THE STAGE. A dark panel laid on the city's white page, not a re-pointed
       ground — see the rationale beside the tokens. `data-hub="chat"` gives
       the hub its own accent for anything that still reads one; it touches no
       ground token, so it costs no grant. */
    <div className="page" data-hub="chat" style={{ paddingBottom: 18 }}>
      {/* `bleed` is the page grid's own hatch — .page > .bleed spans all
          three columns, which is how a room touches both edges of a phone
          without a negative margin fighting the gutter. */}
      <div className={`cstage${phone ? (activeId ? ' is-thread bleed' : ' is-list') : ''}`}
        data-stage={stageTheme}
        style={{ height: phone
          ? (activeId ? 'var(--tc-vvh, 100dvh)' : 'calc(100dvh - var(--header-h) - var(--safe-top) - var(--safe-bottom) - 24px)')
          : 'calc(100dvh - var(--header-h) - var(--safe-top) - 42px)' }}>
        {!(phone && activeId) && (
        <aside className="cslist">
          <div className="cshead">
            <h2>Chats</h2>
            <p>Together City</p>
            {/* The stage's colours, one tap each. Swatches rather than names
                because the colour IS the name; the name rides in the label
                for anyone listening instead of looking. */}
            <div className="cstheme" role="group" aria-label="Chat colour">
              {STAGE_THEMES.map((t) => (
                <button key={t.id} type="button" title={t.name} data-t={t.id}
                  aria-label={`Colour: ${t.name}`}
                  aria-pressed={stageTheme === t.id}
                  className={stageTheme === t.id ? 'on' : undefined}
                  onClick={() => pickTheme(t.id)} />
              ))}
            </div>
          </div>
          <ChatStarter onOpened={onOpened} />
          <MiraRow active={activeId === MIRA_ID} onSelect={() => setActiveId(MIRA_ID)} />
          {list.length === 0
            ? <p style={{ fontSize: 13, padding: '4px 18px 18px', color: 'var(--on-stage-faint)', lineHeight: 1.55 }}>
                No conversations yet. Start one above, or open a member’s profile and tap Message.
              </p>
            : <ConversationList items={list} activeId={activeId} onSelect={setActiveId}
                onRemove={onRemove} removingId={clear.isPending ? clear.variables : undefined} />}
        </aside>
        )}

        {!(phone && !activeId) && (
        <section className="csthread">
          {activeId === MIRA_ID ? (
            <MiraThread />
          ) : activeId ? (
            <>
              <div className="cshead-t">
                {/* THE BULK BAR REPLACES THE HEADER — it does not float. The
                    composer is fixed to a locked visual viewport on a phone,
                    and a bar hovering above it is the one piece of chrome
                    guaranteed to end up under a keyboard. Taking the header's
                    place costs nothing: while you are picking messages, the
                    name of the room and its call buttons are not what this row
                    is for, and it is exactly where somebody is already looking
                    for the way out. */}
                {picked.length > 0 ? (
                  <>
                    <button type="button" className="csback" aria-label="Cancel selection"
                      onClick={() => setSelected(new Set())}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                    </button>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <b style={{ display: 'block' }}>{picked.length} selected</b>
                      <em>{picked.length === 1 ? 'Tap another to add it' : 'Tap one again to drop it'}</em>
                    </div>
                    <button type="button" className="cstool" style={{ flex: 'none' }} title="Forward"
                      aria-label={`Forward ${picked.length} selected message${picked.length > 1 ? 's' : ''}`}
                      onClick={() => setForwarding(picked)}>⤳</button>
                    <button type="button" className="cstool" style={{ flex: 'none' }} title="Delete"
                      aria-label={`Delete ${picked.length} selected message${picked.length > 1 ? 's' : ''}`}
                      onClick={() => setBulkDelete(true)}>🗑</button>
                  </>
                ) : (
                <>
                {phone && (
                  <button type="button" className="csback" aria-label="Back to chats"
                    onClick={() => setActiveId(undefined)}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
                  </button>
                )}
                <span className="csav">{activeTitle.split(/[\s·]+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase()}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {activeIsGroup ? (
                    <button type="button" onClick={() => setGroupOpen(true)}
                      aria-label="Group members and settings"
                      style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none',
                        padding: 0, font: 'inherit', color: 'inherit', cursor: 'pointer' }}>
                      <b style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activeTitle}</b>
                    </button>
                  ) : (
                  <b style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activeTitle}</b>
                  )}
                  {/* Typing outranks online: it is the more specific fact, and
                      the more useful one. Absent both, the room says nothing
                      about the other person rather than guessing "offline" —
                      presence expires on a TTL, so silence is not proof. */}
                  <em>{peerTyping ? 'typing…' : peerOnline ? 'online' : 'Together City'}</em>
                </div>
                <button type="button" className="cstool" aria-label="Leave this conversation unread"
                  title="Mark unread" onClick={() => { void leaveUnread(activeId); }}
                  style={{ flex: 'none' }}>◍</button>
                <button type="button" className="cstool" aria-label="Search this conversation"
                  aria-expanded={searchOpen} onClick={() => setSearchOpen((v) => !v)}
                  style={{ flex: 'none' }}>🔍</button>
                {/* Her mark, on every conversation. A press invites Mira into
                    THIS thread — the side panel reads the window on screen and
                    nothing else. JUST the ring, bare — the owner's call: no
                    tool disc around it. The mark is the promise: this is
                    Mira, the same one, and it needs no chrome to say so. */}
                <button type="button" className="mira-door" aria-label="Ask Mira about this conversation"
                  title="Ask Mira" onClick={() => setConfide(true)}
                  style={{ flex: 'none' }}>
                  <MiraMark size={30} showWord={false} state="waiting" />
                </button>
                <CallButtons conversationId={activeId} compact />
                {/* end of the ordinary header — the bulk bar above takes this
                    whole row when anything is picked. */}
                </>
                )}
              </div>
              {/* THE PINNED ROW, under the header and above everything else.
                  It is a line rather than a card because it is present for the
                  whole visit and a card would be a permanent tax on the height
                  of the thread. Tapping it goes to the message, which is the
                  only thing anybody wants from a pin. A tombstoned pin is
                  dropped here as well as on the server — the delete frame
                  arrives before the refetch does. */}
              {pinnedMsg && !tombstoned.has(pinnedMsg.id) && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 18px',
                  borderBottom: '1px solid var(--stage-line)' }}>
                  <span aria-hidden style={{ flex: 'none', fontSize: 12 }}>📌</span>
                  <button type="button" onClick={() => { void jumpTo(pinnedMsg.id); }}
                    aria-label="Go to the pinned message"
                    style={{ flex: 1, minWidth: 0, textAlign: 'left', border: 'none', background: 'none',
                      font: 'inherit', color: 'inherit', cursor: 'pointer', padding: 0 }}>
                    <span style={{ display: 'block', fontSize: 10.5, color: 'var(--on-stage-faint)' }}>Pinned</span>
                    <span style={{ display: 'block', fontSize: 12.5, overflow: 'hidden',
                      textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {pinnedMsg.body || '📎 Attachment'}
                    </span>
                  </button>
                  <button type="button" className="cstool" style={{ flex: 'none' }}
                    aria-label="Unpin this message" title="Unpin"
                    onClick={() => { void pinMessage(pinnedMsg, false); }}>✕</button>
                </div>
              )}
              {searchOpen && (
                <div style={{ padding: '10px 18px', borderBottom: '1px solid var(--stage-line)', display: 'grid', gap: 8 }}>
                  <input value={kw} onChange={(e) => setKw(e.target.value)} autoFocus
                    aria-label="Search in this conversation" placeholder="Search in this conversation…"
                    className="csb" style={{ width: '100%', fontSize: 16 }} />
                  {/* A date range on its own is a real search: "what did we say
                      that week" is a question people ask without a keyword. */}
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <label style={{ fontSize: 11.5, color: 'var(--on-stage-faint)' }}>From
                      <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
                        className="csb" style={{ marginLeft: 6, fontSize: 16 }} />
                    </label>
                    <label style={{ fontSize: 11.5, color: 'var(--on-stage-faint)' }}>To
                      <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
                        className="csb" style={{ marginLeft: 6, fontSize: 16 }} />
                    </label>
                    <button type="button" className={starredOnly ? 'cstab on' : 'cstab'}
                      aria-pressed={starredOnly} onClick={() => setStarredOnly((v) => !v)}>
                      ★ Only kept
                    </button>
                    {(kw || from || to || starredOnly) && (
                      <button type="button" className="cstab"
                        onClick={() => { setKw(''); setFrom(''); setTo(''); setStarredOnly(false); setJumpNote(null); }}>Clear</button>
                    )}
                  </div>
                  {jumpNote && <p role="status" style={{ margin: 0, fontSize: 12, color: 'var(--on-stage-soft)' }}>{jumpNote}</p>}
                  {hits.isFetching && <p style={{ margin: 0, fontSize: 12, color: 'var(--on-stage-faint)' }}>Searching…</p>}
                  {hits.data && (
                    <div style={{ maxHeight: 220, overflowY: 'auto', display: 'grid', gap: 4 }}>
                      {hits.data.length === 0
                        ? <p style={{ margin: 0, fontSize: 12.5, color: 'var(--on-stage-faint)' }}>Nothing in this conversation matches.</p>
                        : hits.data.map((h) => (
                            <button key={h.id} type="button" onClick={() => { void jumpTo(h.id); }}
                              style={{ textAlign: 'left', border: 'none', background: 'var(--stage-tile)', cursor: 'pointer',
                                borderRadius: 10, padding: '7px 10px', font: 'inherit', color: 'var(--on-stage)' }}>
                              <span style={{ display: 'block', fontSize: 10.5, color: 'var(--on-stage-faint)' }}>
                                {new Date(h.createdAt).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                {h.senderId === user?.id ? ' · You' : ''}
                              </span>
                              <span style={{ display: 'block', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {h.body || '📎 Attachment'}
                              </span>
                            </button>
                          ))}
                    </div>
                  )}
                </div>
              )}
              {history.isLoading
                ? <Spinner />
                : <>
                    {/* The rest of the conversation. It was always there on the
                        server — the cursor came back on every page and nothing
                        read it, so a long thread simply stopped thirty messages
                        ago with no way to say so. */}
                    {history.hasNextPage && (
                      <div style={{ display: 'grid', placeItems: 'center', padding: '10px 0 2px' }}>
                        <button type="button" className="btn"
                          onClick={() => { void history.fetchNextPage(); }}
                          disabled={history.isFetchingNextPage}
                          style={{ minHeight: 44, fontSize: 12.5 }}>
                          {history.isFetchingNextPage ? 'Loading…' : 'Load earlier messages'}
                        </button>
                      </div>
                    )}
                    <MessageThread messages={messages} currentUserId={user?.id} typing={peerTyping}
                      peerName={activeTitle} onDelete={deleteMessage} onEdit={editMessage}
                      onReply={setReplyTo} onForward={(m) => setForwarding([m])} onStar={(m, on) => { void starMessage(m, on); }}
                      onJump={(id) => { void jumpTo(id); }} jumpToId={jumpToId}
                      selectedIds={selected} onSelect={toggleSelect}
                      onReact={(m, e) => { void reactToMessage(m, e); }}
                      onPin={(m, on) => { void pinMessage(m, on); }}
                      pinnedId={pinnedMsg?.id ?? null}
                      fetchInfo={chatApi.messageInfo} />
                  </>}
              {forwarding && (
                <ForwardPanel messages={forwarding} fromConversationId={activeId}
                  conversations={list}
                  onClose={() => setForwarding(null)}
                  onSent={(toId) => {
                    setForwarding(null);
                    /* Forwarding is the end of the selection. The messages have
                       gone where they were going, and a bar still standing over
                       them is an invitation to send the lot a second time. */
                    setSelected(new Set());
                    void conversations.refetch();
                    // The copy lands in the OTHER conversation; if that thread
                    // is the one on screen it needs re-reading, and if it is
                    // not, the list's own poll is what shows it.
                    void qc.invalidateQueries({ queryKey: ['chat', 'messages', toId] });
                  }} />
              )}
              {bulkDelete && picked.length > 0 && (
                <ConfirmDelete
                  mine={allMine}
                  canEveryone={canDeleteForEveryone}
                  count={picked.length}
                  onCancel={() => setBulkDelete(false)}
                  onDelete={(scope) => { void deleteSelected(scope); }}
                />
              )}
              {confide && (
                <MiraConfidant otherName={activeTitle} transcript={confideTranscript}
                  onClose={() => setConfide(false)} />
              )}
              {groupOpen && activeId && (
                <GroupPanel conversationId={activeId} title={activeTitle} meId={user?.id}
                  onClose={() => setGroupOpen(false)}
                  onChanged={() => { void conversations.refetch(); }}
                  onLeft={() => { setGroupOpen(false); setActiveId(undefined); void conversations.refetch(); }} />
              )}
              <Composer onSend={sendWithReply} onTyping={emitTyping}
                replyTo={replyTo ? {
                  name: replyTo.senderId === user?.id ? 'yourself' : activeTitle,
                  body: replyTo.body || 'Attachment',
                } : null}
                onCancelReply={() => setReplyTo(null)} />
            </>
          ) : (
            <div style={{ display: 'grid', placeItems: 'center', height: '100%', padding: 30, textAlign: 'center' }}>
              <div>
                <div style={{ fontSize: 34 }}>💬</div>
                <p style={{ fontSize: 14, fontWeight: 700, margin: '10px 0 4px' }}>No conversation open</p>
                <p style={{ fontSize: 13, color: 'var(--on-stage-faint)', margin: 0, lineHeight: 1.55, maxWidth: '34ch' }}>
                  Pick one on the left, start a chat, or message somebody from their profile.
                </p>
              </div>
            </div>
          )}
        </section>
        )}
      </div>
    </div>
  );
}
