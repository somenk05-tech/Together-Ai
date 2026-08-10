import { useEffect, useRef, useState } from 'react';
import { useChatRoom } from '@/hooks/useChatRoom';
import { useScaleLock } from '@/hooks/useScaleLock';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { Card, Button, Spinner, EmptyState } from '@/components/ui';
import {
  useSendServiceMessage, useServiceInbox, useServiceThread, type ServiceThread,
} from '../api';


/**
 * THE MESSAGE ROOM — IN THIS HUB AND NOWHERE ELSE.
 *
 * These threads are not conversations in the chat hub. They have their own
 * tables on the server for exactly that reason: a room whose whole point is
 * that nobody knows who you are cannot live beside the rooms where everybody
 * does. So there is no socket here and no unread badge in the header; the
 * thread polls while it is open, and the notification that brings you back
 * links into /services rather than /chats.
 *
 * Two sides, two things worth saying:
 *  · a seeker sees the business's name, because a directory that hides both
 *    sides is not a directory;
 *  · a business sees "Neighbour 3" and there is nothing else to see — the
 *    server never puts an identity in the object, so there is nothing here to
 *    render even by mistake.
 */
function when(iso: string): string {
  const d = new Date(iso), now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function ThreadRow({ t, title, sub }: { t: ServiceThread; title: string; sub: string }) {
  return (
    <Link to={`/services/messages/${t.id}`} className="mail-row" style={{ textDecoration: 'none', color: 'inherit' }}>
      <div className="mail-av" style={{ background: t.side === 'owner' ? 'var(--accent)' : 'hsl(210,52%,45%)' }}>
        {t.side === 'owner' ? '⌂' : '✆'}
      </div>
      <div className="mail-body">
        <div className="mail-l1">
          <span className="mail-from">{title}</span>
          <span className="mail-time muted">{when(t.lastMessageAt)}</span>
        </div>
        <div className="mail-l2">
          <span className="mail-snip muted">{sub}</span>
        </div>
      </div>
      {t.unread > 0 && (
        <span style={{ minWidth: 20, height: 20, borderRadius: 999, background: 'var(--danger-ink)', color: 'var(--on-accent)', fontSize: 11, fontWeight: 700, display: 'grid', placeItems: 'center', padding: '0 6px', flexShrink: 0, alignSelf: 'center' }}>
          {t.unread > 9 ? '9+' : t.unread}
        </span>
      )}
    </Link>
  );
}

export function ServiceMessages() {
  useScaleLock();
  const inbox = useServiceInbox();
  if (inbox.isLoading) return <Spinner label="Loading messages…" />;
  if (inbox.isError) return <EmptyState title="Couldn't load your messages" hint="Nothing is lost — try again in a moment." />;

  const seeking = inbox.data?.seeking ?? [];
  const receiving = inbox.data?.receiving ?? [];

  return (
    <div>
      <div className="eyebrow">Local Services</div>
      <h1 style={{ fontSize: 26 }}>Messages</h1>
      <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 18px', maxWidth: '62ch' }}>
        These conversations live here only. They are not in your Chats, and the people you
        message do not learn your name.
      </p>

      {seeking.length === 0 && receiving.length === 0 && (
        <EmptyState title="No conversations yet" hint="Message a business from Find a service, or list your own and wait for a neighbour." />
      )}

      {receiving.length > 0 && (
        <>
          <div className="eyebrow" style={{ marginTop: 8 }}>People asking you</div>
          <Card className="mail-list" style={{ padding: 0, overflow: 'hidden', marginBottom: 18 }}>
            {receiving.map((t) => (
              <ThreadRow key={t.id} t={t} title={t.alias} sub={t.businessName ? `about ${t.businessName}` : 'about your listing'} />
            ))}
          </Card>
        </>
      )}

      {seeking.length > 0 && (
        <>
          <div className="eyebrow">Businesses you asked</div>
          <Card className="mail-list" style={{ padding: 0, overflow: 'hidden' }}>
            {seeking.map((t) => (
              <ThreadRow key={t.id} t={t}
                title={t.business?.businessName ?? 'A business'}
                sub={`${t.business?.categoryLabel ?? ''}${t.business?.city ? ` · ${t.business.city}` : ''} — you appear as ${t.alias}`} />
            ))}
          </Card>
        </>
      )}
    </div>
  );
}

export function ServiceThreadView() {
  /* THE SAME ROOM, NOT THE SAME PAINT.
     This thread is a white card with a black bubble and stays that way: it
     belongs to a business's world rather than the city chat's, and nobody
     asked for it to be repainted. What it takes from the master chat is the
     part that was never decoration — on a phone the conversation is the whole
     screen, the card is the only thing that scrolls, and the box you type in
     sits above the keyboard instead of underneath it. */
  useChatRoom(true);
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const q = useServiceThread(id);
  const send = useSendServiceMessage(id);
  const [body, setBody] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  const count = q.data?.messages.length ?? 0;
  /* The card scrolls itself. scrollIntoView asks every scrollable ancestor to
     move, and the outermost one here is the page — so a reply arriving pulled
     the business's name off the top of the screen on its way to the newest
     line. endRef is a direct child of the card, so its parent IS the box. */
  useEffect(() => {
    const box = endRef.current?.parentElement;
    if (box) box.scrollTop = box.scrollHeight;
  }, [count]);

  if (q.isLoading) return <Spinner label="Opening…" />;
  if (q.isError || !q.data) return <EmptyState title="Couldn't open this conversation" hint="It may have been closed." />;

  const { thread, business, messages } = q.data;
  const isOwner = thread.side === 'owner';

  const submit = () => {
    const b = body.trim();
    if (!b) return;
    send.mutate(b, { onSuccess: () => setBody('') });
  };

  return (
    /* `csroom` does nothing at all until the flag is on <html>, which is to
       say: on a phone, with this thread open. Then it becomes the column the
       stylesheet describes — and the markup below is untouched, because the
       order was already right. */
    <div className="csroom">
      <button type="button" onClick={() => nav('/services/messages')}
        style={{ background: 'none', border: '1px solid var(--line)', borderRadius: 999, padding: '4px 12px', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit', marginBottom: 12 }}>← Messages</button>

      <h1 style={{ fontSize: 22 }}>{isOwner ? thread.alias : business.businessName}</h1>
      <p className="muted" style={{ fontSize: 12.5, margin: '4px 0 14px' }}>
        {isOwner
          ? `Someone near you, about ${business.businessName}. You do not see their name, and they do not see yours.`
          : `${business.categoryLabel} · ${business.city}. They see you as “${thread.alias}” — your name, handle and photo are not shared.`}
        {/* The way to their page, and so to their number if they published one.
            The thread deliberately carries only four fields about the business;
            widening it to hold a phone would put a number in a payload whose
            whole job is to carry as little as possible. */}
        {!isOwner && business.id && (
          <>
            {' '}
            <Link to={`/services/${business.id}`} style={{ fontWeight: 600, color: 'var(--accent-ink)' }}>
              See their page, prices and reviews
            </Link>
          </>
        )}
      </p>

      <Card style={{ padding: 14, display: 'grid', gap: 10, maxHeight: '52vh', overflowY: 'auto' }}>
        {messages.length === 0 && <p className="muted" style={{ fontSize: 13, margin: 0 }}>No messages yet — say what you need.</p>}
        {messages.map((m) => (
          <div key={m.id} style={{ display: 'flex', justifyContent: m.mine ? 'flex-end' : 'flex-start' }}>
            <div style={{
              maxWidth: '78%', padding: '9px 13px', borderRadius: 14, fontSize: 14, lineHeight: 1.45,
              background: m.mine ? 'var(--accent)' : 'var(--wash)',
              color: m.mine ? 'var(--on-accent)' : 'var(--ink)',
            }}>
              <span style={{ whiteSpace: 'pre-wrap' }}>{m.body}</span>
              <span style={{ display: 'block', fontSize: 10.5, opacity: .7, marginTop: 3 }}>{when(m.createdAt)}</span>
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </Card>

      {/* THE PRICE LIST IS NOT IN HERE.
         It lived in the thread while the thread was the only surface a
         business had. A business has a page now, the list belongs on it, and
         sixty-two ticked rows underneath a conversation make a chat window
         you have to scroll past a catalogue to reach. Picking items there
         still writes a message into this same thread — the header links
         straight to it. */}

      {/* Only the seeker side reviews — a business cannot review itself, and the
          server refuses it anyway. */}
      {/* REVIEWING IS NOT IN HERE EITHER.
          A star rating under a live conversation asks somebody to grade the
          person they are mid-sentence with. It belongs on the business page,
          beside the other reviews, where a citizen goes to decide — and the
          gate is unchanged: only somebody who has spoken to this business can
          write one, still signed with the name that business already knows
          them by. The header links straight there. */}

      {thread.closed ? (
        <p className="muted" style={{ fontSize: 13, marginTop: 12 }}>This conversation is closed. What was said stays here.</p>
      ) : (
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <input value={body} onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
            aria-label="Your message" placeholder="Write a message…" maxLength={4000}
            style={{ flex: 1, minWidth: 0, padding: '12px 14px', border: '1.5px solid var(--line)', borderRadius: 12, fontSize: 14, fontFamily: 'inherit', background: 'var(--card)' }} />
          <Button variant="accent" disabled={!body.trim() || send.isPending} onClick={submit}>
            {send.isPending ? '…' : 'Send'}
          </Button>
        </div>
      )}
    </div>
  );
}
