import { useState } from 'react';
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
 * THE SENDS ARE SEQUENTIAL. Awaiting them one at a time keeps the arrival order
 * the same as the reading order — Promise.all would land them in whatever order
 * the server finished, which is how a forwarded exchange stops making sense —
 * and it lets a failure say how many got through and name the one it stopped
 * at, which is the only version of that message a citizen can act on.
 */
export function ForwardPanel({ messages, fromConversationId, conversations, onClose, onSent }: {
  /** In thread order. They arrive in the destination in the same order. */
  messages: Message[];
  fromConversationId?: string;
  conversations: Conversation[];
  onClose: () => void;
  onSent: (toConversationId: string, count: number) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const targets = conversations.filter((c) => c.id !== fromConversationId);
  const [sent, setSent] = useState(0);

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

        <div style={{ display: 'grid', gap: 6, marginBottom: 14 }}>
          {targets.length === 0
            ? <p className="muted" style={{ fontSize: 13, margin: 0 }}>There is nowhere else to send this yet.</p>
            : targets.map((c) => (
                <button key={c.id} type="button" className="btn btn-line btn-sm" disabled={Boolean(busy)}
                  style={{ justifyContent: 'flex-start' }} onClick={() => void send(c)}>
                  {busy === c.id
                    ? (messages.length > 1 ? `Sending ${sent + 1} of ${messages.length}…` : 'Sending…')
                    : (c.title || 'Conversation')}
                  {c.isGroup && <span className="muted" style={{ marginLeft: 6, fontSize: 11 }}>group</span>}
                </button>
              ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-line btn-sm" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
