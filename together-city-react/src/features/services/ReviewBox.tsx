import { useState } from 'react';
import { Button } from '@/components/ui';
import { useReviews, usePostReview, useRemoveReview, stars } from './api';

/**
 * REVIEWING A BUSINESS YOU HAVE ACTUALLY SPOKEN TO.
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
export function ReviewBox({ listingId }: { listingId: string }) {
  const q = useReviews(listingId);
  const post = usePostReview(listingId);
  const drop = useRemoveReview(listingId);
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState('');
  const [open, setOpen] = useState(false);

  const mine = q.data?.mine ?? null;
  const chosen = rating || mine?.rating || 0;

  if (q.isLoading || q.isError || !q.data) return null;
  // The gate, and it is the server's answer rather than this screen's guess:
  // only somebody with a thread on this listing may review it, and the form
  // does not appear for anybody else.
  if (!q.data.canReview) return null;
  const alias = q.data.alias ?? 'a neighbour';

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
