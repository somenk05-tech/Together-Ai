import type { Conversation } from '@/types';

export function ConversationList({ items, activeId, onSelect }: {
  items: Conversation[]; activeId?: string; onSelect: (id: string) => void;
}) {
  return (
    <div style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
      {items.map((c) => (
        <button key={c.id} type="button" onClick={() => onSelect(c.id)}
          style={{
            display: 'flex', width: '100%', textAlign: 'left', gap: 12, padding: '14px 16px',
            border: 'none', borderBottom: '1px solid var(--line)', cursor: 'pointer',
            background: c.id === activeId ? 'var(--accent-soft)' : 'transparent',
          }}>
          <div className="tc-avatar" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
            {c.anonymous ? '🎭' : (c.title ?? 'C').slice(0, 2).toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 13.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {c.title ?? 'Conversation'}{c.anonymous && <span className="muted" style={{ fontWeight: 400, fontSize: 11 }}> · anonymous match</span>}
            </div>
            <div className="muted" style={{ fontSize: 11.5 }}>{new Date(c.lastMessageAt).toLocaleString()}</div>
          </div>
          {c.unread > 0 && <span className="tag" style={{ alignSelf: 'center' }}>{c.unread}</span>}
        </button>
      ))}
    </div>
  );
}
