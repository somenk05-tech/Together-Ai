import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useConversations, useMessages, useChatRealtime, useClearConversation, useMessageSearch, useOnlineContacts, usePinnedMessage, chatApi, socketClient, WS, type OutgoingAttachment, useChatRoster, useSetChatPhoto } from '@/api';
import { ConversationList } from '../components/ConversationList';
import { useMiraShown } from '@/hooks/useCityDesign';
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
 * THE STAGE TAKES A COLOUR — FIVE OF THEM, AND THAT IS THE WHOLE LIST.
 *
 * It was eighteen: nine palettes from the owner's cards, then nine more added
 * on 20 Aug to pair key-for-key with Mail's skins. Eighteen swatches in a
 * header is not a choice, it is a colour picker — a wrapped grid of dots at
 * the top of the list, above the search anybody actually came for, and every
 * one of them a decision nobody wanted to make twice. Owner, 2 Sep: five.
 *
 * These five, because between them they cover the ground rather than the
 * hue wheel — the slate the stage ships in, a dark blue, a dark green, a warm
 * light and a paper light. A theme is a `data-stage` attribute on the stage
 * element; the token blocks in tokens.css do all the painting, each one
 * re-stating the FULL set of stage tokens with its own measured inks, so a
 * theme can never re-ground the room while keeping the wrong ink. Mira's
 * room has its own tokens and takes no theme: she stays red.
 *
 * THE THIRTEEN BLOCKS THIS ORPHANS STAY IN tokens.css, and deliberately.
 * `.cstage[data-stage=...]` is not chat's private property — DatingChats wears
 * `porcelain` through the same class — and the nine Mail-paired palettes are
 * half of a pair whose other half is still offered in the inbox. What goes is
 * the OFFER, which is this array; a stored preference naming a palette that is
 * no longer offered falls through `storedTheme` to slate on the next visit.
 *
 * The swatch colours live in tokens.css with the theme blocks (`.cstheme
 * [data-t=...]`) — relief.spec bans colour literals in page files, and it
 * is right to: a hex here and a hex there is how two swatches drift.
 */
const STAGE_THEMES = [
  { id: 'slate', name: 'Slate' },
  { id: 'navy', name: 'Navy Mirage' },
  { id: 'emerald', name: 'Emerald Depth' },
  { id: 'rose', name: 'Rose Mascarpone' },
  { id: 'cream', name: 'Cream Veil' },
] as const;
type StageTheme = (typeof STAGE_THEMES)[number]['id'];
const THEME_KEY = 'chat.stage';
const storedTheme = (): StageTheme => {
  const t = localStorage.getItem(THEME_KEY);
  return STAGE_THEMES.some((s) => s.id === t) ? (t as StageTheme) : 'slate';
};
import { MessageThread, ConfirmDelete } from '../components/MessageThread';
import { withinWindow } from '../components/messageRules';
import { Composer } from '../components/Composer';
import { ChatStarter } from '../components/ChatStarter';
import { GroupPanel } from '../components/GroupPanel';
import { ForwardPanel } from '../components/ForwardPanel';
import { Spinner, EmptyState, Button } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { useChatRoom } from '@/hooks/useChatRoom';
import { useScaleLock } from '@/hooks/useScaleLock';
import type { Message } from '@/types';

/**
 * WHAT THE SERVER SAID, IF IT SAID ANYTHING.
 *
 * Every refusal on this page is a sentence the API already wrote — "you can
 * only delete for everyone within 15 minutes" is worth more than any apology
 * this file could invent, and it is the one that tells somebody what to do
 * next. Nest serialises a validation failure's message as an array, which is
 * why the join is here rather than at four call sites. Three lines rather than
 * an import: the identical read lives in the dating hub's `server-sentence`,
 * and chat depending on the dating hub for it would be the worse duplication.
 */
const serverSaid = (e: unknown, fallback: string): string => {
  const m = (e as { response?: { data?: { message?: string | string[] } } } | null)?.response?.data?.message;
  const text = Array.isArray(m) ? m.join(' ') : m;
  return typeof text === 'string' && text.trim().length > 0 ? text.trim() : fallback;
};

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
  /**
   * THE FACES, ON THEIR OWN CALL. Photographs are `data:` URLs and the
   * conversation list refetches every fifteen seconds; a face in that payload
   * would be re-downloaded four times a minute for something that changes about
   * twice a year. This one is cached for five minutes and written through on a
   * change, so the picture is instant and the poll stays light.
   */
  const roster = useChatRoster();
  const setPhoto = useSetChatPhoto();
  const faces = useMemo(
    () => new Map<string, { photo: string | null; mine: boolean }>(
      (roster.data ?? []).map((r) => [r.id, { photo: r.photo, mine: r.mine }] as const)),
    [roster.data],
  );
  /* A PHONE SHOWS ONE ROOM AT A TIME (WhatsApp's rule, and the owner's).
     The stage is a two-column desk: a list beside a thread. Below 860px it
     already collapsed to one column — but one column holding BOTH, so a
     phone got a squeezed list stacked on a squeezed thread and neither was
     usable. Here the list IS the screen until a conversation is opened, and
     then the thread is, with a back arrow that returns. */
  /* AND RE-DECIDED WHEN THE QUERY CHANGES, rather than measured once at mount.
     A tablet that opened a thread at 820px and was turned to 1180px kept the
     phone layout — the conversation list hidden behind a back arrow — until
     the route remounted. There is no hook to borrow for this: useScaleLock,
     useChatRoom and useVisualViewport all ask this same question and none of
     them hands the answer back to its caller. */
  const [phone, setPhone] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 899px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 899px)');
    const onChange = () => setPhone(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
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

  /* A ?c= DEEP LINK THAT ARRIVES WHILE THIS PAGE IS ALREADY OPEN. The param was
     read once, into initial state, and never again — so tapping a chat
     notification from inside /chats changed the URL and moved nothing. */
  useEffect(() => { if (requestedId) setActiveId(requestedId); }, [requestedId]);

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
  const miraShown = useMiraShown();
  const isMira = activeId === MIRA_ID;
  const convId = isMira ? undefined : activeId;

  /* THE ROOM TREATMENT IS FOR ANY OPEN THREAD — MIRA INCLUDED. This was
     `Boolean(convId)`, which made hers the one phone conversation that was
     not immersive: header still fixed on top, page scroll still live
     underneath, no --tc-vvh — so the stage's `var(--tc-vvh, 100dvh)` height
     and `html.tc-immersive .cstage`'s fixed-one-row layout, both written for
     this screen, never engaged for her. What the owner's phone showed was the
     wreckage: the composer beached at the top of a content-sized panel with
     the rest of the screen blank. Only the SOCKET JOIN and the MESSAGE FETCH
     need a real conversation, and both key off `convId` below — the
     immersion never did. */
  useChatRoom(Boolean(activeId));

  const history = useMessages(convId);
  const [live, setLive] = useState<Message[]>([]);
  const [peerTyping, setPeerTyping] = useState(false);
  const [statusMap, setStatusMap] = useState<Record<string, 'DELIVERED' | 'READ'>>({});
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());        // deleted for me
  const [tombstoned, setTombstoned] = useState<Set<string>>(new Set());       // deleted for everyone
  const [editsMap, setEditsMap] = useState<Record<string, Message>>({});      // live edits
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Whether this citizen has already said they are typing — see emitTyping. */
  const typingOn = useRef(false);
  /** And the peer's flag, which expires on its own — see onTyping. */
  const peerTypingClear = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Clears a jump once it has landed — see jumpTo, and the effect in
   *  MessageThread that this id keeps re-firing while it is set. */
  const jumpClear = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Message ids this session has already asked to mark read — each id is
   *  acknowledged once per opened thread, never per render. */
  const ackedRead = useRef<Set<string>>(new Set());
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  /* THE PHONE'S OVERFLOW KEY. Measured in a browser: the header's controls
     wanted 398px before the name got a single pixel, so on every phone made
     the name was zero wide and `online` — the shorter string — was the only
     thing left of who you were talking to. Two of the eight fold in here.
     They FOLD rather than leave: "mark unread" is reachable from nowhere else
     in the application, and a control only a desk can find is a feature a
     phone does not have. */
  const [moreOpen, setMoreOpen] = useState(false);
  const [kw, setKw] = useState('');
  /* ONE REQUEST PER PAUSE, NOT ONE PER KEYSTROKE. `useMessageSearch` keys on
     the word itself, so typing "birthday" was eight searches of which seven
     were thrown away before they landed. The same 220ms the people search on
     the social profile waits, and the same shape — ForwardPanel makes this
     argument in words and answers it by filtering what is already loaded. */
  const [searchKw, setSearchKw] = useState('');
  useEffect(() => { const t = setTimeout(() => setSearchKw(kw), 220); return () => clearTimeout(t); }, [kw]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [jumpToId, setJumpToId] = useState<string | null>(null);
  /* THE PAGE'S ONE NOTICE LINE. Delete, edit, pin and "mark unread" each failed
     in silence — a caught exception and nothing on screen — and the jump note
     could only be read from inside the search panel, so a failed jump from the
     pinned banner or from a quoted reply said nothing at all. To a reader they
     are all the same sentence ("that did not happen, and here is why"), so
     there is one place for it, above the thread, where they already are. */
  const [notice, setNotice] = useState<string | null>(null);
  const [starredOnly, setStarredOnly] = useState(false);
  const hits = useMessageSearch(convId, searchKw, from || undefined, to || undefined, starredOnly);

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
  // convId, not activeId: Mira is not a conversation and GET /chat/__mira__/pinned
  // is a 404 on every open. The invariant is stated at the top of this file.
  const pinned = usePinnedMessage(convId);
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
  useEffect(() => { setLive([]); setPeerTyping(false); setStatusMap({}); setHiddenIds(new Set()); setTombstoned(new Set()); setEditsMap({}); ackedRead.current = new Set(); setReplyTo(null); setSearchOpen(false); setMoreOpen(false); setKw(''); setSearchKw(''); setFrom(''); setTo(''); setJumpToId(null); setNotice(null); setStarredOnly(false); setSelected(new Set()); setBulkDelete(false); setReactionsMap({}); setConfide(false); }, [activeId]);

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

  /* AND THE THREAD IS RE-READ WHEN THE SOCKET COMES BACK. `useChatRealtime`
     re-joins the room on `connect` and invalidates nothing; the query client
     runs staleTime 30s with refetchOnWindowFocus off, and this thread has no
     poll behind it. So a backgrounded phone came back to a connection that had
     missed everything sent in the gap — arriving by neither `receive_message`
     nor `chat_notification` — and those messages were unreachable until the
     component remounted. This belongs inside the hook, next to the re-join it
     pairs with; that file is being edited elsewhere this week, so it is said
     here, at the call site, in the same words the dating thread says it. */
  useEffect(() => {
    if (!convId) return;
    const sock = socketClient.raw();
    const resync = () => { void qc.invalidateQueries({ queryKey: ['chat', 'messages', convId] }); };
    sock.on('connect', resync);
    return () => { sock.off('connect', resync); };
  }, [convId, qc]);

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
  /* A typing flag with no stop frame behind it must expire on its own: the
     stop can be dropped by a reconnect or by the gateway's ceiling, and the
     peer was then left reading "typing…" forever. The dating room has had this
     since it was written; the city room had not. */
  const onTyping = useCallback((userId: string, isTyping: boolean) => {
    if (userId === user?.id) return;
    setPeerTyping(isTyping);
    if (peerTypingClear.current) clearTimeout(peerTypingClear.current);
    if (isTyping) peerTypingClear.current = setTimeout(() => setPeerTyping(false), 6000);
  }, [user?.id]);

  // Realtime deletions/edits from any device — applied instantly, no refresh.
  const onDeleted = useCallback((messageId: string) => {
    setTombstoned((s) => new Set(s).add(messageId));
  }, []);
  const onEdited = useCallback((m: Message) => {
    setEditsMap((s) => ({ ...s, [m.id]: m }));
  }, []);

  /* THE SIXTH CALLBACK: a refusal the socket makes that is not tied to a send.
     A rate-limit drop on join, on a read receipt or on typing arrives as an
     `error_event` and had nowhere to go — the send path reports itself, inside
     the Composer, because that is where the words it kept are. */
  const onRealtimeError = useCallback((message: string) => { setNotice(message); }, []);

  const { send, setTyping } = useChatRealtime(activeId, onMessage, onTyping, onDeleted, onEdited, onRealtimeError);

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
  /* A COUNTER, NOT A BOOLEAN, for the reason `seed` is one two files over: the
     second "send me a Live Snap" has to open the camera as surely as the
     first, and a flag that is already true is a flag that does nothing. */
  const [liveSnapAsked, setLiveSnapAsked] = useState(0);

  const sendWithReply = useCallback((body: string, attachments?: OutgoingAttachment[]) => {
    const answering = replyTo?.id;
    /* THE PROMISE GOES BACK TO THE COMPOSER, which awaits it: on a rejection it
       shows the server's own sentence and keeps the words and the attachments
       that were staged. Swallowing it here is what made a refused send look
       exactly like a sent one — the composer emptied and nothing arrived.
       AND THE REPLY ANCHOR IS DROPPED ONLY ONCE IT HAS LANDED. Clearing it
       before the await kept the words and the files on a refusal and threw away
       the one thing that said what they were answering, so pressing Send again
       posted the same sentence as a fresh message. */
    return send(body, attachments, answering).then(() => { setReplyTo(null); });
  }, [send, replyTo]);

  /* THE LIVE QUERY, NOT THE ONE THE CALLBACK BELOW CLOSED OVER. `history` was
     captured when jumpTo was created, so `await history.fetchNextPage()` never
     changed the `hasNextPage` its loop was reading — a thread that ran out of
     pages on the second turn still spent all twelve, a second and a half of
     re-fetching the same last page, before saying so. The ref is re-pointed on
     every render, so each turn reads the flag as it is now. */
  const historyRef = useRef(history);
  historyRef.current = history;

  /* JUMPING TO A MESSAGE THAT IS NOT LOADED YET. A search hit can be a hundred
     messages back, and telling somebody "it is further up" while refusing to
     go there is the kind of answer that makes a feature not worth opening. So
     this walks history backwards a page at a time until the id is on screen —
     bounded, because a thread with thousands of messages should give up rather
     than fetch all night. */
  const jumpTo = useCallback(async (messageId: string) => {
    setNotice(null);
    for (let i = 0; i < 12; i++) {
      if (document.querySelector(`[data-mid="${CSS.escape(messageId)}"]`)) {
        setSearchOpen(false);
        if (jumpClear.current) clearTimeout(jumpClear.current);
        setJumpToId(null);
        window.setTimeout(() => setJumpToId(messageId), 0);
        /* AND CLEARED ONCE IT HAS LANDED. MessageThread's jump effect is keyed
           on [jumpToId, messages.length], so an id left standing re-fires it
           on every message that arrives and drags the reader back to the same
           bubble mid-conversation. Just past the 1600ms flash it draws. */
        jumpClear.current = setTimeout(() => setJumpToId(null), 1800);
        return;
      }
      if (!historyRef.current.hasNextPage) break;
      await historyRef.current.fetchNextPage();
      await new Promise((r) => window.setTimeout(r, 80));
    }
    setNotice('That message is further back than this conversation will load.');
  }, []);

  /** Delete a message (soft delete server-side; synced across devices). */
  const deleteMessage = useCallback(async (messageId: string, scope: 'ME' | 'EVERYONE') => {
    try {
      await chatApi.deleteMessage(messageId, scope);
      if (scope === 'ME') setHiddenIds((s) => new Set(s).add(messageId));
      else setTombstoned((s) => new Set(s).add(messageId));
      void qc.invalidateQueries({ queryKey: ['chat', 'messages', activeId] });
    } catch (e) {
      /* IT SAYS SO NOW. The 15-minute window is the usual refusal and the
         server names it; catching and doing nothing closed the confirmation
         dialog and left the message sitting there, which reads as success. */
      setNotice(serverSaid(e, scope === 'EVERYONE'
        ? 'That message could not be deleted for everyone.'
        : 'That message could not be deleted.'));
    }
  }, [activeId, qc]);

  const editMessage = useCallback(async (messageId: string, body: string) => {
    try {
      const updated = await chatApi.editMessage(messageId, body);
      setEditsMap((s) => ({ ...s, [messageId]: updated }));
      void qc.invalidateQueries({ queryKey: ['chat', 'messages', activeId] });
    } catch (e) {
      // The typed edit is discarded either way; without a sentence, so is the
      // reason it was refused. The server names the window.
      setNotice(serverSaid(e, 'That edit did not save — the message is unchanged.'));
    }
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
    } catch (e) {
      // There was no catch at all, and both call sites `void` the promise: an
      // unhandled rejection, and a banner that simply did not change.
      setNotice(serverSaid(e, on ? 'That message could not be pinned.' : 'That pin could not be removed.'));
    } finally {
      void pinned.refetch();
    }
  }, [pinned]);

  /* Flag it and LEAVE. Staying in an open thread you have just marked unread
     is a contradiction the next render would have to resolve, and it would
     resolve it by marking it read again — the effect above does exactly that
     on open. So the gesture closes the room, which is also what somebody means
     by it: I am done here for now. */
  /* AND IT ONLY LEAVES IF IT WORKED. The call was `.catch(() => undefined)`
     followed by close-and-refetch regardless, so a refusal looked exactly like
     a success — the room closed, and the badge the whole gesture is for never
     came back. A failure keeps the room open and says why. */
  const leaveUnread = useCallback(async (id: string) => {
    try {
      await chatApi.markConversationUnread(id);
    } catch (e) {
      setNotice(serverSaid(e, 'That chat could not be marked unread.'));
      return;
    }
    setActiveId(undefined);
    void conversations.refetch();
  }, [conversations]);

  /* ONE FRAME PER BURST, NOT ONE PER KEYSTROKE. `onTyping` fires on every
     `onChange`, so this emitted a `typing_start` for every character typed —
     which at any ordinary speed is several hundred frames a minute, past the
     gateway's ceiling and into `error_event`. Socket.IO says "somebody is
     typing", a fact that does not change while it stays true, so the frame
     goes out on the EDGE and the 2.5s timer takes it back. */
  const emitTyping = useCallback((t: boolean) => {
    if (t !== typingOn.current) { typingOn.current = t; setTyping(t); }
    if (typingTimer.current) clearTimeout(typingTimer.current);
    if (t) typingTimer.current = setTimeout(() => { typingOn.current = false; setTyping(false); }, 2500);
  }, [setTyping]);

  /* THE 2.5s STOP, CANCELLED WITH THE ROOM. Type a character, leave inside the
     window, and the timer still fired — `typing_stop` emitted for a room this
     socket had already left. Keyed on activeId, so changing conversation
     cancels it as surely as unmounting does; the jump timer goes with it. */
  useEffect(() => () => {
    if (typingTimer.current) clearTimeout(typingTimer.current);
    if (peerTypingClear.current) clearTimeout(peerTypingClear.current);
    if (jumpClear.current) clearTimeout(jumpClear.current);
    // The next room has not been told anything yet.
    typingOn.current = false;
  }, [activeId]);

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
     that has stopped being true. Each call reports its own failure through the
     page's notice line exactly as the single delete does, so a message the
     window closed on stays put — and now says so rather than merely surviving. */
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
  // convId, not activeId — POST /chat/__mira__/read is a 404 on every open of
  // her room, swallowed and repeated. Same invariant as the pinned read above.
  useEffect(() => {
    if (!convId) return;
    void chatApi.markRead(convId)
      .then(() => qc.invalidateQueries({ queryKey: ['chat', 'conversations'] }))
      .catch(() => undefined);
  }, [convId, qc]);

  if (conversations.isLoading) return <Spinner label="Loading your chats…" />;
  if (conversations.isError) return <EmptyState title="Couldn't load chats" hint="Your chats are safe — try again in a moment." />;

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

  const activeConv = list.find((c) => c.id === activeId);
  const activeTitle = activeConv?.title || 'Conversation';
  /* The room's own face, under the rule the rows already draw under: an
     anonymous match keeps its mask unless the picture on it is one the reader
     chose. A group and an unmasked stranger never reach the roster with a
     photo at all, so nothing else has to be excluded here. */
  const activeFace = faces.get(activeId ?? '');
  const activePhoto = activeConv?.anonymous && !activeFace?.mine ? null : activeFace?.photo ?? null;
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
          {miraShown && <MiraRow active={activeId === MIRA_ID} onSelect={() => setActiveId(MIRA_ID)} />}
          {list.length === 0
            ? <p style={{ fontSize: 13, padding: '4px 18px 18px', color: 'var(--on-stage-faint)', lineHeight: 1.55 }}>
                No conversations yet — start one above.
              </p>
            : <ConversationList items={list} activeId={activeId} onSelect={setActiveId}
                onRemove={onRemove} removingId={clear.isPending ? clear.variables : undefined}
                faces={faces} onSetPhoto={(id, photo) => setPhoto.mutate({ conversationId: id, photo })}
                savingPhotoId={setPhoto.isPending ? setPhoto.variables?.conversationId : undefined} />}
        </aside>
        )}

        {!(phone && !activeId) && (
        <section className="csthread">
          {activeId === MIRA_ID ? (
            /* On a phone her room IS the screen and replaces the thread
               header — so she carries her own way back to the list. */
            <MiraThread onBack={phone ? () => setActiveId(undefined) : undefined} />
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
                    <div className="flex-min">
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
                {/* The stage paints its own avatar slot — .csav and .csav img
                    are written for this room's ink — so the header wears that
                    rather than the shared disc, and the initials stay as the
                    fallback exactly as they are on the rows. */}
                <span className="csav">
                  {activePhoto
                    ? <img className="no-case" src={activePhoto} alt="" loading="lazy" />
                    : activeTitle.split(/[\s·]+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
                </span>
                <div className="flex-min">
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
                {phone ? (
                  /* ONE KEY, TWO ERRANDS. The menu is closed by pressing away
                     from it or by Escape, and by choosing — a menu that stays
                     open behind the search bar it just opened is a menu you
                     have to dismiss twice. */
                  <div className="cshead-more" style={{ flex: 'none' }}
                    onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setMoreOpen(false); } }}>
                    <button type="button" className="cstool" aria-label="More actions in this conversation"
                      aria-haspopup="menu" aria-expanded={moreOpen}
                      onClick={() => setMoreOpen((v) => !v)}>⋯</button>
                    {moreOpen && (
                      <>
                        {/* The scrim is not a control and says so: it carries
                            no name and no role, and every errand behind it is
                            still in the menu itself. */}
                        <div className="cshead-more-scrim" aria-hidden
                          onClick={() => setMoreOpen(false)} />
                        <div className="cshead-menu" role="menu">
                          <button type="button" role="menuitem"
                            onClick={() => { setMoreOpen(false); setSearchOpen((v) => !v); }}>
                            <span aria-hidden>🔍</span>Search this conversation
                          </button>
                          <button type="button" role="menuitem"
                            onClick={() => { setMoreOpen(false); void leaveUnread(activeId); }}>
                            <span aria-hidden>◍</span>Mark unread
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                <>
                <button type="button" className="cstool" aria-label="Leave this conversation unread"
                  title="Mark unread" onClick={() => { void leaveUnread(activeId); }}
                  style={{ flex: 'none' }}>◍</button>
                <button type="button" className="cstool" aria-label="Search this conversation"
                  aria-expanded={searchOpen} onClick={() => setSearchOpen((v) => !v)}
                  style={{ flex: 'none' }}>🔍</button>
                </>
                )}
                {/* Her mark, on every conversation. A press invites Mira into
                    THIS thread — the side panel reads the window on screen and
                    nothing else. THE WHOLE LOCKUP — ring and wordmark — the
                    owner's call, at 48 because the word stops being legible
                    below that. No chrome around it; hovering says what she is
                    for (the .mira-door tooltip in mira.css). */}
                {miraShown && (
                  <button type="button" className="mira-door" aria-label="Ask Mira about this conversation"
                    title="Mira can analyse this chat for you" onClick={() => setConfide(true)}
                    style={{ flex: 'none' }}>
                    <MiraMark size={48} state="waiting" />
                  </button>
                )}
                {/* end of the ordinary header — the bulk bar above takes this
                    whole row when anything is picked. */}
                </>
                )}
              </div>
              {/* THE NOTICE LINE, above everything the thread draws, so a
                  failed jump from the pinned banner or from a quoted reply is
                  read in the same place as a refused delete or a socket that
                  turned somebody away. `.note` rather than a class of its own:
                  it brings its own ground AND its own ink, which is what
                  anything laid on this stage has to do. */}
              {notice && (
                <div className="note" role="status">
                  {notice}{' '}
                  <Button variant="line" size="sm" onClick={() => setNotice(null)}>Dismiss</Button>
                </div>
              )}
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
                        onClick={() => { setKw(''); setSearchKw(''); setFrom(''); setTo(''); setStarredOnly(false); setNotice(null); }}>Clear</button>
                    )}
                  </div>
                  {hits.isFetching && <p style={{ margin: 0, fontSize: 12, color: 'var(--on-stage-faint)' }}>Searching…</p>}
                  {hits.data && (
                    <div style={{ maxHeight: 220, overflowY: 'auto', display: 'grid', gap: 4 }}>
                      {hits.data.length === 0
                        ? <p style={{ margin: 0, fontSize: 12.5, color: 'var(--on-stage-faint)' }}>Nothing in this conversation matches.</p>
                        : hits.data.map((h) => (
                            <button key={h.id} type="button" onClick={() => { void jumpTo(h.id); }}
                              style={{ textAlign: 'left', border: 'none', background: 'var(--stage-tile)', cursor: 'pointer',
                                borderRadius: 'var(--r-1)', padding: '7px 10px', font: 'inherit', color: 'var(--on-stage)' }}>
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
                : history.isError
                ? (
                  /* A FAILED READ IS NOT AN EMPTY CONVERSATION. There was no
                     error branch here and MessageThread draws nothing for an
                     empty list, so a 500 or a schema failure was indistinguishable
                     from a chat nobody had written in yet — and people re-sent
                     what they had already sent. */
                  <div className="note" role="alert">
                    We couldn’t load this conversation. Nothing has been lost — it is this
                    read that failed, not the thread.{' '}
                    <Button variant="line" size="sm" onClick={() => { void history.refetch(); }}>Try again</Button>
                  </div>
                )
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
                    <MessageThread key={activeId} messages={messages} currentUserId={user?.id} typing={peerTyping}
                      peerName={activeTitle} peerPhoto={activePhoto} onDelete={deleteMessage} onEdit={editMessage}
                      onReply={setReplyTo} onForward={(m) => setForwarding([m])} onStar={(m, on) => { void starMessage(m, on); }}
                      onJump={(id) => { void jumpTo(id); }} jumpToId={jumpToId}
                      selectedIds={selected} onSelect={toggleSelect}
                      onReact={(m, e) => { void reactToMessage(m, e); }}
                      onPin={(m, on) => { void pinMessage(m, on); }}
                      onAnswerLiveSnap={() => setLiveSnapAsked((n) => n + 1)}
                      pinnedId={pinnedMsg?.id ?? null}
                      fetchInfo={chatApi.messageInfo} />
                  </>}
              {forwarding && (
                <ForwardPanel messages={forwarding} fromConversationId={activeId}
                  conversations={list} faces={faces}
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
              {/* KEYED ON THE ROOM. The composer holds typed words and staged
                  attachments now, and it is the same instance across a switch
                  of conversation — so a photo attached in one thread and left
                  there was sent into the next one the reader opened, silently.
                  A key is the whole fix: a new room gets a new composer. */}
              <Composer key={activeId} onSend={sendWithReply} onTyping={emitTyping}
                replyTo={replyTo ? {
                  name: replyTo.senderId === user?.id ? 'yourself' : activeTitle,
                  body: replyTo.body || 'Attachment',
                } : null}
                /* A share card is the one send the Composer does not own, so
                   its refusal has nowhere to land but the page's notice. */
                onShare={(card) => {
                  void send('', undefined, undefined, card)
                    .catch((e: unknown) => setNotice(serverSaid(e, 'That card could not be sent.')));
                }}
                liveSnapAsked={liveSnapAsked}
                onCancelReply={() => setReplyTo(null)} />
            </>
          ) : (
            <div style={{ display: 'grid', placeItems: 'center', height: '100%', padding: 30, textAlign: 'center' }}>
              <div>
                <div style={{ fontSize: 34 }}>💬</div>
                <p style={{ fontSize: 14, fontWeight: 700, margin: '10px 0 4px' }}>No conversation open</p>
                <p style={{ fontSize: 13, color: 'var(--on-stage-faint)', margin: 0, lineHeight: 1.55, maxWidth: '34ch' }}>
                  Pick a conversation, or start one.
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
