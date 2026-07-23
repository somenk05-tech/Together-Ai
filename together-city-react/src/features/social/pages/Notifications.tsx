import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotifications, useMarkNotificationRead, useMarkAllNotificationsRead } from '@/api';
import { Spinner } from '@/components/ui';

const FILTERS = ['All', 'Unread'] as const;

const ICON_FOR: Record<string, string> = {
  like: '❤️', comment: '💬', follow: '➕', connection_request: '🤝',
  connection_accepted: '✅', post_live: '🎉', mention: '📣',
};
function timeAgo(iso: string): string {
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60); if (m < 60) return `${m}m`;
  const h = Math.round(m / 60); if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

/** Social Life · Notifications — real likes, comments, follows & connection events. */
export function SocialNotifications() {
  const nav = useNavigate();
  const q = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const [filter, setFilter] = useState(0);

  const items = q.data ?? [];
  const shown = useMemo(() => (filter === 1 ? items.filter((n) => !n.read) : items), [items, filter]);
  const hasUnread = items.some((n) => !n.read);

  const open = (id: string, href?: string, read?: boolean) => {
    if (!read) markRead.mutate(id);
    if (href) nav(href);
  };

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '28px 16px' }}>
      <div className="rise" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 16, marginBottom: 22 }}>
        <div>
          <div className="eyebrow">Social Life · Notifications</div>
          <h1 style={{ fontSize: 'clamp(24px,3vw,34px)' }}>Likes, comments &amp; follows</h1>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {FILTERS.map((f, i) => (
            <button key={f} type="button" className={`pill ${i === filter ? 'on' : ''}`} style={{ cursor: 'pointer' }} onClick={() => setFilter(i)}>{f}</button>
          ))}
          {hasUnread && <button type="button" className="btn btn-line btn-sm" onClick={() => markAll.mutate()}>Mark all read</button>}
        </div>
      </div>

      {q.isLoading && <Spinner label="Loading notifications…" />}

      {!q.isLoading && shown.length === 0 && (
        <div className="blk rise d1" style={{ textAlign: 'center', padding: '64px 24px' }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>🔔</div>
          <h2 style={{ fontSize: 20, margin: '0 0 6px' }}>{filter === 1 ? 'No unread notifications' : "You're all caught up"}</h2>
          <p className="muted" style={{ fontSize: 14, margin: 0 }}>Likes, comments, follows and connection updates show up here.</p>
        </div>
      )}

      <div className="rise d1" style={{ display: 'grid', gap: 8 }}>
        {shown.map((n) => (
          <button key={n.id} type="button" onClick={() => open(n.id, n.href, n.read)}
            style={{ display: 'flex', gap: 12, alignItems: 'flex-start', textAlign: 'left', width: '100%', cursor: 'pointer',
              border: '1px solid var(--line)', borderRadius: 12, padding: '12px 14px', fontFamily: 'inherit',
              background: n.read ? 'var(--card)' : 'var(--accent-soft)' }}>
            <span aria-hidden style={{ fontSize: 18, lineHeight: 1.3 }}>{ICON_FOR[n.kind] ?? '🔔'}</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 14, fontWeight: n.read ? 500 : 700 }}>{n.title}</span>
              {n.body && <span className="muted" style={{ display: 'block', fontSize: 12.5, marginTop: 2 }}>{n.body}</span>}
              <span className="muted" style={{ fontSize: 11.5 }}>{timeAgo(n.createdAt)} ago</span>
            </span>
            {!n.read && <span style={{ flex: 'none', width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', marginTop: 6 }} />}
          </button>
        ))}
      </div>
    </div>
  );
}
