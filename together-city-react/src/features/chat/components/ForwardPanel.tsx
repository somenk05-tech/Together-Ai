import { useMemo, useState } from 'react';
import { chatApi, type Conversation, type Message } from '@/api';

/**
 * WHERE DOES THIS GO.
 *
 * ONE DESTINATION, ANY NUMBER OF MESSAGES — and the asymmetry is the point,
 * not a half-finished multi-select. Picking several ROOMS is what makes
 * forwarding unsafe: being sure which thread you just put somebody's words into
 * is the whole of it, and a list of checked destinations is exactly what makes
 * that fuzzy. Picking several MESSAGES costs none of that. The room is still
 * one room, still named once on its own line; only how much goes there changed.
 *
 * The conversation it came FROM is excluded. Forwarding a message into the
 * thread it is already in is never what somebody means, and offering it is how
 * a mis-tap becomes a duplicate.
 *
 * ── AND YOU SEARCH FOR IT RATHER THAN SCROLL TO IT ─────────────────────────
 *
 * A list of every room somebody is in is a list nobody reads to the bottom.
 * The field at the top filters by what a person would actually type — the
 * room's name, and for a direct chat the other person's — so forwarding is
 * "Forward → type three letters → tap", which is the path WhatsApp taught
 * everybody and the one the owner asked for by name.
 *
 * IT FILTERS WHAT IS ALREADY LOADED. No request per keystroke: the roster is
 * one cached call the screen has already made, and a search that goes to the
 * server to filter a list the browser is holding is latency bought for nothing.
 *
 * THE SENDS ARE SEQUENTIAL. Awaiting them one at a time keeps the arrival order
 * the same as the reading order — Promise.all would land them in whatever order
 * the server finished, which is how a forwarded exchange stops making sense —
 * and it lets a failure say how many got through and name the one it stopped
 * at, which is the only version of that message a citizen can act on.
 */
/** The fallback under a missing face — the same two letters ConversationList
 *  draws on the rows outside, so a room with no picture reads the same here. */
const initials = (name: string): string =>
  name.split(/[\s·]+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

export function ForwardPanel({ messages, fromConversationId, conversations, faces, onClose, onSent }: {
  /** In thread order. They arrive in the destination in the same order. */
  messages: Message[];
  fromConversationId?: string;
  conversations: Conversation[];
  /** The same faces the conversation list outside is drawing, handed down
   *  rather than fetched again — a room somebody recognises by its picture is
   *  a room they should not have to read the name of twice. */
  faces?: Map<string, { photo: string | null; mine: boolean }>;
  onClose: () => void;
  onSent: (toConversationId: string, count: number) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const targets = conversations.filter((c) => c.id !== fromConversationId);
  const [sent, setSent] = useState(0);

  /* Case-insensitive, on the name the row actually shows. A direct chat's
     title IS the other person's name in this API, so one comparison covers
     "search by contact", "by chat" and "by group" — three phrasings of the
     same field rather than three code paths. */
  const found = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return targets;
    return targets.filter((c) => (c.title || 'Conversation').toLowerCase().includes(q));
    // `targets` is derived per render from props; keying on the two things it
    // is derived from is what keeps this from recomputing on every keystroke
    // for reasons unrelated to the query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, conversations, fromConversationId]);

  /** One message on one line: the subtitle when there is a single one, and what
   *  a failure names when there are several. */
  const describe = (m: Message) => m.body
    || (m.share?.title ? `Card · ${m.share.title}` : '')
    || ((m.media ?? []).length ? `${m.media!.length} attachment${m.media!.length > 1 ? 's' : ''}` : 'Message');
  const preview = messages.length === 1 ? describe(messages[0]) : `${messages.length} messages`;

  const send = async (to: Conversation) => {
    setBusy(to.id); setErr(null); setSent(0);
    for (let i = 0; i < messages.length; i++) {
      try {
        await chatApi.forwardMessage(to.id, messages[i]);
        setSent(i + 1);
      } catch (e) {
        /* Name what stopped it and how far it got. "That could not be
           forwarded" is a fine answer for one message and a useless one for
           nine, because the citizen still has to decide whether to send the
           rest again — and the copies already delivered are not coming back. */
        const why = (e as { message?: string }).message || 'That could not be forwarded.';
        setErr(messages.length === 1
          ? why
          : `Sent ${i} of ${messages.length}. “${describe(messages[i])}” did not go — ${why}`);
        setBusy(null);
        return;
      }
    }
    onSent(to.id, messages.length);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9500, background: 'rgba(20,18,12,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={onClose}>
      <div className="card" style={{ width: 'min(420px, 100%)', maxHeight: '80vh', overflowY: 'auto', padding: '20px 22px' }}
        onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 4px', fontSize: 17 }}>Forward to</h3>
        <p className="muted" style={{ fontSize: 12.5, margin: '0 0 14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {preview}
        </p>

        {err && <p role="alert" style={{ fontSize: 13, margin: '0 0 12px', color: 'var(--danger-ink)' }}>{err}</p>}

        {/* SEARCH FIRST, AND IT STAYS PUT. The field is outside the scroller
            below, so it does not slide away under a thumb and does not go
            under the keyboard it raises — the list is what scrolls. */}
        {targets.length > 1 && (
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats"
            aria-label="Search chats"
            autoComplete="off"
            style={{
              font: 'inherit', fontSize: 14, width: '100%', boxSizing: 'border-box',
              padding: '10px 13px', marginBottom: 10,
              borderRadius: 'var(--r-2)', border: '1px solid var(--line)',
              background: 'var(--wash)', color: 'var(--ink)',
            }}
          />
        )}

        <div style={{ display: 'grid', gap: 6, marginBottom: 14, maxHeight: '46vh', overflowY: 'auto' }}>
          {targets.length === 0
            ? <p className="muted" style={{ fontSize: 13, margin: 0 }}>There is nowhere else to send this yet.</p>
            : found.length === 0
              /* Named, so it is obvious the list is filtered rather than empty
                 — "no chats" and "no chats matching that" are different facts
                 and only one of them is fixed by clearing the field. */
              ? <p className="muted" style={{ fontSize: 13, margin: 0 }}>No chats found for “{query.trim()}”.</p>
              : found.map((c) => {
                  const face = faces?.get(c.id);
                  const photo = c.anonymous && !face?.mine ? null : face?.photo ?? null;
                  const name = c.title || 'Conversation';
                  return (
                    <button key={c.id} type="button" className="btn btn-line btn-sm" disabled={Boolean(busy)}
                      style={{ justifyContent: 'flex-start', gap: 10, minHeight: 48, textAlign: 'left' }}
                      onClick={() => void send(c)}>
                      {/* aria-hidden: the name is on the same line, and a
                          reader that announced both would say the room twice. */}
                      <span className="csav" aria-hidden style={{ width: 30, height: 30, fontSize: 11, flex: 'none' }}>
                        {photo ? <img className="no-case" src={photo} alt="" loading="lazy" /> : initials(name)}
                      </span>
                      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {busy === c.id
                          ? (messages.length > 1 ? `Sending ${sent + 1} of ${messages.length}…` : 'Sending…')
                          : name}
                        {c.isGroup && <span className="muted" style={{ marginLeft: 6, fontSize: 11 }}>group</span>}
                      </span>
                    </button>
                  );
                })}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-line btn-sm" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
