import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotificationSync } from '@/api';
import type { NotificationItem } from '@/api/schemas';
import { Icon, type IconName } from '@/components/ui/Icon';

interface Toast { id: string; icon: IconName; title: string; body?: string; href?: string }

const ICON_FOR: Record<string, IconName> = {
  like: 'heart', comment: 'comment', follow: 'follow', connection_request: 'connection',
  connection_accepted: 'accepted', post_live: 'sparkles', mention: 'mention',
  message: 'comment', dating_like: 'heart', dating_match: 'sparkles',
};

/**
 * App-wide live toaster: pops a transient card in the corner whenever a new
 * notification (like / comment / follow / connection request or accept) or a new
 * chat message arrives — anywhere in the app, no manual refresh. Tapping it
 * deep-links to the relevant page.
 */
export function NotificationToaster() {
  const nav = useNavigate();
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((t: Toast) => {
    setToasts((prev) => [...prev.slice(-2), t]); // keep at most 3 stacked
    window.setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== t.id)), 5000);
  }, []);

  // App-wide notifications — social, connections, dating AND new chat messages
  // (messages now flow through the in-app notification feed too, titled with the
  // sender's name, so there's a single toast source and no duplicates).
  useNotificationSync((n: NotificationItem) => {
    // Unique per toast — a grouped message notification reuses its row id when it
    // updates, so key it with a nonce to avoid React key collisions.
    push({ id: `${n.id}-${Math.random().toString(36).slice(2, 7)}`, icon: ICON_FOR[n.kind] ?? 'bell', title: n.title, body: n.body, href: n.href });
  });

  if (!toasts.length) return null;
  return (
    <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 340 }}>
      {toasts.map((t) => (
        <button key={t.id} type="button"
          onClick={() => { setToasts((prev) => prev.filter((x) => x.id !== t.id)); if (t.href) nav(t.href); }}
          style={{ display: 'flex', gap: 10, alignItems: 'flex-start', textAlign: 'left', width: '100%', cursor: 'pointer',
            background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, padding: '11px 13px',
            boxShadow: '0 10px 32px rgba(0,0,0,.18)', fontFamily: 'inherit', animation: 'tc-rise .28s ease-out' }}>
          <Icon name={t.icon} size={17} style={{ marginTop: 1, color: 'var(--accent-ink)' }} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 13, fontWeight: 700 }}>{t.title}</span>
            {t.body && <span className="muted" style={{ display: 'block', fontSize: 12, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.body}</span>}
          </span>
        </button>
      ))}
    </div>
  );
}
