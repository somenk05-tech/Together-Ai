import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotificationSync } from '@/api';
import { socketClient } from '@/api/socket';
import { WS } from '@/api/events';
import type { NotificationItem } from '@/api/schemas';

interface Toast { id: string; icon: string; title: string; body?: string; href?: string }

const ICON_FOR: Record<string, string> = {
  like: '❤️', comment: '💬', follow: '➕', connection_request: '🤝',
  connection_accepted: '✅', post_live: '🎉', mention: '📣',
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

  // In-app notifications (social + connections).
  useNotificationSync((n: NotificationItem) => {
    push({ id: n.id, icon: ICON_FOR[n.kind] ?? '🔔', title: n.title, body: n.body, href: n.href });
  });

  // Chat messages — reuse the existing chat notification event.
  useEffect(() => {
    const off = socketClient.on<{ conversationId?: string; title?: string; body?: string; preview?: string }>(WS.CHAT_NOTIFICATION, (m) => {
      push({
        id: `chat-${m.conversationId ?? Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        icon: '💬', title: m.title || 'New message', body: m.body || m.preview,
        href: m.conversationId ? `/chats?c=${m.conversationId}` : '/chats',
      });
    });
    return off;
  }, [push]);

  if (!toasts.length) return null;
  return (
    <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 340 }}>
      {toasts.map((t) => (
        <button key={t.id} type="button"
          onClick={() => { setToasts((prev) => prev.filter((x) => x.id !== t.id)); if (t.href) nav(t.href); }}
          style={{ display: 'flex', gap: 10, alignItems: 'flex-start', textAlign: 'left', width: '100%', cursor: 'pointer',
            background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, padding: '11px 13px',
            boxShadow: '0 10px 32px rgba(0,0,0,.18)', fontFamily: 'inherit', animation: 'tc-rise .28s ease-out' }}>
          <span aria-hidden style={{ fontSize: 17, lineHeight: 1.2 }}>{t.icon}</span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 13, fontWeight: 700 }}>{t.title}</span>
            {t.body && <span className="muted" style={{ display: 'block', fontSize: 12, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.body}</span>}
          </span>
        </button>
      ))}
    </div>
  );
}
