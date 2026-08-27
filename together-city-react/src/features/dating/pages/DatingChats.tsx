import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { animate, motion, useMotionValue } from 'framer-motion';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Spinner, EmptyState } from '@/components/ui';
import { useMe } from '@/api';
import { chatApi, useMessages, useChatRealtime, type OutgoingAttachment } from '@/api';
import type { Message } from '@/api/schemas';
import { useQueryClient } from '@tanstack/react-query';
import { useDatingChats, useMatchDetail, useUnmatch, type DatingChatSummary } from '../api';
import { CallButtons } from '@/features/calls/CallButtons';
import { SafetyMenu } from '../components/SafetyMenu';
import { MiraMark } from '@/features/chat/mira/MiraMark';
import { useMiraShown } from '@/hooks/useCityDesign';
import { MiraConfidant } from '@/features/chat/mira/MiraConfidant';
import { Composer } from '@/features/chat/components/Composer';
import { MessageBody } from '@/features/chat/components/MessageBody';
import { ConversationIdeas, CompatibilitySheet, EmptyIntro } from '../components/ChatPieces';
import { startersFor } from '../starters';
import { useChatRoom } from '@/hooks/useChatRoom';
import { useScaleLock } from '@/hooks/useScaleLock';

/** The one spring in this file, named so the drawer and the snap-back cannot
 *  drift into two different feels. Low bounce: this is a drawer, not a toy. */
const SPRING = { type: 'spring' as const, duration: 0.32, bounce: 0.14 };

/** Initials for the masked/real avatar. */
function initials(name: string): string {
  return (name || '?').split(' ').map((w) => w[0] || '').join('').slice(0, 2).toUpperCase();
}

/** "8:32 PM" today, "Mon" this week, "12 Aug" beyond (owner's reference row,
 *  26 Aug). A clock time is a thing you can act on tonight; "3h" is homework. */
function fmtWhen(iso: string): string {
  const t = new Date(iso);
  const ms = t.getTime();
  if (!ms || ms < 1) return '';
  const now = new Date();
  if (t.toDateString() === now.toDateString()) {
    return t.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  if (now.getTime() - ms < 7 * 86400000) return t.toLocaleDateString(undefined, { weekday: 'short' });
  return t.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function Avatar({ name, photo, size = 46 }: { name: string; photo: string | null; size?: number }) {
  if (photo) return <img src={photo} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flex: 'none' }} />;
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', flex: 'none', display: 'grid', placeItems: 'center',
      background: 'var(--accent-soft)', color: 'var(--accent-ink)', fontWeight: 700, fontSize: size * 0.36 }}>
      {initials(name)}
    </div>
  );
}

/** One row in the chat list. */
/**
 * SWIPE A MATCH ASIDE TO UNMATCH — AND NEVER BY ACCIDENT.
 *
 * The owner asked for the gesture every messaging app has. Two decisions in it
 * are worth more than the animation.
 *
 * THE SWIPE REVEALS; IT DOES NOT ACT. Unmatching ends a conversation for two
 * people and this app cannot undo it — `undoLastPass` is explicitly not an
 * un-unmatch. A gesture that completes a destructive action on release is a
 * design that trades somebody's match for a stray thumb on a train. So the
 * swipe opens a drawer, the drawer holds a button, and the button asks once.
 * Three deliberate acts, none of them slow.
 *
 * AND IT IS NOT ONLY A GESTURE. The row is still a button that opens the chat,
 * the drawer's control is a real <button> reachable by keyboard, and every
 * unmatch already available from the thread's safety bar is unchanged. A
 * gesture that is the ONLY way to do something is a feature a screen-reader
 * user does not have.
 *
 * WHY framer-motion HERE AND NOWHERE ELSE IN THIS FILE. CLAUDE.md grants it
 * exactly three uses and this is the first of them: a drag carries velocity,
 * and a flick that has left the thumb should keep going. A CSS transition
 * cannot read a gesture's speed, so a fast short flick and a slow long drag
 * would settle identically — which is the difference between a control that
 * feels alive and one that feels like a toggle.
 *
 * `dragDirectionLock` is load-bearing: without it a diagonal thumb steals the
 * vertical scroll from the list, which is the classic way this pattern ruins a
 * page it was meant to improve.
 */
const DRAWER = 104;

function ChatRow({ c, active, onClick }: { c: DatingChatSummary; active: boolean; onClick: () => void }) {
  const x = useMotionValue(0);
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const unmatch = useUnmatch('romantic');

  const close = useCallback(() => { setOpen(false); setConfirming(false); void animate(x, 0, SPRING); }, [x]);
  // A confirmation left on screen is a trap for the next tap. It reverts.
  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), 4000);
    return () => clearTimeout(t);
  }, [confirming]);

  return (
    <div style={{ position: 'relative', marginBottom: 8, borderRadius: 'var(--r-2)', overflow: 'hidden' }}>
      {/* The drawer, behind the row. `aria-hidden` while shut so the control is
          not a tab stop nobody can see. */}
      <div aria-hidden={!open} style={{
        position: 'absolute', inset: 0, display: 'flex', justifyContent: 'flex-end', alignItems: 'stretch',
        background: 'var(--danger-soft)', borderRadius: 'var(--r-2)',
      }}>
        <button type="button"
          onClick={() => { if (confirming) { unmatch.mutate(c.otherUserId); close(); } else setConfirming(true); }}
          disabled={!open || unmatch.isPending}
          aria-label={confirming ? `Confirm unmatch with ${c.name}` : `Unmatch ${c.name}`}
          style={{
            width: DRAWER, minHeight: 44, border: 0, cursor: 'pointer', fontFamily: 'inherit',
            background: 'none', color: 'var(--danger-ink)', fontWeight: 700, fontSize: 13,
            display: 'grid', placeItems: 'center', padding: '0 8px', lineHeight: 1.25,
          }}>
          {unmatch.isPending ? 'Unmatching…' : confirming ? 'Sure?' : 'Unmatch'}
        </button>
      </div>

      <motion.div
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: -DRAWER, right: 0 }}
        dragElastic={{ left: 0.06, right: 0 }}
        style={{ x, position: 'relative', touchAction: 'pan-y' }}
        onDragEnd={(_, info) => {
          // Past halfway OR thrown hard enough. Velocity is why this is a drag
          // and not a transition: a short fast flick should open.
          const shouldOpen = info.offset.x < -DRAWER / 2 || info.velocity.x < -420;
          setOpen(shouldOpen);
          if (!shouldOpen) setConfirming(false);
          void animate(x, shouldOpen ? -DRAWER : 0, SPRING);
        }}
      >
    {/* THE ROW, RE-SET TO THE OWNER'S 26 AUG REFERENCE: face · name and age ·
        the last words — then the clock and the number in a quiet right-hand
        column. Unread is said with TYPE, not a coloured badge: the name and
        the preview take the full ink, and the count is a small charcoal pip.
        The compatibility figure stays on the row because it is the thing this
        app knows that a generic messenger does not — in the gold register,
        and small, because the words are the hero here. */}
    <button type="button" onClick={() => { if (open) { close(); return; } onClick(); }} style={{
      display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
      padding: '12px 12px', borderRadius: 'var(--r-2)', border: '1px solid var(--line)',
      background: active ? 'var(--accent-soft)' : 'var(--card)',
    }}>
      <Avatar name={c.name} photo={c.photo} size={48} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{
          display: 'block', fontWeight: c.unread > 0 ? 800 : 700, fontSize: 15,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {c.name}{c.age ? `, ${c.age}` : ''}
        </span>
        <span className={c.unread > 0 ? undefined : 'muted'} style={{
          display: 'block', fontSize: 12.5, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          fontWeight: c.unread > 0 ? 600 : 400,
        }}>
          {c.lastText ? `${c.lastFromMe ? 'You: ' : ''}${c.lastText}` : 'Say hello 👋'}
        </span>
      </div>
      <div style={{ flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
        <span className="muted" style={{ fontSize: 11.5 }}>{fmtWhen(c.lastMessageAt)}</span>
        {c.unread > 0
          ? <span aria-label={`${c.unread} unread`} style={{ minWidth: 18, height: 18, borderRadius: 'var(--r-full)', background: 'var(--ink)', color: 'var(--card)', fontSize: 11, fontWeight: 700, display: 'grid', placeItems: 'center', padding: '0 5px' }}>{c.unread}</span>
          : c.score != null && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold-ink)' }}>{c.score}%</span>}
      </div>
    </button>
      </motion.div>
    </div>
  );
}

/* bubbleBase is gone: the bubble is `.csb` now, the same tile the city chat
   uses, so the two cannot drift into two slightly different chats. */

/** A new match, waiting for its first message — the Bumble-style queue tile.
 *  Same name and photo the match card showed; tapping opens the connect step. */
function MatchBubble({ c }: { c: DatingChatSummary }) {
  return (
    <Link to={`/dating/match?u=${c.otherUserId}`}
      style={{ textDecoration: 'none', color: 'inherit', flex: 'none', width: 78, textAlign: 'center' }}>
      <div style={{ width: 68, height: 68, margin: '0 auto', borderRadius: '50%', padding: 3,
        background: 'linear-gradient(135deg, var(--accent), var(--accent-soft))' }}>
        <div style={{ width: '100%', height: '100%', borderRadius: '50%', overflow: 'hidden',
          border: '2px solid var(--card)', display: 'grid', placeItems: 'center', background: 'var(--accent-soft)' }}>
          {c.photo
            ? <img src={c.photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <span style={{ fontWeight: 700, color: 'var(--accent-ink)', fontSize: 20 }}>{initials(c.name)}</span>}
        </div>
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, marginTop: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
      {c.score != null && <div style={{ fontSize: 10.5, color: 'var(--accent-ink)', fontWeight: 700 }}>{c.score}%</div>}
    </Link>
  );
}

/** The open conversation thread. */
/** Only ever rendered for a chat that has actually been opened, so the
 *  conversation id is non-null by construction rather than by assertion. */
type OpenChat = DatingChatSummary & { conversationId: string };

function Thread({ chat, meId, mePhoto, onBack }: { chat: OpenChat; meId: string; mePhoto: string | null; onBack: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const unmatch = useUnmatch('romantic');
  const msgs = useMessages(chat.conversationId);
  const [local, setLocal] = useState<Message[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  /* WHAT THE ROOM KNOWS ABOUT THE TWO OF YOU. The same read the profile page
     makes — breakdown, reasons, interests, city — fetched once and cached, so
     the introduction card, the starters, the header's place-line and the
     compatibility sheet all speak from one record. If the read fails (a
     paused profile still chats with an existing match, and its detail can
     404), everything downstream simply says less rather than breaking. */
  const detail = useMatchDetail(chat.otherUserId, 'romantic');
  const d = detail.data ?? null;
  /* The composer seed: a starter tap PLACES words, focused, theirs to edit.
     `n` is a counter so the same suggestion can be placed twice. */
  const [seed, setSeed] = useState<{ text: string; n: number } | null>(null);
  const pick = useCallback((q: string) => setSeed((s) => ({ text: q, n: (s?.n ?? 0) + 1 })), []);
  const [menu, setMenu] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [ideas, setIdeas] = useState(false);
  const [peerTyping, setPeerTyping] = useState(false);
  const typingClear = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /* MIRA, INVITED INTO THIS CONVERSATION (owner, 15 Aug: "add mira to dating
     chats too"). The same panel the city chats carry, scoped the same way:
     what she reads is the window this screen is already showing, handed over
     as a prop, and the server never queries the chat tables for it. A dating
     thread is the conversation people most want a second read on, and it is
     also the one where a stranger's words are least their own to keep — so
     the rule that she stores nothing matters more here, not less. */
  const [confide, setConfide] = useState(false);
  const miraShown = useMiraShown();
  /* THE SAME ROOM AS THE CITY CHAT, not merely the same paint. This panel
     already borrowed the stage; on a phone it was still a card sitting in a
     page, under the city's header, above 'Your other chats', with the whole
     lot scrolling as one document and the composer wherever the scroll left
     it. A conversation is one act wherever you have it. */
  const phone = typeof window !== 'undefined' && window.matchMedia('(max-width: 899px)').matches;
  useChatRoom(true);

  const messages = useMemo(() => {
    const seen = new Set<string>();
    return [...(msgs.data?.items ?? []), ...local].filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)));
  }, [msgs.data, local]);

  /* THE WINDOW MIRA MAY READ: this thread as this screen shows it, words
     only, the last forty turns — the same bound the server enforces. Sides
     are told apart the way the bubbles are. */
  const confideTranscript = useMemo(() =>
    messages
      .filter((m) => !m.deleted && m.body)
      .slice(-40)
      .map((m) => ({
        who: m.senderId === meId ? ('me' as const) : ('them' as const),
        text: (m.body ?? '').slice(0, 1000),
      })),
  [messages, meId]);

  /* LIVE, THE WAY THE CITY CHAT IS LIVE. One socket room does all of it:
     receive (the echo of your own send included — the server addresses the
     room, sender and all, which is what makes send-and-append unnecessary),
     the other side's typing, and the send itself — which is what lets a
     message carry a photograph or a voice note, because the socket schema
     always accepted attachments and REST send never did. */
  const { send: wsSend, setTyping } = useChatRealtime(
    chat.conversationId,
    (m) => {
      setLocal((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
      setPeerTyping(false);
      void qc.invalidateQueries({ queryKey: ['dating', 'chats'] });
    },
    (userId, isTyping) => {
      if (userId === meId) return;
      setPeerTyping(isTyping);
      if (typingClear.current) clearTimeout(typingClear.current);
      // A typing flag with no stop frame behind it must expire on its own.
      if (isTyping) typingClear.current = setTimeout(() => setPeerTyping(false), 6000);
    },
  );

  useEffect(() => () => {
    if (typingClear.current) clearTimeout(typingClear.current);
    if (typingTimer.current) clearTimeout(typingTimer.current);
  }, []);

  useEffect(() => { void chatApi.markRead(chat.conversationId).then(() => qc.invalidateQueries({ queryKey: ['dating', 'chats'] })).catch(() => undefined); }, [chat.conversationId, qc]);
  useEffect(() => { const el = scrollRef.current; if (el) el.scrollTop = el.scrollHeight; }, [messages.length, peerTyping]);

  const handleSend = useCallback((body: string, attachments?: OutgoingAttachment[]) => {
    if (!body.trim() && !attachments?.length) return;
    wsSend(body.trim(), attachments);
  }, [wsSend]);
  /* Typing, said while it is true and taken back when it stops being typed —
     the same 2.5s the city chat uses, so one person reads as one person. */
  const emitTyping = useCallback((t: boolean) => {
    setTyping(t);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    if (t) typingTimer.current = setTimeout(() => setTyping(false), 2500);
  }, [setTyping]);

  const starters = useMemo(() => startersFor({
    name: chat.name, interests: d?.interests, city: d?.city, occupation: d?.occupation,
  }), [chat.name, d]);
  const profileHref = `/dating/match?u=${chat.otherUserId}&kind=romantic`;
  const city = d?.city?.trim() || null;
  const subline = [
    chat.score != null ? `${chat.score}% compatible` : null,
    city ?? (chat.sign || null),
  ].filter(Boolean).join(' · ');

  return (
    /* THE SAME STAGE AS THE CITY CHAT — same classes, same bones, same socket
       — WEARING PORCELAIN (owner, 26 Aug: "make the chat interface white").
       Pure white ground, the city's own charcoal ink, soft neutral tiles for
       their words and soft black for yours. The stage being tokens is what
       lets this room commit to one light while the city chat keeps its
       swatch row, with no component forked to get there. */
    <div className="cstage csthread" data-stage="porcelain" style={{
      display: 'flex',
      /* Full screen on every device: the phone's height is the visible
         viewport (tc-immersive pins the room to it); a desk gets everything
         under the city header. Nothing else renders on this route while a
         conversation is open, so there is nothing to scroll to. */
      height: phone ? 'var(--tc-vvh, 100dvh)' : 'calc(100dvh - var(--header-h) - var(--safe-top) - 40px)',
    }}>
      {/* ── THE HEADER: who, then the two facts, then the doors (§1). The
          face and the name are ONE door to the profile — the tap the owner
          named as important. The percentage is its own door to the sheet,
          because the number staying useful after the match is the point of
          having computed it. Everything destructive lives behind ⋯. */}
      <div className="cshead-t" style={{ gap: 10 }}>
        {/* The city chat's back arrow, down to the chevron — on EVERY device
            now, because the room is the whole screen on every device and this
            is the only door back to the list. */}
        <button type="button" className="csback" aria-label="Back to your dating chats" onClick={onBack}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <Link to={profileHref} aria-label={`Open ${chat.name}’s profile`}
          style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0, textDecoration: 'none' }}>
          <Avatar name={chat.name} photo={chat.photo} size={40} />
          <span style={{ minWidth: 0 }}>
            {/* One identity: the name here is the profile's, the same one the
                match card showed. Nothing here changes anybody's name. */}
            <b style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {chat.name}{chat.age ? `, ${chat.age}` : ''}
            </b>
            <em>{peerTyping ? 'typing…' : subline}</em>
          </span>
        </Link>
        {chat.score != null && (
          <button type="button" className="cspip" style={{ minWidth: 44, border: 0, cursor: 'pointer', fontFamily: 'inherit' }}
            aria-label={`Your compatibility: ${chat.score}% — open the breakdown`}
            title="Your compatibility, opened"
            onClick={() => setSheet(true)}>
            {chat.score}%
          </button>
        )}
        {/* Her whole lockup, as in every other conversation in the city —
            hovering says what she is for. A press invites her into THIS
            thread and nothing else. */}
        {miraShown && (
          <button type="button" className="mira-door" aria-label="Ask Mira about this conversation"
            title="Mira can analyse this chat for you" onClick={() => setConfide(true)}
            style={{ flex: 'none' }}>
            <MiraMark size={48} state="waiting" />
          </button>
        )}
        {/* A call here carries no more identity than the chat does: the avatar
            and name above are already whatever each person chose to show. */}
        <CallButtons conversationId={chat.conversationId} compact />
        <button type="button" className="cstool" aria-label="More options" aria-expanded={menu}
          style={{ flex: 'none' }} onClick={() => setMenu((v) => !v)}>⋯</button>
        {menu && (
          <>
            <button type="button" className="cshead-more-scrim" aria-label="Close menu"
              style={{ border: 0, background: 'transparent', padding: 0, cursor: 'default' }}
              onClick={() => setMenu(false)} />
            <div className="cshead-menu" role="menu" aria-label="Conversation options">
              <button type="button" role="menuitem" onClick={() => { setMenu(false); navigate(profileHref); }}>
                View {chat.name}’s profile
              </button>
              <button type="button" role="menuitem" onClick={() => { setMenu(false); setSheet(true); }}>
                Your compatibility{chat.score != null ? ` · ${chat.score}%` : ''}
              </button>
              {/* Unmatch and block are not the same thing, and the open chat is
                  where that difference matters most. Unmatch frees you to
                  connect with somebody else; block ends it and hides you from
                  each other. Both ask before they act. */}
              <button type="button" role="menuitem" disabled={unmatch.isPending}
                onClick={() => {
                  setMenu(false);
                  if (window.confirm('Unmatch and end this chat? This frees you to connect with someone new.')) {
                    unmatch.mutate(chat.otherUserId, { onSuccess: onBack });
                  }
                }}>
                {unmatch.isPending ? 'Unmatching…' : 'Unmatch'}
              </button>
              <SafetyMenu userId={chat.otherUserId} kind="romantic" compact />
            </div>
          </>
        )}
      </div>

      {confide && (
        <MiraConfidant otherName={chat.name} transcript={confideTranscript}
          onClose={() => setConfide(false)} />
      )}

      {/* ── THE CONVERSATION (§2): the messages, and almost nothing else.
          Before the first word, the room says why you are both in it and
          offers four ways to start (§10); after it, the introduction card
          heads the history the way a first page heads a book (§3). */}
      <div ref={scrollRef} className="csmsgs">
        {msgs.isLoading ? <Spinner /> : messages.length === 0 ? (
          <EmptyIntro name={chat.name} score={chat.score} myPhoto={mePhoto} theirPhoto={chat.photo}
            d={d} onPick={pick} />
        ) : (
          <>
            {messages.map((m, i) => {
              const mine = m.senderId === meId;
              const prev = messages[i - 1];
              const opens = !prev || prev.senderId !== m.senderId;
              return (
                <div key={m.id} style={{ display: 'contents' }}>
                  {opens && (
                    <div className={mine ? 'csatt me' : 'csatt'}>
                      {mine ? <b>You</b> : <b>{chat.name}</b>}
                    </div>
                  )}
                  {/* The whole message, drawn by the one component the city
                      chat draws it with — words, photographs, voice notes,
                      the deleted tombstone — so the two rooms cannot drift
                      into two ideas of what a message is. */}
                  <div style={{
                    alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: 'min(78%, 460px)',
                    display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start',
                  }}>
                    <MessageBody m={m} mine={mine} currentUserId={meId} peerName={chat.name} />
                  </div>
                </div>
              );
            })}
            {peerTyping && <div className="csatt"><i>{chat.name} is typing…</i></div>}
          </>
        )}
      </div>

      {/* ── CONVERSATION IDEAS (§5): one quiet pill, only once there is a
          conversation to stall. The popover offers the same profile-read
          starters and the one door to Mira — no chatbot in the thread. */}
      {messages.length > 0 && (
        <div className="csideas-row">
          {ideas && (
            <ConversationIdeas starters={starters} onPick={pick}
              onMira={() => setConfide(true)} onClose={() => setIdeas(false)} />
          )}
          <button type="button" className="cstab" aria-expanded={ideas}
            onClick={() => setIdeas((v) => !v)}>
            ✨ Conversation ideas
          </button>
        </div>
      )}

      {/* ── THE COMPOSER (§6): the city chat's own capsule — photo and voice
          on the left, one filled send key, typing wired through the socket,
          and the keyboard handled by the same visual-viewport machinery every
          thread already rides. A starter tap lands here as editable words. */}
      <Composer onSend={handleSend} onTyping={emitTyping} seed={seed} />

      {sheet && (
        <CompatibilitySheet name={chat.name} score={chat.score} otherUserId={chat.otherUserId}
          d={d} onClose={() => setSheet(false)} />
      )}
    </div>
  );
}

/** Dating Hub · Chats — the match queue, then the conversations. */
export function DatingChats() {
  // The queue and the list, held whether or not a conversation is open.
  useScaleLock();
  const me = useMe();
  const chats = useDatingChats();
  const [params, setParams] = useSearchParams();
  const openId = params.get('c');

  const list = chats.data ?? [];
  const active = list.find(
    (c): c is OpenChat => c.conversationId !== null && c.conversationId === openId,
  ) ?? null;

  // The queue and the conversations, split once so no branch disagrees.
  const pendingMatches = list.filter((c) => !c.conversationId);
  const opened = list.filter((c) => c.conversationId);
  const open = (id: string) => setParams((p) => { p.set('c', id); return p; });
  const back = () => setParams((p) => { p.delete('c'); return p; }, { replace: true });

  /* AN OPEN CONVERSATION IS THE WHOLE SCREEN — on every device (owner, 26
     Aug: "open in a different window, not like a scrolling effect… a full
     screen chat for each connection"). A phone already got this through
     tc-immersive; what scrolled was everything AROUND the thread — the
     masthead above it and a "Your other chats" list below it, which made the
     room a panel in a page. Now the thread is all there is: one connection,
     one room, and Back is the way to the rest of them. The list this screen
     used to keep visible is one tap away, where a list belongs. */
  if (active && me.data) {
    return <Thread chat={active} meId={me.data.id} mePhoto={me.data.profileImage ?? null} onBack={back} />;
  }

  return (
    <div>
      {chats.isLoading ? (
        <Spinner label="Loading your chats…" />
      ) : chats.isError ? (
        // "No dating chats yet" is the sentence that used to appear here when
        // this request failed. Of everything in the app, it is the one worst
        // suited to being said by mistake: somebody who has matched, and is
        // waiting, being told by the city that nobody is there.
        <EmptyState
          icon="⚠️"
          title="We couldn’t load your chats"
          hint="That’s a problem on our side, not a sign there’s nobody there. Nothing has been lost — try again in a moment."
        />
      ) : list.length === 0 ? (
        <>
          <EmptyState icon="💬" title="No dating chats yet" hint="When you connect with a match, your conversation appears here." />
          <div style={{ textAlign: 'center', marginTop: 14 }}>
            <Link to="/dating/matches"><Button variant="accent">See your matches</Button></Link>
          </div>
        </>
      ) : (
        <>
          {/* The queue: matches waiting for a first message, the way Bumble
              stacks them — faces first, newest matches in front. Tapping one
              opens the connect step, not a thread that does not exist. */}
          {pendingMatches.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div className="eyebrow" style={{ marginBottom: 8 }}>
                New matches · {pendingMatches.length}
              </div>
              <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 4 }}>
                {pendingMatches.map((c) => <MatchBubble key={c.otherUserId} c={c} />)}
              </div>
            </div>
          )}
          {opened.length > 0 && pendingMatches.length > 0 && (
            <div className="eyebrow" style={{ marginBottom: 6 }}>Chats</div>
          )}
          {opened.map((c) => (
            <ChatRow key={c.conversationId} c={c} active={false} onClick={() => open(c.conversationId as string)} />
          ))}
        </>
      )}
    </div>
  );
}
