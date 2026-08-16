import { useRef, useState } from 'react';
import type { Conversation } from '@/types';
import { resizeAvatar } from '@/lib/resizeAvatar';

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
 *
 * FOURTH, THE FACE. The row drew initials because the list payload never
 * carried a picture — the photos were being loaded for these very rows on the
 * server and thrown away. They arrive now on their own cached call, and the
 * initials stay as the fallback rather than the default: a group has no face,
 * an anonymous match is not allowed one yet, and somebody who has never set an
 * account photo still needs a row.
 *
 * AND THE PICTURE IS THE READER'S TO CHANGE. A contact photo, in the sense a
 * phone address book means it — private to the person who set it, and it never
 * touches the other citizen's account. That is worth saying on the screen and
 * not only here, because a control that looks like it might be editing
 * somebody else's profile is one nobody presses. The picker sits beside the
 * remove control as a THIRD SIBLING, never inside `csopen`: a button inside a
 * button is invalid and browsers resolve it by guessing.
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

export function ConversationList({ items, activeId, onSelect, onRemove, removingId, faces, onSetPhoto, savingPhotoId }: {
  items: Conversation[];
  activeId?: string;
  onSelect: (id: string) => void;
  onRemove?: (id: string) => void;
  removingId?: string;
  /** conversation id → the picture to draw, and whether the reader chose it. */
  faces?: Map<string, { photo: string | null; mine: boolean }>;
  onSetPhoto?: (conversationId: string, photo: string | null) => void;
  savingPhotoId?: string;
}) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [pickId, setPickId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const chooseFile = async (conversationId: string, file?: File) => {
    if (!file) return;
    setBusy(true);
    setFailed(null);
    try {
      onSetPhoto?.(conversationId, await resizeAvatar(file));
      setPickId(null);
    } catch {
      // Said in the citizen's terms. The two ways this lands here are a file
      // the browser cannot decode and a canvas it will not give us.
      setFailed('That picture could not be read. Try another one.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="csrows">
      {items.map((c) => {
        const title = c.title ?? 'Conversation';
        const face = faces?.get(c.id);
        // An anonymous match is a mask by design, and its own picture is the
        // one thing this row must not draw — the server does not send it, and
        // this says so a second time where somebody reading the page can see it.
        const photo = c.anonymous && !face?.mine ? null : face?.photo ?? null;
        if (pickId === c.id) {
          return (
            <div key={c.id} className="csrow csconfirm">
              <div style={{ padding: '12px 14px' }}>
                <p style={{ margin: '0 0 10px', fontSize: 12.5, lineHeight: 1.5 }}>
                  A picture for <strong>{title}</strong> on your list. Only you see it, and it
                  changes nothing about their own profile.
                </p>
                {failed && (
                  <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--danger-ink)' }}>{failed}</p>
                )}
                <input ref={fileRef} type="file" accept="image/*" hidden
                  onChange={(e) => { void chooseFile(c.id, e.target.files?.[0]); e.target.value = ''; }} />
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" className="cstab on" disabled={busy || savingPhotoId === c.id}
                    onClick={() => fileRef.current?.click()}>
                    {busy || savingPhotoId === c.id ? 'Just a moment…' : 'Choose a picture'}
                  </button>
                  {face?.mine && (
                    <button type="button" className="cstab" disabled={busy || savingPhotoId === c.id}
                      onClick={() => { onSetPhoto?.(c.id, null); setPickId(null); }}>
                      Use their own photo
                    </button>
                  )}
                  <button type="button" className="cstab" onClick={() => { setPickId(null); setFailed(null); }}>Cancel</button>
                </div>
              </div>
            </div>
          );
        }
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
              <span className="csav">
                {photo
                  ? <img className="no-case" src={photo} alt="" loading="lazy" />
                  : c.anonymous ? '🎭' : initials(title)}
              </span>
              <span className="cswho">
                <b>{title}</b>
                <span>{c.anonymous ? 'anonymous match' : c.isGroup ? 'group' : 'direct'}</span>
              </span>
              <span className="csmeta">
                <i>{shortTime(c.lastMessageAt)}</i>
                {c.unread > 0 && <span className="cspip">{c.unread}</span>}
              </span>
            </button>
            {onSetPhoto && (
              <button type="button" className="csdrop cspic"
                aria-label={`Change the picture on ${title}`}
                title="Change the picture — only you see it"
                onClick={() => { setFailed(null); setPickId(c.id); }}>
                <span aria-hidden>🖼</span>
              </button>
            )}
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
