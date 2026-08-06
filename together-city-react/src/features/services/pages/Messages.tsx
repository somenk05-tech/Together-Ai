import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { Card, Button, Spinner, EmptyState } from '@/components/ui';
import {
  useSendServiceMessage, useServiceInbox, useServiceThread,
  useReviews, usePostReview, useRemoveReview, stars, type ServiceThread,
} from '../api';
import { MenuView } from '../MenuView';

/**
 * REVIEWING FROM THE CONVERSATION YOU HAD.
 *
 * The rule is that only somebody who has messaged a business may review it, and
 * this is where that rule and the button that acts on it live in the same
 * place. There is no "review" affordance anywhere a stranger could reach.
 *
 * IT IS SIGNED WITH THE ALIAS, and the copy says so twice — once before you
 * write and once after. A person about to type something critical deserves to
 * know exactly how much of themselves goes with it, and the answer here is
 * nothing beyond the name this business already calls them.
 *
 * "Spoke to them" is what the gate actually proves. It is not proof the work
 * was done, and nothing on this screen says otherwise.
 */
function ReviewBox({ listingId, alias }: { listingId: string; alias: string }) {
  const q = useReviews(listingId);
  const post = usePostReview(listingId);
  const drop = useRemoveReview(listingId);
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState('');
  const [open, setOpen] = useState(false);

  const mine = q.data?.mine ?? null;
  const chosen = rating || mine?.rating || 0;

  if (q.isLoading || !q.data) return null;

  return (
    <div style={{ borderTop: '1px solid var(--line)', marginTop: 16, paddingTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 14 }}>
          {q.data.rating != null ? `${q.data.rating} out of 5` : 'Not enough reviews yet'}
        </strong>
        <span className="muted" style={{ fontSize: 12.5 }}>
          {q.data.count === 0 ? 'nobody has reviewed this business'
            : `${q.data.count} ${q.data.count === 1 ? 'review' : 'reviews'}`}
          {q.data.rating == null && q.data.count > 0 && ' — an average needs three'}
        </span>
      </div>

      {mine && !open ? (
        <div style={{ marginTop: 8, fontSize: 13.5 }}>
          <span style={{ letterSpacing: 2 }}>{stars(mine.rating)}</span>
          <span className="muted" style={{ marginLeft: 8 }}>your review, signed “{alias}”</span>
          {mine.body && <p style={{ margin: '4px 0 0' }}>{mine.body}</p>}
          {mine.ownerReply && (
            <p style={{ margin: '6px 0 0', paddingLeft: 10, borderLeft: '2px solid var(--line)' }}>
              <span className="muted" style={{ fontSize: 12 }}>They replied: </span>{mine.ownerReply}
            </p>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <Button variant="line" size="sm" onClick={() => { setRating(mine.rating); setBody(mine.body ?? ''); setOpen(true); }}>Change it</Button>
            <Button variant="line" size="sm" disabled={drop.isPending} onClick={() => drop.mutate()}>Remove</Button>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 10 }}>
          <p className="muted" style={{ fontSize: 12.5, margin: '0 0 8px' }}>
            You can review them because you have spoken to them. It will be signed “{alias}” —
            the name they already know you by — and nothing else about you is shared.
          </p>
          <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" onClick={() => setRating(n)}
                aria-label={`${n} out of 5`} aria-pressed={chosen === n}
                style={{ background: 'none', border: 0, cursor: 'pointer', fontSize: 24, lineHeight: 1,
                  padding: '4px 2px', minWidth: 34, minHeight: 44,
                  color: n <= chosen ? 'var(--warn-ink)' : 'var(--line-2)' }}>★</button>
            ))}
          </div>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={1200}
            aria-label="Your review" placeholder="What were they like? Optional."
            style={{ width: '100%', boxSizing: 'border-box', minHeight: 70, resize: 'vertical',
              padding: '10px 12px', border: '1.5px solid var(--line)', borderRadius: 12,
              fontSize: 13.5, fontFamily: 'inherit', background: 'var(--card)' }} />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <Button variant="accent" size="sm" disabled={chosen < 1 || post.isPending}
              onClick={() => post.mutate({ rating: chosen, body: body.trim() || undefined }, { onSuccess: () => setOpen(false) })}>
              {post.isPending ? 'Saving…' : mine ? 'Update review' : 'Leave review'}
            </Button>
            {open && <Button variant="line" size="sm" onClick={() => setOpen(false)}>Cancel</Button>}
          </div>
        </div>
      )}
    </div>
  );
}

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
  const inbox = useServiceInbox();
  if (inbox.isLoading) return <Spinner label="Loading messages…" />;
  if (inbox.isError) return <EmptyState title="Couldn't load your messages" hint="Nothing is lost — try again in a moment." />;

  const seeking = inbox.data?.seeking ?? [];
  const receiving = inbox.data?.receiving ?? [];

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', width: '100%' }}>
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
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const q = useServiceThread(id);
  const send = useSendServiceMessage(id);
  const [body, setBody] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  const count = q.data?.messages.length ?? 0;
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [count]);

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
    <div style={{ maxWidth: 720, margin: '0 auto', width: '100%' }}>
      <button type="button" onClick={() => nav('/services/messages')}
        style={{ background: 'none', border: '1px solid var(--line)', borderRadius: 999, padding: '4px 12px', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit', marginBottom: 12 }}>← Messages</button>

      <h1 style={{ fontSize: 22 }}>{isOwner ? thread.alias : business.businessName}</h1>
      <p className="muted" style={{ fontSize: 12.5, margin: '4px 0 14px' }}>
        {isOwner
          ? `Someone near you, about ${business.businessName}. You do not see their name, and they do not see yours.`
          : `${business.categoryLabel} · ${business.city}. They see you as “${thread.alias}” — your name, handle and photo are not shared.`}
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

      {/* The menu sits in the conversation because that is where asking about
          it happens — picking items writes a message into this same thread. */}
      {!isOwner && <MenuView listingId={thread.listingId} />}

      {/* Only the seeker side reviews — a business cannot review itself, and the
          server refuses it anyway. */}
      {!isOwner && <ReviewBox listingId={thread.listingId} alias={thread.alias} />}

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
