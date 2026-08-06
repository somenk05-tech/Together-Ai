import { useState } from 'react';
import type { Conversation } from '@/types';

/**
 * The left panel, with a way to get a conversation off it.
 *
 * Two decisions worth writing down.
 *
 * FIRST, the wording. The server does not delete anything: DELETE /chat/:id
 * stamps clearedAt on YOUR membership row. The other people in the thread keep
 * it, the messages survive, and it comes back to your panel the moment somebody
 * writes to it again. So the control says "Remove", the confirm says both of
 * those things out loud, and nothing here says "delete" — a citizen who reads
 * "delete" and expects the other side to lose the thread has been misled by us,
 * not by the API.
 *
 * SECOND, the shape. The row used to be a single <button>; a delete control
 * inside it would be a button inside a button, which is invalid and which
 * browsers resolve by guessing. So the row is a container with two buttons in
 * it, and the confirm replaces the row in place rather than opening a modal or
 * a window.confirm() — a blocking dialog over a chat list is the wrong weight
 * for a decision this reversible, and it is the one that strands the app if it
 * is ever left open.
 */
export function ConversationList({ items, activeId, onSelect, onRemove, removingId }: {
  items: Conversation[];
  activeId?: string;
  onSelect: (id: string) => void;
  onRemove?: (id: string) => void;
  removingId?: string;
}) {
  const [confirmId, setConfirmId] = useState<string | null>(null);

  return (
    <div style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
      {items.map((c) => {
        const title = c.title ?? 'Conversation';
        if (confirmId === c.id) {
          return (
            <div key={c.id} className="conv-confirm">
              <p className="conv-confirm-text">
                Remove <strong>{title}</strong> from your list? It stays in theirs, and it
                comes back here if they write again.
              </p>
              <div className="conv-confirm-actions">
                <button type="button" className="conv-act is-danger"
                  disabled={removingId === c.id}
                  onClick={() => { onRemove?.(c.id); setConfirmId(null); }}>
                  {removingId === c.id ? 'Removing…' : 'Remove'}
                </button>
                <button type="button" className="conv-act" onClick={() => setConfirmId(null)}>
                  Keep it
                </button>
              </div>
            </div>
          );
        }
        return (
          <div key={c.id} className={`conv-row${c.id === activeId ? ' is-active' : ''}`}>
            <button type="button" className="conv-open" onClick={() => onSelect(c.id)}>
              <div className="tc-avatar" style={{ background: 'var(--accent-soft)', color: 'var(--accent-ink)' }}>
                {c.anonymous ? '🎭' : title.slice(0, 2).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {title}{c.anonymous && <span className="muted" style={{ fontWeight: 400, fontSize: 11 }}> · anonymous match</span>}
                </div>
                <div className="muted" style={{ fontSize: 11.5 }}>{new Date(c.lastMessageAt).toLocaleString()}</div>
              </div>
              {c.unread > 0 && <span className="tag" style={{ alignSelf: 'center' }}>{c.unread}</span>}
            </button>
            {onRemove && (
              <button type="button" className="conv-remove"
                aria-label={`Remove ${title} from your list`}
                title="Remove from your list"
                onClick={() => setConfirmId(c.id)}>
                <span aria-hidden>🗑</span>
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
