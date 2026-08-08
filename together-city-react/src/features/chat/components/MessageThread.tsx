import { useEffect, useRef, useState } from 'react';
import type { Message } from '@/types';
import { ShareCardView } from '../share';

/** WhatsApp-style delivery ticks (shown on your own messages only). */
function Ticks({ status }: { status?: Message['status'] }) {
  if (!status) return null;
  const read = status === 'READ';
  const double = status === 'DELIVERED' || status === 'READ';
  /* On the stage there is no info-blue to read against black. Read is the
     bright ink, delivered is the soft one. */
  const color = read ? 'var(--on-stage)' : 'var(--on-stage-faint)';
  return (
    <span aria-label={status.toLowerCase()} style={{ color, marginLeft: 4, letterSpacing: -2, fontSize: 12, fontWeight: 700 }}>
      {double ? '✓✓' : '✓'}
    </span>
  );
}

const CSS = `
.tc-msg-row{position:relative}
.tc-msg-actions{opacity:0;pointer-events:none;transition:opacity var(--dur-fast) var(--ease);position:absolute;top:-16px;display:flex;gap:2px;background:var(--stage-solid);border:1px solid var(--stage-line);border-radius:999px;padding:3px 5px;box-shadow:var(--soft-out);z-index:5}
.tc-msg-row:hover .tc-msg-actions,.tc-msg-row.touch-open .tc-msg-actions{opacity:1;pointer-events:auto}
.tc-msg-actions button{border:none;background:none;cursor:pointer;font-size:12px;padding:4px 7px;border-radius:999px;font-family:inherit;color:var(--on-stage-soft);line-height:1}
.tc-msg-actions button:hover{background:var(--stage-tile)}
.tc-msg-actions button.danger{color:var(--on-stage)}
/* Was max-height: 2000px -> 0 over 250ms. A message is ~60px, so 97% of the
   duration passed with nothing visible and the collapse happened in the last
   7ms. grid-template-rows: 1fr -> 0fr collapses to the row's *actual* height
   with no magic number and no measurement. The opacity leg is --dur-fast so the
   message is gone before the gap finishes closing at --dur-base. */
.tc-msg-collapse{display:grid;grid-template-rows:1fr;transition:grid-template-rows var(--dur-base) var(--ease-out),opacity var(--dur-fast) var(--ease-out)}
.tc-msg-collapse > *{overflow:hidden;min-height:0}
.tc-msg-collapsing{grid-template-rows:0fr;opacity:0}
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
          <button type="button" className="btn btn-line btn-sm" style={{ color: 'var(--danger-ink)', borderColor: 'var(--danger-line)' }} onClick={() => onDelete('ME')}>Delete for me</button>
          {canEveryone && (
            <button type="button" className="btn btn-sm" style={{ background: 'var(--danger-ink)', color: 'var(--on-accent)', border: 'none' }} onClick={() => onDelete('EVERYONE')}>Delete for everyone</button>
          )}
        </div>
      </div>
    </div>
  );
}

export function MessageThread({ messages, currentUserId, typing, peerName, onDelete, onEdit }: {
  messages: Message[]; currentUserId?: string; typing?: boolean;
  /** Whose thread this is, for the attribution line above each run. */
  peerName?: string;
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
      window.setTimeout(() => { void onDelete?.(m.id, scope); }, 220); // --dur-base
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

  const at = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="csmsgs">
      <style>{CSS}</style>
      {messages.map((m, i) => {
        const mine = m.senderId === currentUserId;
        const deleted = Boolean(m.deleted);
        const isCollapsing = collapsing.has(m.id);
        const canEdit = mine && !deleted && Boolean(m.body) && withinWindow(m) && Boolean(onEdit);
        /* THE ATTRIBUTION LINE PRINTS ONCE PER RUN. Four messages from one
           person do not need the name and the clock four times — that is the
           thing that makes a long thread look like a form. */
        const prev = messages[i - 1];
        const opens = !prev || prev.senderId !== m.senderId;
        return (
          <div key={m.id} style={{ display: 'contents' }}>
            {opens && (
              <div className={mine ? 'csatt me' : 'csatt'}>
                {mine
                  ? <><i>{at(m.createdAt)}</i><b>You</b></>
                  : <><b>{peerName ?? 'Them'}</b><i>{at(m.createdAt)}</i></>}
              </div>
            )}
            <div
              className={`tc-msg-row tc-msg-collapse${isCollapsing ? ' tc-msg-collapsing' : ''}${touchOpen === m.id ? ' touch-open' : ''}`}
              style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: m.share ? 320 : '100%' }}
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

              {/* single in-flow child: the grid row that collapses 1fr -> 0fr */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start' }}>
                {deleted ? (
                  <div className="csb gone">🚫 This message was deleted</div>
                ) : editingId === m.id ? (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input autoFocus aria-label="Edit your message" value={editText} onChange={(e) => setEditText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') void saveEdit(m); if (e.key === 'Escape') setEditingId(null); }}
                      className="csb" style={{ minWidth: 240, boxShadow: 'var(--soft-in)' }} />
                    <button type="button" className="cstab on" onClick={() => void saveEdit(m)}>Save</button>
                    <button type="button" className="cstab" aria-label="Cancel editing" onClick={() => setEditingId(null)}>✕</button>
                  </div>
                ) : (
                  <>
                    {m.body && <div className={mine ? 'csb me' : 'csb'}>{m.body}</div>}
                    {m.share && <div style={{ marginTop: m.body ? 6 : 0 }}><ShareCardView card={m.share} compact clickable /></div>}
                  </>
                )}

                {/* Only the facts the attribution line does not already carry:
                    an edit, and how far a message of yours has got. */}
                {(m.edited || (mine && !deleted && m.status)) && !deleted && (
                  <div style={{ fontSize: 10.5, marginTop: 3, color: 'var(--on-stage-faint)' }}>
                    {m.edited && <span style={{ marginRight: 4 }}>edited</span>}
                    {mine && <Ticks status={m.status} />}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
      {typing && <div className="csatt"><i>{peerName ?? 'They'} is typing…</i></div>}
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
