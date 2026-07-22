import { useEffect, useRef, useState } from 'react';
import type { Message } from '@/types';
import { ShareCardView } from '../share';

/** WhatsApp-style delivery ticks (shown on your own messages only). */
function Ticks({ status }: { status?: Message['status'] }) {
  if (!status) return null;
  const read = status === 'READ';
  const double = status === 'DELIVERED' || status === 'READ';
  const color = read ? '#2f9fe0' : 'var(--muted, #8a8a8a)';
  return (
    <span aria-label={status.toLowerCase()} style={{ color, marginLeft: 4, letterSpacing: -2, fontSize: 12, fontWeight: 700 }}>
      {double ? '✓✓' : '✓'}
    </span>
  );
}

const CSS = `
.tc-msg-row{position:relative}
.tc-msg-actions{opacity:0;pointer-events:none;transition:opacity .15s ease;position:absolute;top:-14px;display:flex;gap:2px;background:var(--card,#fff);border:1px solid var(--line,#e5e2da);border-radius:999px;padding:2px 4px;box-shadow:0 4px 14px rgba(0,0,0,.1);z-index:5}
.tc-msg-row:hover .tc-msg-actions,.tc-msg-row.touch-open .tc-msg-actions{opacity:1;pointer-events:auto}
.tc-msg-actions button{border:none;background:none;cursor:pointer;font-size:12px;padding:4px 7px;border-radius:999px;font-family:inherit;color:var(--ink-soft,#555);line-height:1}
.tc-msg-actions button:hover{background:var(--paper,#f4f1ea)}
.tc-msg-actions button.danger{color:#b0503e}
.tc-msg-collapse{overflow:hidden;transition:max-height .25s ease,opacity .25s ease,margin .25s ease}
.tc-msg-collapsing{max-height:0!important;opacity:0;margin:0!important}
`;

/** 15-minute edit / delete-for-everyone window (matches the server policy). */
const WINDOW_MS = 15 * 60 * 1000;
const withinWindow = (m: Message) => Date.now() - new Date(m.createdAt).getTime() < WINDOW_MS;

function ConfirmDelete({ mine, canEveryone, onCancel, onDelete }: {
  mine: boolean; canEveryone: boolean;
  onCancel: () => void; onDelete: (scope: 'ME' | 'EVERYONE') => void;
}) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9500, background: 'rgba(20,18,12,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={onCancel}>
      <div className="card" style={{ width: 'min(400px, 100%)', padding: '22px 24px' }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 6px', fontSize: 17 }}>Delete this message?</h3>
        <p className="muted" style={{ fontSize: 13, margin: '0 0 16px', lineHeight: 1.5 }}>
          {canEveryone
            ? 'Delete just from your history, or for everyone in the conversation.'
            : mine
              ? 'The delete-for-everyone window (15 min) has passed — this will remove it from your history only.'
              : 'This will be permanently removed from your chat history. Others still see the original.'}
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-line btn-sm" onClick={onCancel}>Cancel</button>
          <button type="button" className="btn btn-line btn-sm" style={{ color: '#b0503e', borderColor: '#e2b3a8' }} onClick={() => onDelete('ME')}>Delete for me</button>
          {canEveryone && (
            <button type="button" className="btn btn-sm" style={{ background: '#b0503e', color: '#fff', border: 'none' }} onClick={() => onDelete('EVERYONE')}>Delete for everyone</button>
          )}
        </div>
      </div>
    </div>
  );
}

export function MessageThread({ messages, currentUserId, typing, onDelete, onEdit }: {
  messages: Message[]; currentUserId?: string; typing?: boolean;
  onDelete?: (messageId: string, scope: 'ME' | 'EVERYONE') => Promise<void> | void;
  onEdit?: (messageId: string, body: string) => Promise<void> | void;
}) {
  const end = useRef<HTMLDivElement>(null);
  const [confirmFor, setConfirmFor] = useState<Message | null>(null);
  const [collapsing, setCollapsing] = useState<Set<string>>(new Set());
  const [touchOpen, setTouchOpen] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const longPress = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length, typing]);

  const doDelete = async (m: Message, scope: 'ME' | 'EVERYONE') => {
    setConfirmFor(null);
    if (scope === 'ME') {
      // Collapse smoothly, then let the parent drop it from the list.
      setCollapsing((s) => new Set(s).add(m.id));
      window.setTimeout(() => { void onDelete?.(m.id, scope); }, 260);
    } else {
      await onDelete?.(m.id, scope); // tombstones in place — no collapse
    }
  };

  const startEdit = (m: Message) => { setEditingId(m.id); setEditText(m.body); setTouchOpen(null); };
  const saveEdit = async (m: Message) => {
    const next = editText.trim();
    setEditingId(null);
    if (next && next !== m.body) await onEdit?.(m.id, next);
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <style>{CSS}</style>
      {messages.map((m) => {
        const mine = m.senderId === currentUserId;
        const deleted = Boolean(m.deleted);
        const isCollapsing = collapsing.has(m.id);
        const canEdit = mine && !deleted && Boolean(m.body) && withinWindow(m) && Boolean(onEdit);
        return (
          <div key={m.id}
            className={`tc-msg-row tc-msg-collapse${isCollapsing ? ' tc-msg-collapsing' : ''}${touchOpen === m.id ? ' touch-open' : ''}`}
            style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: m.share ? 300 : '72%', maxHeight: 500 }}
            onTouchStart={() => { longPress.current = setTimeout(() => setTouchOpen((t) => (t === m.id ? null : m.id)), 450); }}
            onTouchEnd={() => { if (longPress.current) clearTimeout(longPress.current); }}
            onTouchMove={() => { if (longPress.current) clearTimeout(longPress.current); }}>

            {/* hover / long-press actions — never on deleted messages */}
            {!deleted && onDelete && (
              <div className="tc-msg-actions" style={mine ? { right: 0 } : { left: 0 }}>
                {m.body && <button type="button" title="Copy" onClick={() => { void navigator.clipboard?.writeText(m.body); setTouchOpen(null); }}>⧉ Copy</button>}
                {canEdit && <button type="button" title="Edit" onClick={() => startEdit(m)}>✎ Edit</button>}
                <button type="button" className="danger" title="Delete" onClick={() => { setConfirmFor(m); setTouchOpen(null); }}>🗑 Delete</button>
              </div>
            )}

            {deleted ? (
              <div style={{
                border: '1px dashed var(--line)', color: 'var(--muted)', fontStyle: 'italic',
                borderRadius: 16, padding: '8px 14px', fontSize: 13, background: 'transparent',
              }}>
                🚫 This message was deleted
              </div>
            ) : editingId === m.id ? (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input autoFocus value={editText} onChange={(e) => setEditText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') void saveEdit(m); if (e.key === 'Escape') setEditingId(null); }}
                  style={{ border: '1.5px solid var(--accent)', borderRadius: 12, padding: '8px 12px', fontSize: 14, fontFamily: 'inherit', minWidth: 220 }} />
                <button type="button" className="btn btn-accent btn-sm" onClick={() => void saveEdit(m)}>Save</button>
                <button type="button" className="btn btn-line btn-sm" onClick={() => setEditingId(null)}>✕</button>
              </div>
            ) : (
              <>
                {m.body && (
                  <div style={{
                    background: mine ? 'var(--accent)' : 'var(--card)', color: mine ? '#fff' : 'var(--ink)',
                    border: mine ? 'none' : '1px solid var(--line)', borderRadius: 16, padding: '9px 14px', fontSize: 14,
                    marginBottom: m.share ? 6 : 0,
                  }}>{m.body}</div>
                )}
                {m.share && <ShareCardView card={m.share} compact />}
              </>
            )}

            <div className="muted" style={{ fontSize: 10.5, marginTop: 2, textAlign: mine ? 'right' : 'left' }}>
              {m.edited && !deleted && <span style={{ marginRight: 4 }}>edited ·</span>}
              {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              {mine && !deleted && <Ticks status={m.status} />}
            </div>
          </div>
        );
      })}
      {typing && <div className="muted" style={{ fontSize: 12, fontStyle: 'italic' }}>typing…</div>}
      <div ref={end} />

      {confirmFor && (
        <ConfirmDelete
          mine={confirmFor.senderId === currentUserId}
          canEveryone={confirmFor.senderId === currentUserId && !confirmFor.deleted && withinWindow(confirmFor)}
          onCancel={() => setConfirmFor(null)}
          onDelete={(scope) => void doDelete(confirmFor, scope)}
        />
      )}
    </div>
  );
}
