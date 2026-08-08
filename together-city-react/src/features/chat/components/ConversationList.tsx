import { useState } from 'react';
import type { Conversation } from '@/types';

/**
 * The left panel of the stage, with a way to get a conversation off it.
 *
 * Three decisions worth writing down.
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
 *
 * THIRD, the material. The selected row wears the SAME white-pressed-in tile
 * as an incoming message. "The one you are reading" and "the one talking to
 * you" being made of the same thing is what turns two shadows into a language
 * rather than two effects.
 */
/** Two initials from the WORDS, not the first two letters — "Meera Kulkarni"
 *  is MK, not ME, and "Team · Product" is TP. */
function initials(title: string): string {
  const words = title.split(/[\s·]+/).filter((w) => /[a-z0-9]/i.test(w));
  if (words.length === 0) return '··';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/**
 * A short time, the way a chat list writes one.
 *
 * `toLocaleString()` printed "8/8/2026, 1:14:31 PM" on every row — a
 * twenty-character string, in a column forty pixels wide, saying the seconds.
 * Today gets a clock, this week gets a weekday, older gets a date.
 */
function shortTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const days = Math.round((now.setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86400000);
  if (days === 1) return 'Yesterday';
  if (days < 7) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

export function ConversationList({ items, activeId, onSelect, onRemove, removingId }: {
  items: Conversation[];
  activeId?: string;
  onSelect: (id: string) => void;
  onRemove?: (id: string) => void;
  removingId?: string;
}) {
  const [confirmId, setConfirmId] = useState<string | null>(null);

  return (
    <div className="csrows">
      {items.map((c) => {
        const title = c.title ?? 'Conversation';
        if (confirmId === c.id) {
          return (
            <div key={c.id} className="csrow csconfirm">
              <div style={{ padding: '12px 14px' }}>
                <p style={{ margin: '0 0 10px', fontSize: 12.5, lineHeight: 1.5 }}>
                  Remove <strong>{title}</strong> from your list? It stays in theirs, and it
                  comes back here if they write again.
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" className="cstab on" disabled={removingId === c.id}
                    onClick={() => { onRemove?.(c.id); setConfirmId(null); }}>
                    {removingId === c.id ? 'Removing…' : 'Remove'}
                  </button>
                  <button type="button" className="cstab" onClick={() => setConfirmId(null)}>Keep it</button>
                </div>
              </div>
            </div>
          );
        }
        return (
          <div key={c.id} className={c.id === activeId ? 'csrow on' : 'csrow'}>
            <button type="button" className="csopen" onClick={() => onSelect(c.id)}>
              <span className="csav">{c.anonymous ? '🎭' : initials(title)}</span>
              <span className="cswho">
                <b>{title}</b>
                <span>{c.anonymous ? 'anonymous match' : c.isGroup ? 'group' : 'direct'}</span>
              </span>
              <span className="csmeta">
                <i>{shortTime(c.lastMessageAt)}</i>
                {c.unread > 0 && <span className="cspip">{c.unread}</span>}
              </span>
            </button>
            {onRemove && (
              <button type="button" className="csdrop"
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
