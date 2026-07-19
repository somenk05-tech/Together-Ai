import { useEffect, useRef } from 'react';
import type { Message } from '@/types';
import { ShareCardView } from '../share';

/** WhatsApp-style delivery ticks (shown on your own messages only). */
function Ticks({ status }: { status?: Message['status'] }) {
  if (!status) return null;
  const read = status === 'READ';
  const double = status === 'DELIVERED' || status === 'READ';
  // On the accent bubble: read = bright blue, otherwise translucent white.
  const color = read ? '#5fd0ff' : 'rgba(255,255,255,.7)';
  return (
    <span aria-label={status.toLowerCase()} style={{ color, marginLeft: 4, letterSpacing: -2, fontSize: 12 }}>
      {double ? '✓✓' : '✓'}
    </span>
  );
}

export function MessageThread({ messages, currentUserId, typing }: {
  messages: Message[]; currentUserId?: string; typing?: boolean;
}) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, typing]);
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {messages.map((m) => {
        const mine = m.senderId === currentUserId;
        return (
          <div key={m.id} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: m.share ? 300 : '72%' }}>
            {m.body && (
              <div style={{
                background: mine ? 'var(--accent)' : 'var(--card)', color: mine ? '#fff' : 'var(--ink)',
                border: mine ? 'none' : '1px solid var(--line)', borderRadius: 16, padding: '9px 14px', fontSize: 14,
                marginBottom: m.share ? 6 : 0,
              }}>{m.body}</div>
            )}
            {m.share && <ShareCardView card={m.share} compact />}
            <div className="muted" style={{ fontSize: 10.5, marginTop: 2, textAlign: mine ? 'right' : 'left' }}>
              {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              {mine && <Ticks status={m.status} />}
            </div>
          </div>
        );
      })}
      {typing && <div className="muted" style={{ fontSize: 12, fontStyle: 'italic' }}>typing…</div>}
      <div ref={end} />
    </div>
  );
}
