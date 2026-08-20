import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, Button, Spinner, EmptyState } from '@/components/ui';
import {
  useCloseService, useDeleteServiceForever, useMyServices, useServiceInbox, useMyOffers,
  usePostOffer, useRemoveOffer, useReviews, useReplyToReview, rupees, offerWhen, stars,
} from '../api';
import { MenuEditor } from '../MenuEditor';
import { HoursEditor, OpenBadge } from '../HoursEditor';
import { VerificationTab } from '../Verification';

/**
 * WHAT NEIGHBOURS SAID, AND THE ONE ANSWER YOU GET.
 *
 * The owner sees the alias — the same one from the conversation, so they can
 * connect the review to the exchange they remember — and nothing else. There is
 * no name to see because the server never put one in the object.
 *
 * One reply per review. A thread under a rating is a second conversation in a
 * place built for one, and the room for that already exists.
 */
function ReviewsReceived({ listingId }: { listingId: string }) {
  const q = useReviews(listingId);
  const reply = useReplyToReview();
  const [openId, setOpenId] = useState<string | null>(null);
  const [text, setText] = useState('');

  const rows = q.data?.items ?? [];
  if (q.isLoading || rows.length === 0) return null;

  return (
    <div style={{ borderTop: '1px solid var(--line)', paddingTop: 10, marginTop: 4 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 13.5 }}>Reviews</strong>
        <span className="muted" style={{ fontSize: 12.5 }}>
          {q.data?.rating != null ? `${q.data.rating} out of 5 · ${q.data.count}` : `${q.data?.count} — too few for an average`}
        </span>
      </div>
      <div style={{ display: 'grid', gap: 10, marginTop: 8 }}>
        {rows.map((r) => (
          <div key={r.id} style={{ fontSize: 13 }}>
            <span style={{ color: 'var(--warn-ink)', letterSpacing: 1 }}>{stars(r.rating)}</span>
            <span className="muted" style={{ marginLeft: 8 }}>{r.alias}</span>
            {r.body && <p style={{ margin: '3px 0 0' }}>{r.body}</p>}
            {r.ownerReply ? (
              <p style={{ margin: '5px 0 0', paddingLeft: 10, borderLeft: '2px solid var(--line)' }}>
                <span className="muted" style={{ fontSize: 12 }}>You replied: </span>{r.ownerReply}
              </p>
            ) : openId === r.id ? (
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <input value={text} onChange={(e) => setText(e.target.value)} maxLength={1200}
                  aria-label={`Reply to ${r.alias}`} placeholder="Answer them…"
                  style={{ flex: 1, minWidth: 0, padding: '8px 11px', border: '1.5px solid var(--line)', borderRadius: 10, fontSize: 13, fontFamily: 'inherit', background: 'var(--card)' }} />
                <Button variant="accent" size="sm" disabled={!text.trim() || reply.isPending}
                  onClick={() => reply.mutate({ reviewId: r.id, reply: text.trim() }, { onSuccess: () => { setText(''); setOpenId(null); } })}>Reply</Button>
              </div>
            ) : (
              <button type="button" onClick={() => { setOpenId(r.id); setText(''); }}
                style={{ marginTop: 4, background: 'none', border: 0, cursor: 'pointer', color: 'var(--accent-ink)', fontWeight: 600, fontFamily: 'inherit', fontSize: 12.5 }}>Reply</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const today = () => new Date().toISOString().slice(0, 10);

/**
 * TODAY'S OFFER, POSTED BY THE PERSON WHO IS OFFERING IT.
 *
 * Dates, not a switch. An offer with an on/off flag is one somebody has to
 * remember to turn off, and the ones nobody remembers are exactly the ones that
 * make a Daily Offers page not worth opening. The end date defaults to the
 * start, so "today only" is the least work to say and forever is the most.
 */
function Offers({ listingId }: { listingId: string }) {
  const q = useMyOffers(listingId);
  const post = usePostOffer();
  const remove = useRemoveOffer();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [startsOn, setStarts] = useState(today());
  const [endsOn, setEnds] = useState(today());
  const [err, setErr] = useState<string | null>(null);

  const field = { padding: '9px 11px', border: '1.5px solid var(--line)', borderRadius: 10, fontSize: 13.5, fontFamily: 'inherit', background: 'var(--card)', width: '100%', boxSizing: 'border-box' as const };

  const submit = () => {
    setErr(null);
    post.mutate({ listingId, input: { title: title.trim(), detail: detail.trim() || undefined, startsOn, endsOn } }, {
      onSuccess: () => { setTitle(''); setDetail(''); setOpen(false); },
      onError: (e: unknown) => {
        const raw = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
        setErr(Array.isArray(raw) ? raw.join(', ') : raw ?? 'Could not post that offer.');
      },
    });
  };

  const rows = q.data?.items ?? [];
  const live = rows.filter((o) => o.live);

  return (
    <div style={{ borderTop: '1px solid var(--line)', paddingTop: 10, marginTop: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 13.5 }}>Offers</strong>
        <span className="muted" style={{ fontSize: 12.5 }}>
          {live.length === 0 ? 'Nothing running' : `${live.length} running`}
        </span>
        <Button variant="line" size="sm" onClick={() => setOpen((v) => !v)}>
          {open ? 'Cancel' : 'Post an offer'}
        </Button>
      </div>

      {open && (
        <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
          <input style={field} value={title} onChange={(e) => setTitle(e.target.value)}
            aria-label="Offer" placeholder="20% off drain cleaning" maxLength={90} />
          <input style={field} value={detail} onChange={(e) => setDetail(e.target.value)}
            aria-label="Offer detail" placeholder="Anything worth adding — conditions, timings" maxLength={400} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 8 }}>
            <label style={{ fontSize: 12 }}>
              <span className="muted">From</span>
              <input type="date" style={field} value={startsOn} onChange={(e) => { setStarts(e.target.value); if (endsOn < e.target.value) setEnds(e.target.value); }} />
            </label>
            <label style={{ fontSize: 12 }}>
              <span className="muted">Until</span>
              <input type="date" style={field} value={endsOn} min={startsOn} onChange={(e) => setEnds(e.target.value)} />
            </label>
          </div>
          {err && <p style={{ color: 'var(--danger-ink)', fontSize: 12.5, margin: 0 }} role="alert">{err}</p>}
          <div>
            <Button variant="accent" size="sm" disabled={title.trim().length < 3 || post.isPending} onClick={submit}>
              {post.isPending ? 'Posting…' : 'Post it'}
            </Button>
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <div style={{ display: 'grid', gap: 6, marginTop: 10 }}>
          {rows.map((o) => (
            <div key={o.id} style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 13, opacity: o.live ? 1 : 0.55 }}>
              <span style={{ fontWeight: 600 }}>{o.title}</span>
              <span className="muted" style={{ fontSize: 11.5 }}>{o.live ? offerWhen(o) : 'Finished'}</span>
              <button type="button" onClick={() => remove.mutate(o.id)} disabled={remove.isPending}
                aria-label={`Remove offer ${o.title}`}
                style={{ marginLeft: 'auto', background: 'none', border: 0, cursor: 'pointer', color: 'var(--muted)', fontFamily: 'inherit', fontSize: 12.5 }}>Remove</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * MY BUSINESS.
 *
 * Closing is not deleting: the listing leaves the directory and every
 * conversation already inside it stays readable. Somebody who was mid-
 * conversation about a job on Tuesday should not find the room gone on
 * Wednesday because the business took a week off.
 */
/**
 * DELETING A CLOSED LISTING, IN TWO PRESSES.
 *
 * No dialog, and no typed confirmation. What makes this safe is not friction —
 * it is that the second press states, in the owner's own numbers, exactly what
 * stops existing. A modal saying "are you sure?" asks a question nobody has the
 * information to answer.
 */
function DeleteForever({ id, name, conversations }: { id: string; name: string; conversations: number }) {
  const del = useDeleteServiceForever();
  const [armed, setArmed] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!armed) {
    return (
      <Button variant="line" size="sm" onClick={() => { setArmed(true); setErr(null); }}>
        Delete permanently
      </Button>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <p style={{ fontSize: 13, margin: 0 }}>
        Delete <strong>{name}</strong> for good? Its reviews, menu and offers go with it
        {conversations > 0 && <>, and so do <strong>{conversations} {conversations === 1 ? 'conversation' : 'conversations'}</strong> — we will tell the {conversations === 1 ? 'neighbour' : 'neighbours'} in {conversations === 1 ? 'it' : 'them'}</>}.
        This cannot be undone.
      </p>
      {err && <p role="alert" style={{ color: 'var(--danger-ink)', fontSize: 12.5, margin: 0 }}>{err}</p>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button variant="line" size="sm" onClick={() => setArmed(false)}>Keep it</Button>
        <Button variant="accent" size="sm" disabled={del.isPending}
          onClick={() => del.mutate(id, {
            onError: (e: unknown) => {
              const raw = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
              setErr(Array.isArray(raw) ? raw.join(', ') : raw ?? 'That could not be deleted just now.');
            },
          })}>
          {del.isPending ? 'Deleting…' : 'Delete it'}
        </Button>
      </div>
    </div>
  );
}

export function MyBusiness() {
  const mine = useMyServices();
  const inbox = useServiceInbox();
  const close = useCloseService();

  const asked = new Map<string, number>();
  for (const t of inbox.data?.receiving ?? []) {
    asked.set(t.listingId, (asked.get(t.listingId) ?? 0) + 1);
  }

  if (mine.isLoading) return <Spinner label="Loading your listings…" />;
  if (mine.isError) return <EmptyState title="Couldn't load your listings" hint="Nothing has been removed — try again in a moment." />;

  const rows = mine.data ?? [];
  if (rows.length === 0) {
    return (
      <div>
        <div className="eyebrow">Local Services</div>
        <h1 style={{ fontSize: 26 }}>My business</h1>
        <EmptyState
          title="You haven't listed anything yet"
          hint="Pick a category, say where you work, and people nearby can find you."
        />
        <Link to="/services/list"><Button variant="accent">List your business</Button></Link>
      </div>
    );
  }

  return (
    <div>
      <div className="eyebrow">Local Services</div>
      <h1 style={{ fontSize: 26 }}>My business</h1>
      <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
        {rows.map((l) => {
          const removed = l.moderation === 'removed';
          const n = asked.get(l.id) ?? 0;
          return (
            <Card key={l.id} style={{ display: 'grid', gap: 8, opacity: removed ? .6 : 1 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                <strong style={{ fontSize: 17 }}>{l.businessName}</strong>
                <span className="muted" style={{ fontSize: 12.5 }}>{l.categoryLabel}</span>
                {removed ? (
                  <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--muted)', border: '1px solid var(--line)', borderRadius: 999, padding: '2px 8px' }}>Closed</span>
                ) : (
                  /* OPEN OR CLOSED RIGHT NOW, worked out from the hours below
                     rather than from a switch somebody has to remember. A
                     listing taken out of the directory says CLOSED and means
                     something else entirely, so the two never show at once. */
                  <OpenBadge hours={l.hours} />
                )}
              </div>
              <div className="muted" style={{ fontSize: 12.5 }}>
                {l.areas.length ? l.areas.join(' · ') : l.city}
                {l.priceFrom != null && <> · from {rupees(l.priceFrom)}</>}
              </div>
              {l.about && <p style={{ fontSize: 13.5, margin: 0 }}>{l.about}</p>}
              <div className="muted" style={{ fontSize: 12.5 }}>
                {n === 0 ? 'Nobody has messaged this listing yet.' : `${n} ${n === 1 ? 'neighbour has' : 'neighbours have'} messaged you.`}
                {l.phone && (
                  <> · Your number: {l.phone} {l.phonePublic
                    ? <strong>(shown on your page — people can ring you)</strong>
                    : <>(private — nobody sees it)</>}</>
                )}
              </div>
              {/* FIRST OF THE SECTIONS, and only while the listing is live.
                  It is where the count of neighbours nobody has been given
                  yet is shown, which is the one thing on this card an owner
                  cannot find out anywhere else. */}
              {!removed && <VerificationTab listingId={l.id} />}
              {!removed && <HoursEditor listing={l} />}
              {!removed && <MenuEditor listingId={l.id} />}
              {!removed && <Offers listingId={l.id} />}
              <ReviewsReceived listingId={l.id} />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                {/* First, and accented. Everything else on this card acts on a
                    part of the listing; this is the listing itself, and it is
                    the thing an owner comes back here to do. */}
                {!removed && (
                  <Link to={`/services/${l.id}/edit`}><Button variant="accent" size="sm">Edit business page</Button></Link>
                )}
                <Link to="/services/messages"><Button variant="line" size="sm">Messages</Button></Link>
                {/* Only on a closed listing. Deleting is the step AFTER closing,
                    and a live shopfront should not be one press from gone. */}
                {removed && <DeleteForever id={l.id} name={l.businessName} conversations={n} />}
                {!removed && (
                  <Button variant="line" size="sm" disabled={close.isPending}
                    onClick={() => close.mutate(l.id)}>
                    {close.isPending ? 'Closing…' : 'Close listing'}
                  </Button>
                )}
              </div>
              {removed ? (
                <p className="muted" style={{ fontSize: 11.5, margin: 0 }}>
                  Closed and out of the directory. Deleting removes it and everything in it for good.
                </p>
              ) : (
                <p className="muted" style={{ fontSize: 11.5, margin: 0 }}>
                  Closing takes it out of the directory. Conversations already open stay open.
                </p>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
