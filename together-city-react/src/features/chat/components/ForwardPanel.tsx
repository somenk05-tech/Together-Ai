import { useState } from 'react';
import { chatApi, type Conversation, type Message } from '@/api';

/**
 * WHERE DOES THIS GO.
 *
 * One conversation at a time, deliberately: forwarding to several at once is
 * the same call in a loop, and the thing that makes it safe — being sure which
 * room you just put somebody's message into — is exactly what a multi-select
 * makes fuzzy. The list names the room and says nothing else.
 *
 * The conversation it came FROM is excluded. Forwarding a message into the
 * thread it is already in is never what somebody means, and offering it is how
 * a mis-tap becomes a duplicate.
 */
export function ForwardPanel({ message, fromConversationId, conversations, onClose, onSent }: {
  message: Message;
  fromConversationId?: string;
  conversations: Conversation[];
  onClose: () => void;
  onSent: (toConversationId: string) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const targets = conversations.filter((c) => c.id !== fromConversationId);
  const preview = message.body
    || (message.share?.title ? `Card · ${message.share.title}` : '')
    || ((message.media ?? []).length ? `${message.media!.length} attachment${message.media!.length > 1 ? 's' : ''}` : 'Message');

  const send = async (to: Conversation) => {
    setBusy(to.id); setErr(null);
    try {
      await chatApi.forwardMessage(to.id, message);
      onSent(to.id);
    } catch (e) {
      setErr((e as { message?: string }).message || 'That could not be forwarded.');
      setBusy(null);
    }
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
                  {busy === c.id ? 'Sending…' : (c.title || 'Conversation')}
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
