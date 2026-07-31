import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button, Spinner, EmptyState } from '@/components/ui';
import { useMe } from '@/api';
import { chatApi, useMessages, useChatRealtime } from '@/api';
import type { Message } from '@/api/schemas';
import { useQueryClient } from '@tanstack/react-query';
import { useDatingChats, useRevealMatch, useUnmatch, type DatingChatSummary } from '../api';
import { CallButtons } from '@/features/calls/CallButtons';
import { SafetyMenu } from '../components/SafetyMenu';

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
      background: 'var(--accent-soft)', color: 'var(--accent)', fontWeight: 700, fontSize: size * 0.36 }}>
      {photo === null ? '🕶' : initials(name)}
    </div>
  );
}

/** One row in the chat list. */
function ChatRow({ c, active, onClick }: { c: DatingChatSummary; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
      padding: '12px 12px', borderRadius: 14, border: '1px solid var(--line)', marginBottom: 8,
      background: active ? 'var(--accent-soft)' : 'var(--card)',
    }}>
      <Avatar name={c.name} photo={c.photo} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 14.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
          {!c.revealed && <span className="tag" style={{ fontSize: 10 }}>Anonymous</span>}
          <span className="muted" style={{ marginLeft: 'auto', fontSize: 11.5, flex: 'none' }}>{timeAgo(c.lastMessageAt)}</span>
        </div>
        <div className="muted" style={{ fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 }}>
          {c.lastText ? `${c.lastFromMe ? 'You: ' : ''}${c.lastText}` : 'Say hello 👋'}
        </div>
      </div>
      {c.unread > 0 && <span style={{ flex: 'none', minWidth: 20, height: 20, borderRadius: 999, background: 'var(--accent)', color: '#fff', fontSize: 11, fontWeight: 700, display: 'grid', placeItems: 'center', padding: '0 6px' }}>{c.unread}</span>}
    </button>
  );
}

const bubbleBase: CSSProperties = { maxWidth: '76%', padding: '9px 13px', borderRadius: 14, fontSize: 13.5, lineHeight: 1.4, wordBreak: 'break-word' };

/** A mutual match whose chat has not been opened yet. */
function PendingRow({ c }: { c: DatingChatSummary }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, width: '100%',
      padding: '12px 12px', borderRadius: 14, border: '1px solid var(--line)', marginBottom: 8, background: 'var(--card)',
    }}>
      <Avatar name={c.name} photo={c.photo} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 14.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
          <span className="tag" style={{ fontSize: 10, background: 'var(--accent-soft)', color: 'var(--accent)', fontWeight: 700 }}>💫 Matched</span>
        </div>
        <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>You both liked each other — start the conversation.</div>
      </div>
      <Link to={`/dating/match?u=${c.otherUserId}`} style={{ flex: 'none' }}>
        <Button size="sm" variant="accent">Connect to chat</Button>
      </Link>
    </div>
  );
}

/** The open conversation thread — anonymous until both reveal. */
/** Only ever rendered for a chat that has actually been opened, so the
 *  conversation id is non-null by construction rather than by assertion. */
type OpenChat = DatingChatSummary & { conversationId: string };

function Thread({ chat, meId, onBack }: { chat: OpenChat; meId: string; onBack: () => void }) {
  const qc = useQueryClient();
  const reveal = useRevealMatch();
  const unmatch = useUnmatch('romantic');
  const msgs = useMessages(chat.conversationId);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [local, setLocal] = useState<Message[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const messages = useMemo(() => {
    const seen = new Set<string>();
    return [...(msgs.data?.items ?? []), ...local].filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)));
  }, [msgs.data, local]);

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

  // Two independent facts now, not one shared state: how THEY appear to you
  // (their choice) and how YOU appear to them (yours).
  const iAmReal = chat.myIdentity === 'real';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'min(72vh, 640px)', border: '1px solid var(--line)', borderRadius: 18, overflow: 'hidden', background: 'var(--card)' }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: '1px solid var(--line)' }}>
        <button type="button" onClick={onBack} aria-label="Back" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--ink-soft)', display: 'none' }} className="tc-chat-back">←</button>
        <Avatar name={chat.name} photo={chat.photo} size={40} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14.5 }}>{chat.name}{chat.otherReveal && chat.sign ? ` · ${chat.sign}` : ''}</div>
          <div className="muted" style={{ fontSize: 11.5 }}>
            {chat.otherReveal ? 'Chatting as themselves' : 'Chatting anonymously — only they can share their name'}
          </div>
        </div>
        {chat.score != null && <span className="tag" style={{ background: 'var(--accent-soft)', color: 'var(--accent)', fontWeight: 700 }}>{chat.score}%</span>}
        {/* A call here carries no more identity than the chat does: the avatar
            and name above are already whatever each person chose to show. */}
        <CallButtons conversationId={chat.conversationId} compact />
      </div>

      {/* identity / unmatch bar — YOUR name is your decision, taken here */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--paper)', borderBottom: '1px solid var(--line)', flexWrap: 'wrap' }}>
        <span className="muted" style={{ fontSize: 12 }}>
          You’re chatting as <strong style={{ color: 'var(--ink)' }}>{iAmReal ? 'yourself' : chat.myNickname}</strong>
        </span>
        <Button
          size="sm"
          variant={iAmReal ? 'line' : 'accent'}
          disabled={reveal.isPending}
          onClick={() => {
            // Going back to the pseudonym cannot un-send what they already saw,
            // so say that plainly instead of implying it can be undone.
            if (iAmReal && !window.confirm('Chat as “' + chat.myNickname + '” from now on? They won’t see your name or photo going forward, but this can’t unsend what they’ve already seen.')) return;
            reveal.mutate({ targetUserId: chat.otherUserId, show: !iAmReal });
          }}
        >
          {reveal.isPending ? '…' : iAmReal ? `Switch to ${chat.myNickname}` : 'Use my real name'}
        </Button>
        {chat.revealed && <span style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600 }}>✓ You both use your real names</span>}
        <Button size="sm" variant="line" style={{ marginLeft: 'auto', color: '#c62828', borderColor: '#f0b0b0' }}
          disabled={unmatch.isPending}
          onClick={() => { if (window.confirm('Unmatch and end this chat? This frees you to connect with someone new.')) unmatch.mutate(chat.otherUserId, { onSuccess: onBack }); }}>
          Unmatch
        </Button>
        {/* Unmatch and block are not the same thing, and the open chat is where
            that difference matters most. Unmatch frees you to connect with
            somebody else; block ends it and hides you from each other. */}
        <SafetyMenu userId={chat.otherUserId} kind="romantic" compact />
      </div>

      {/* messages */}
      <div ref={scrollRef} style={{ flex: 1, overflow: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--card)' }}>
        {msgs.isLoading ? <Spinner /> : messages.length === 0 ? (
          <div style={{ margin: 'auto', textAlign: 'center', maxWidth: 260 }}>
            <div style={{ fontSize: 30 }}>💬</div>
            <p className="muted" style={{ fontSize: 13 }}>You matched — start the conversation. Keep it kind; reveal when you’re both ready.</p>
          </div>
        ) : messages.map((m) => {
          const mine = m.senderId === meId;
          return (
            <div key={m.id} style={{ ...bubbleBase, alignSelf: mine ? 'flex-end' : 'flex-start',
              background: mine ? 'var(--accent)' : 'var(--paper)', color: mine ? '#fff' : 'var(--ink)',
              borderBottomRightRadius: mine ? 5 : 14, borderBottomLeftRadius: mine ? 14 : 5 }}>
              {m.body}
            </div>
          );
        })}
      </div>

      {/* composer */}
      <div style={{ display: 'flex', gap: 8, padding: '12px 14px', borderTop: '1px solid var(--line)' }}>
        <input value={draft} placeholder="Message…" onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void send(); } }}
          style={{ flex: 1, border: '1px solid var(--line)', borderRadius: 12, padding: '10px 13px', fontSize: 14, fontFamily: 'inherit', outline: 'none', background: 'var(--card)', color: 'var(--ink)' }} />
        <Button variant="accent" disabled={sending || !draft.trim()} onClick={() => void send()}>Send</Button>
      </div>
    </div>
  );
}

/** Dating Hub · Chats — anonymous, one-at-a-time match conversations. */
export function DatingChats() {
  const me = useMe();
  const chats = useDatingChats();
  const [params, setParams] = useSearchParams();
  const openId = params.get('c');

  const list = chats.data ?? [];
  const active = list.find(
    (c): c is OpenChat => c.conversationId !== null && c.conversationId === openId,
  ) ?? null;

  // Everything that is not the thread on screen. Computed here rather than
  // inside the branch so the empty case and the switching case cannot disagree
  // about what "your other chats" means.
  const others = list.filter((c) => c.conversationId !== active?.conversationId);
  const open = (id: string) => setParams((p) => { p.set('c', id); return p; });
  const back = () => setParams((p) => { p.delete('c'); return p; }, { replace: true });

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '28px 16px' }}>
      <div className="eyebrow">Dating Hub · Chats</div>
      <h1 style={{ fontSize: 26 }}>Your dating chats</h1>
      <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 18px' }}>
        Intentional dating — a few conversations, not endless ones. You choose whether to chat under your own name or a pseudonym, and so do they. These chats live only here, never in your main Chats.
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
                c.conversationId
                  ? <ChatRow key={c.conversationId} c={c} active={false} onClick={() => open(c.conversationId as string)} />
                  : <PendingRow key={c.otherUserId} c={c} />
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
          <EmptyState icon="💬" title="No dating chats yet" hint="When you connect with a match, your anonymous conversation appears here." />
          <div style={{ textAlign: 'center', marginTop: 14 }}>
            <Link to="/dating/matches"><Button variant="accent">See your matches</Button></Link>
          </div>
        </>
      ) : (
        list.map((c) => (
          c.conversationId
            ? <ChatRow key={c.conversationId} c={c} active={false} onClick={() => open(c.conversationId as string)} />
            // A match with no chat yet. It belongs on this page — it is the
            // reason the citizen came here — but it opens the connect step
            // rather than a thread that does not exist.
            : <PendingRow key={c.otherUserId} c={c} />
        ))
      )}
    </div>
  );
}
