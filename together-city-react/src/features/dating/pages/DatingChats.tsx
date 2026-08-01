import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button, Spinner, EmptyState } from '@/components/ui';
import { useMe } from '@/api';
import { chatApi, useMessages, useChatRealtime } from '@/api';
import type { Message } from '@/api/schemas';
import { useQueryClient } from '@tanstack/react-query';
import { useDatingChats, useUnmatch, type DatingChatSummary } from '../api';
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
      {initials(name)}
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
            : <span style={{ fontWeight: 700, color: 'var(--accent)', fontSize: 20 }}>{initials(c.name)}</span>}
        </div>
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, marginTop: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
      {c.score != null && <div style={{ fontSize: 10.5, color: 'var(--accent)', fontWeight: 700 }}>{c.score}%</div>}
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'min(72vh, 640px)', border: '1px solid var(--line)', borderRadius: 18, overflow: 'hidden', background: 'var(--card)' }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: '1px solid var(--line)' }}>
        <button type="button" onClick={onBack} aria-label="Back" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--ink-soft)', display: 'none' }} className="tc-chat-back">←</button>
        <Avatar name={chat.name} photo={chat.photo} size={40} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14.5 }}>{chat.name}{chat.sign ? ` · ${chat.sign}` : ''}</div>
          {/* One identity: the name above is the profile's, the same one the
              match card showed. Nothing here changes anybody's name. */}
        </div>
        {chat.score != null && <span className="tag" style={{ background: 'var(--accent-soft)', color: 'var(--accent)', fontWeight: 700 }}>{chat.score}%</span>}
        {/* A call here carries no more identity than the chat does: the avatar
            and name above are already whatever each person chose to show. */}
        <CallButtons conversationId={chat.conversationId} compact />
      </div>

      {/* unmatch / safety bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--paper)', borderBottom: '1px solid var(--line)', flexWrap: 'wrap' }}>
        <span className="muted" style={{ fontSize: 12 }}>
          You appear as yourself — the same name and photos as your profile.
        </span>
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
            <p className="muted" style={{ fontSize: 13 }}>You matched — start the conversation. Keep it kind.</p>
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

/** Dating Hub · Chats — the match queue, then the conversations. */
export function DatingChats() {
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
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '28px 16px' }}>
      <div className="eyebrow">Dating Hub · Chats</div>
      <h1 style={{ fontSize: 26 }}>Your dating chats</h1>
      <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 18px' }}>
        Intentional dating — a few conversations, not endless ones. Everyone appears as themselves, with the same name and photos as their profile. These chats live only here, never in your main Chats.
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
