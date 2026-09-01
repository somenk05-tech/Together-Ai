import { useEffect, useState } from 'react';
import { chatApi, useChatContacts, type GroupMember } from '@/api';
import { Avatar } from '@/components/ui';

/**
 * WHO IS IN THIS GROUP, AND WHO MAY CHANGE IT.
 *
 * The roster was frozen at creation until this existed. What the panel shows is
 * decided by the server, not guessed here: it renders the actions it is allowed
 * to render from the role it was handed, and every one of them is refused again
 * on the way in. A UI that hides a button is a courtesy; the gate is the API.
 *
 * The owner is never removable and never demotable, which is why their row has
 * no controls at all rather than controls that fail.
 */
export function GroupPanel({ conversationId, title, meId, onClose, onChanged, onLeft }: {
  conversationId: string;
  title: string;
  meId?: string;
  onClose: () => void;
  /** The conversation list owns the name and the membership — it refetches. */
  onChanged: () => void;
  onLeft: () => void;
}) {
  const [members, setMembers] = useState<GroupMember[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(title);
  const [adding, setAdding] = useState(false);
  const contacts = useChatContacts();

  const load = () => {
    chatApi.groupMembers(conversationId).then(setMembers).catch(() => setErr('Could not load who is in this group.'));
  };
  useEffect(load, [conversationId]);
  useEffect(() => { setName(title); }, [title]);

  const me = members?.find((m) => m.userId === meId);
  const canAdmin = me?.role === 'OWNER' || me?.role === 'ADMIN';
  const isOwner = me?.role === 'OWNER';

  /** Every action goes through here: one place that reports a refusal in the
   *  server's own words rather than a generic failure. */
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setErr(null);
    try { await fn(); load(); onChanged(); }
    catch (e) { setErr((e as { message?: string }).message || 'That did not work.'); }
    finally { setBusy(false); }
  };

  const already = new Set((members ?? []).map((m) => m.userId));
  const addable = (contacts.data ?? []).filter((c) => !already.has(c.id));

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9500, background: 'rgba(20,18,12,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={onClose}>
      <div className="card" style={{ width: 'min(460px, 100%)', maxHeight: '82vh', overflowY: 'auto', padding: '20px 22px' }}
        onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 12px', fontSize: 17 }}>Group</h3>

        {canAdmin ? (
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <input value={name} onChange={(e) => setName(e.target.value)} aria-label="Group name"
              style={{ flex: 1, fontSize: 16 }} />
            <button type="button" className="btn btn-sm" disabled={busy || !name.trim() || name === title}
              onClick={() => void run(() => chatApi.renameGroup(conversationId, name.trim()))}>Rename</button>
          </div>
        ) : (
          <p style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700 }}>{title}</p>
        )}

        {err && <p role="alert" style={{ fontSize: 13, margin: '0 0 12px', color: 'var(--danger-ink)' }}>{err}</p>}
        {!members && !err && <p className="muted" style={{ fontSize: 13 }}>Loading…</p>}

        {members && (
          <div style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
            {members.map((m) => (
              <div key={m.userId} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Avatar src={m.profileImage} name={m.name} size={32} />
                <span className="flex-min">
                  <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {m.name}{m.userId === meId ? ' (you)' : ''}
                  </span>
                  {m.handle && <span className="muted" style={{ display: 'block', fontSize: 11.5 }}>@{m.handle}</span>}
                </span>
                {m.role !== 'MEMBER' && (
                  <span className="pill" style={{ fontSize: 11 }}>{m.role === 'OWNER' ? 'Owner' : 'Admin'}</span>
                )}
                {/* The owner's row carries no controls — not disabled ones.
                    A button that is always refused is a question with one answer. */}
                {isOwner && m.role !== 'OWNER' && (
                  <button type="button" className="btn btn-line btn-sm" disabled={busy}
                    onClick={() => void run(() => chatApi.setGroupRole(conversationId, m.userId, m.role === 'ADMIN' ? 'MEMBER' : 'ADMIN'))}>
                    {m.role === 'ADMIN' ? 'Demote' : 'Make admin'}
                  </button>
                )}
                {canAdmin && m.role !== 'OWNER' && m.userId !== meId && (
                  <button type="button" className="btn btn-line btn-sm" disabled={busy}
                    style={{ color: 'var(--danger-ink)', borderColor: 'var(--danger-line)' }}
                    onClick={() => void run(() => chatApi.removeGroupMember(conversationId, m.userId))}>Remove</button>
                )}
              </div>
            ))}
          </div>
        )}

        {canAdmin && (
          <div style={{ marginBottom: 16 }}>
            <button type="button" className="btn btn-line btn-sm" onClick={() => setAdding((v) => !v)}
              aria-expanded={adding}>{adding ? 'Cancel' : 'Add people'}</button>
            {adding && (
              <div style={{ display: 'grid', gap: 6, marginTop: 10, maxHeight: 200, overflowY: 'auto' }}>
                {addable.length === 0
                  ? <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>
                      Everybody you are connected to is already here. You can only add members you are connected to.
                    </p>
                  : addable.map((c) => (
                      <button key={c.id} type="button" className="btn btn-line btn-sm" disabled={busy}
                        style={{ justifyContent: 'flex-start' }}
                        onClick={() => void run(() => chatApi.addGroupMembers(conversationId, [c.id]))}>
                        {c.name} <span className="muted" style={{ marginLeft: 6 }}>@{c.handle}</span>
                      </button>
                    ))}
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', flexWrap: 'wrap' }}>
          {/* Leaving says what it costs. The owner is told where the group goes,
              because "you are the owner" is exactly when somebody hesitates. */}
          <button type="button" className="btn btn-line btn-sm" disabled={busy}
            style={{ color: 'var(--danger-ink)', borderColor: 'var(--danger-line)' }}
            onClick={() => void run(async () => { await chatApi.leaveGroup(conversationId); onLeft(); })}>
            Leave group
          </button>
          <button type="button" className="btn btn-sm" onClick={onClose}>Done</button>
        </div>
        {isOwner && (members?.length ?? 0) > 1 && (
          <p className="muted" style={{ fontSize: 11.5, margin: '8px 0 0' }}>
            You own this group. If you leave, it passes to the longest-standing admin.
          </p>
        )}
      </div>
    </div>
  );
}
