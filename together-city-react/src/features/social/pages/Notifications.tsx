import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotificationPages, useMarkNotificationRead, useMarkAllNotificationsRead } from '@/api';
import { Spinner } from '@/components/ui';
import { Icon, type IconName } from '@/components/ui/Icon';

/** THE EMPTY LIST IS A CONSTANT, NOT A LITERAL.
 *  `x ?? []` builds a NEW array on every render, so any useMemo that depends
 *  on it recomputes every render and the memo is decoration. One frozen empty
 *  array, shared, makes the dependency stable and the memo real. Behaviour is
 *  identical — this is the same nothing, just the same nothing each time. */

const FILTERS = ['All', 'Unread'] as const;

/* Chrome, so it is the line set rather than emoji — Icon.tsx's rule, and the
 * one the rest of Social Life was brought onto with the redesign. */
const ICON_FOR: Record<string, IconName> = {
  like: 'heart', comment: 'comment', follow: 'follow', connection_request: 'connection',
  connection_accepted: 'accepted', post_live: 'sparkles', mention: 'mention',
  // The Till. Every one of these is money arriving or moving, so they share
  // the wallet mark rather than each inventing a glyph.
  invoice_sent: 'wallet', invoice_paid: 'wallet', invoice_paid_business: 'wallet',
  invoice_cancelled: 'wallet', invoice_refunded: 'wallet',
  payout_settled: 'wallet', payout_failed: 'wallet',
};
function timeAgo(iso: string): string {
  // An unparseable date rendered "NaN s ago" here, next to a real notification.
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const s = Math.max(1, Math.round((Date.now() - t) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60); if (m < 60) return `${m}m`;
  const h = Math.round(m / 60); if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

/** Social Life · Notifications — real likes, comments, follows & connection events. */
export function SocialNotifications() {
  const nav = useNavigate();
  const q = useNotificationPages();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const [filter, setFilter] = useState(0);

  const items = useMemo(() => (q.data?.pages ?? []).flat(), [q.data]);
  const shown = useMemo(() => (filter === 1 ? items.filter((n) => !n.read) : items), [items, filter]);
  const hasUnread = items.some((n) => !n.read);

  const [markErr, setMarkErr] = useState<string | null>(null);

  const open = (id: string, href?: string, read?: boolean) => {
    /* THIS ONE IS DELIBERATELY SILENT, and the line is here so the next person
       does not "fix" it. The citizen is navigating away in the same gesture;
       an error banner on a page they are leaving is a banner nobody reads, and
       the only consequence of a lost mark-as-read is that the row is still
       bold when they come back — which is self-correcting the moment they open
       it again. "Mark all read" below is the opposite case: it is the whole
       point of the press, and there is nowhere else to look. */
    // deliberately silent: the citizen is navigating away in the same gesture,
    // and an unmarked row simply stays bold until they open it again.
    if (!read) markRead.mutate(id);
    if (href) nav(href);
  };

  return (
    <div className="page">
      <div className="sl-head rise" style={{ flexWrap: 'wrap' }}>
        <div className="sl-head-t">
          <div className="eyebrow">Social Life · Notifications</div>
          <h1>Likes, comments &amp; follows</h1>
          <p>Everything the city did with what you shared.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flex: '0 0 auto' }}>
          {FILTERS.map((f, i) => (
            <button key={f} type="button" className={`pill ${i === filter ? 'on' : ''}`} style={{ cursor: 'pointer' }} onClick={() => setFilter(i)}>{f}</button>
          ))}
          {hasUnread && (
            <button type="button" className="btn btn-line btn-sm" disabled={markAll.isPending}
              onClick={() => {
                setMarkErr(null);
                markAll.mutate(undefined, { onError: () => setMarkErr('Those didn’t clear — they are all still unread. Try again.') });
              }}>
              {markAll.isPending ? 'Clearing…' : 'Mark all read'}
            </button>
          )}
        </div>
      </div>

      {markErr && <p role="alert" className="sl-fail-alert">{markErr}</p>}

      {q.isLoading && <Spinner label="Loading notifications…" />}

      {!q.isLoading && q.isError && (
        <div className="card rise d1" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <span className="sl-ic lg" style={{ margin: '0 auto 14px' }}><Icon name="warn" size={30} /></span>
          <h2 style={{ fontSize: 20, margin: '0 0 6px' }}>Couldn't load notifications</h2>
          <p className="muted" style={{ fontSize: 14, margin: '0 0 14px' }}>Check your connection and try again.</p>
          <button type="button" className="btn btn-line btn-sm" onClick={() => void q.refetch()}>Retry</button>
        </div>
      )}

      {!q.isLoading && !q.isError && shown.length === 0 && (
        <div className="card rise d1" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <span className="sl-ic lg" style={{ margin: '0 auto 14px' }}><Icon name="bell" size={30} /></span>
          <h2 style={{ fontSize: 20, margin: '0 0 6px' }}>{filter === 1 ? 'No unread notifications' : "You're all caught up"}</h2>
          <p className="muted" style={{ fontSize: 14, margin: 0 }}>Likes, comments, follows and connection updates show up here.</p>
        </div>
      )}

      <div className="rise d1" style={{ display: 'grid', gap: 8 }}>
        {shown.map((n) => (
          <button key={n.id} type="button" onClick={() => open(n.id, n.href, n.read)}
            style={{ display: 'flex', gap: 12, alignItems: 'flex-start', textAlign: 'left', width: '100%', cursor: 'pointer',
              border: '1px solid var(--line)', borderRadius: 'var(--r-2)', padding: '13px 15px', fontFamily: 'inherit',
              background: n.read ? 'var(--card)' : 'var(--wash)' }}>
            <span className="sl-ic sm" aria-hidden><Icon name={ICON_FOR[n.kind] ?? 'bell'} size={16} /></span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 14, fontWeight: n.read ? 500 : 700 }}>{n.title}</span>
              {n.body && <span className="muted" style={{ display: 'block', fontSize: 12.5, marginTop: 2 }}>{n.body}</span>}
              {timeAgo(n.createdAt) && <span className="muted" style={{ fontSize: 11.5 }}>{timeAgo(n.createdAt)} ago</span>}
            </span>
            {!n.read && <span style={{ flex: 'none', width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', marginTop: 6 }} />}
          </button>
        ))}
      </div>

      {/* Fifty at a time. Before this there was no fifty-first: the bell read
          one page and the route had no way to ask for another. */}
      {q.hasNextPage && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14 }}>
          <button type="button" className="btn btn-line btn-sm" disabled={q.isFetchingNextPage}
            onClick={() => void q.fetchNextPage()}>
            {q.isFetchingNextPage ? 'Loading…' : 'Show more'}
          </button>
        </div>
      )}
    </div>
  );
}
