import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { animate, motion, useMotionValue } from 'framer-motion';
import { Link, useSearchParams } from 'react-router-dom';
import { Button, Spinner, EmptyState } from '@/components/ui';
import { useMe } from '@/api';
import { chatApi, useMessages, useChatRealtime } from '@/api';
import type { Message } from '@/api/schemas';
import { useQueryClient } from '@tanstack/react-query';
import { useDatingChats, useUnmatch, type DatingChatSummary } from '../api';
import { CallButtons } from '@/features/calls/CallButtons';
import { SafetyMenu } from '../components/SafetyMenu';
import { MiraMark } from '@/features/chat/mira/MiraMark';
import { MiraConfidant } from '@/features/chat/mira/MiraConfidant';
import { useChatRoom } from '@/hooks/useChatRoom';
import { useScaleLock } from '@/hooks/useScaleLock';

/** The one spring in this file, named so the drawer and the snap-back cannot
 *  drift into two different feels. Low bounce: this is a drawer, not a toy. */
const SPRING = { type: 'spring' as const, duration: 0.32, bounce: 0.14 };

/** Initials for the masked/real avatar. */
function initials(name: string): string {
  return (name || '?').split(' ').map((w) => w[0] || '').join('').slice(0, 2).toUpperCase();
}

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  if (!t || t < 1) return '';
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
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
    <button type="button" onClick={() => { if (open) { close(); return; } onClick(); }} style={{
      display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
      padding: '12px 12px', borderRadius: 'var(--r-2)', border: '1px solid var(--line)',
      background: active ? 'var(--accent-soft)' : 'var(--card)',
    }}>
      <Avatar name={c.name} photo={c.photo} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
          <span className="muted" style={{ marginLeft: 'auto', fontSize: 11.5, flex: 'none' }}>{timeAgo(c.lastMessageAt)}</span>
        </div>
        <div className="muted" style={{ fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 }}>
          {c.lastText ? `${c.lastFromMe ? 'You: ' : ''}${c.lastText}` : 'Say hello 👋'}
        </div>
      </div>
      {c.unread > 0 && <span style={{ flex: 'none', minWidth: 20, height: 20, borderRadius: 'var(--r-full)', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 11, fontWeight: 700, display: 'grid', placeItems: 'center', padding: '0 6px' }}>{c.unread}</span>}
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

function Thread({ chat, meId, onBack }: { chat: OpenChat; meId: string; onBack: () => void }) {
  const qc = useQueryClient();
  const unmatch = useUnmatch('romantic');
  const msgs = useMessages(chat.conversationId);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [local, setLocal] = useState<Message[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  /* MIRA, INVITED INTO THIS CONVERSATION (owner, 15 Aug: "add mira to dating
     chats too"). The same panel the city chats carry, scoped the same way:
     what she reads is the window this screen is already showing, handed over
     as a prop, and the server never queries the chat tables for it. A dating
     thread is the conversation people most want a second read on, and it is
     also the one where a stranger's words are least their own to keep — so
     the rule that she stores nothing matters more here, not less. */
  const [confide, setConfide] = useState(false);
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

  useChatRealtime(chat.conversationId, (m) => setLocal((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m])));

  useEffect(() => { void chatApi.markRead(chat.conversationId).then(() => qc.invalidateQueries({ queryKey: ['dating', 'chats'] })).catch(() => undefined); }, [chat.conversationId, qc]);
  useEffect(() => { const el = scrollRef.current; if (el) el.scrollTop = el.scrollHeight; }, [messages.length]);

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true); setDraft('');
    try {
      const m = await chatApi.send(chat.conversationId, body);
      setLocal((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
      void qc.invalidateQueries({ queryKey: ['dating', 'chats'] });
    } catch { setDraft(body); } finally { setSending(false); }
  };

  return (
    /* THE SAME STAGE AS THE CITY CHAT. A conversation is one thing wherever
       you have it, so it is made of one material — the dark panel, the white
       tile pressed in, the black tile raised. The candy ground the Dating hub
       won stays exactly where it is: on the page AROUND this panel. */
    <div className="cstage csthread" style={{ display: 'flex', height: phone ? 'var(--tc-vvh, 100dvh)' : 'min(72vh, 640px)' }}>
      {/* header */}
      <div className="cshead-t" style={{ gap: 10 }}>
        {/* The city chat's back arrow, down to the chevron: on a phone this is
            now the only way out of the room, and two different arrows for the
            same door is how one app starts feeling like two. */}
        {phone && (
          <button type="button" className="csback" aria-label="Back to your dating chats" onClick={onBack}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
        )}
        <Avatar name={chat.name} photo={chat.photo} size={40} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <b>{chat.name}{chat.sign ? ` · ${chat.sign}` : ''}</b>
          {/* One identity: the name above is the profile's, the same one the
              match card showed. Nothing here changes anybody's name. */}
        </div>
        {chat.score != null && <span className="cspip" style={{ minWidth: 44 }}>{chat.score}%</span>}
        {/* Her whole lockup, as in every other conversation in the city —
            hovering says what she is for. A press invites her into THIS
            thread and nothing else. */}
        <button type="button" className="mira-door" aria-label="Ask Mira about this conversation"
          title="Mira can analyse this chat for you" onClick={() => setConfide(true)}
          style={{ flex: 'none' }}>
          <MiraMark size={48} state="waiting" />
        </button>
        {/* A call here carries no more identity than the chat does: the avatar
            and name above are already whatever each person chose to show. */}
        <CallButtons conversationId={chat.conversationId} compact />
      </div>

      {/* unmatch / safety bar */}
      <div style={{ display: 'flex', flex: 'none', alignItems: 'center', gap: 8, padding: '9px 16px', background: 'var(--stage-well)', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: 'var(--on-stage-faint)' }}>
          You appear as yourself — the same name and photos as your profile.
        </span>
        <button type="button" className="cstab" style={{ marginLeft: 'auto' }}
          disabled={unmatch.isPending}
          onClick={() => { if (window.confirm('Unmatch and end this chat? This frees you to connect with someone new.')) unmatch.mutate(chat.otherUserId, { onSuccess: onBack }); }}>
          Unmatch
        </button>
        {/* Unmatch and block are not the same thing, and the open chat is where
            that difference matters most. Unmatch frees you to connect with
            somebody else; block ends it and hides you from each other. */}
        <SafetyMenu userId={chat.otherUserId} kind="romantic" compact />
      </div>

      {confide && (
        <MiraConfidant otherName={chat.name} transcript={confideTranscript}
          onClose={() => setConfide(false)} />
      )}

      {/* messages */}
      <div ref={scrollRef} className="csmsgs">
        {msgs.isLoading ? <Spinner /> : messages.length === 0 ? (
          <div style={{ margin: 'auto', textAlign: 'center', maxWidth: 260 }}>
            <div style={{ fontSize: 30 }}>💬</div>
            <p style={{ fontSize: 13, color: 'var(--on-stage-faint)', lineHeight: 1.55 }}>You matched — start the conversation. Keep it kind.</p>
          </div>
        ) : messages.map((m, i) => {
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
              <div className={mine ? 'csb me' : 'csb'} style={{ maxWidth: 'min(70%, 460px)' }}>{m.body}</div>
            </div>
          );
        })}
      </div>

      {/* composer */}
      <div className="cscomposer">
        <input value={draft} placeholder="Write a message…" aria-label="Write a message"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void send(); } }} />
        <button type="button" className="cssend" aria-label="Send"
          disabled={sending || !draft.trim()} onClick={() => void send()}>➤</button>
      </div>
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
  const others = opened.filter((c) => c.conversationId !== active?.conversationId);
  const open = (id: string) => setParams((p) => { p.set('c', id); return p; });
  const back = () => setParams((p) => { p.delete('c'); return p; }, { replace: true });

  return (
    <div>
      <div className="eyebrow">Dating Hub · Chats</div>
      <h1 style={{ fontSize: 26 }}>Your dating chats</h1>
      <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 18px' }}>
        A few conversations, not endless ones. These chats live only here — never in your main Chats.
      </p>

      {active ? (
        <>
          {me.data && <Thread chat={active} meId={me.data.id} onBack={back} />}
          {/* Opening a chat used to REPLACE the whole list, which was survivable
              when only one could exist and is not now: the other people you are
              talking to simply vanished until you pressed Back. They stay. */}
          {others.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <div className="eyebrow" style={{ marginBottom: 6 }}>
                Your other {others.length === 1 ? 'chat' : 'chats'}
              </div>
              {others.map((c) => (
                <ChatRow key={c.conversationId} c={c} active={false} onClick={() => open(c.conversationId as string)} />
              ))}
            </div>
          )}
        </>
      ) : chats.isLoading ? (
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
