import { useMemo, useState } from 'react';
import { Button, Spinner } from '@/components/ui';
import { chatApi, useChatContacts, useCreateGroup, type Contact } from '@/api';

/**
 * Toolbar above the conversation list: start a direct chat or create a group.
 *
 * The two buttons wear the stage's own pills rather than `.btn`, because on a
 * dark panel `.btn-line` is a white-edged ghost and `.btn-accent` is the city
 * accent, neither of which belongs in a black-and-white room. The MODAL below
 * is deliberately left on the city's white — a dialog is not part of the
 * stage, it is the app interrupting it, and a dark sheet over a dark panel
 * loses the boundary between the two.
 */
export function ChatStarter({ onOpened }: { onOpened: (conversationId: string) => void }) {
  const [mode, setMode] = useState<null | 'direct' | 'group'>(null);
  return (
    <div className="cstabs">
      <button type="button" className="cstab" onClick={() => setMode('direct')}>✉ New chat</button>
      <button type="button" className="cstab on" onClick={() => setMode('group')}>👥 New group</button>
      {mode && <StarterModal mode={mode} onClose={() => setMode(null)} onOpened={onOpened} />}
    </div>
  );
}

function StarterModal({ mode, onClose, onOpened }: { mode: 'direct' | 'group'; onClose: () => void; onOpened: (id: string) => void }) {
  const contacts = useChatContacts();
  const createGroup = useCreateGroup();
  const [query, setQuery] = useState('');
  const [title, setTitle] = useState('');
  const [picked, setPicked] = useState<Contact[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (contacts.data ?? []).filter((c) => !q || c.name.toLowerCase().includes(q) || c.handle.toLowerCase().includes(q));
  }, [contacts.data, query]);

  const toggle = (c: Contact) => setPicked((p) => p.some((x) => x.id === c.id) ? p.filter((x) => x.id !== c.id) : [...p, c]);

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      if (mode === 'direct') {
        if (!picked[0]) return;
        const conv = await chatApi.startDirect(picked[0].handle);
        onOpened(conv.id);
      } else {
        if (!picked.length) return;
        const conv = await createGroup.mutateAsync({ title: title.trim() || 'New group', memberIds: picked.map((c) => c.id) });
        onOpened(conv.id);
      }
      onClose();
    } catch (err) {
      const data = (err as { response?: { data?: { message?: unknown } } } | null)?.response?.data;
      const msg = typeof data?.message === 'string' ? data.message
        : Array.isArray(data?.message) ? data.message.join(' · ')
        : 'Could not start the chat — please try again.';
      setError(msg);
    } finally { setBusy(false); }
  };

  const rowStyle = (active: boolean): React.CSSProperties => ({ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', borderRadius: 'var(--r-1)', cursor: 'pointer', border: `1.5px solid ${active ? 'var(--accent)' : 'transparent'}`, background: active ? 'var(--accent-soft)' : 'transparent' });

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 100, display: 'grid', placeItems: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} className="card" style={{ width: 'min(440px, 96vw)', maxHeight: '88vh', overflow: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h2 style={{ fontSize: 17, margin: 0 }}>{mode === 'group' ? 'New group' : 'New chat'}</h2>
          <button type="button" onClick={onClose} aria-label="Close" style={{ marginLeft: 'auto', background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--ink-soft)' }}>×</button>
        </div>

        {mode === 'group' && (
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Group name" style={{ width: '100%', boxSizing: 'border-box', padding: '11px 12px', border: '1.5px solid var(--line)', borderRadius: 'var(--r-1)', fontSize: 14, fontFamily: 'inherit', margin: '12px 0 6px' }} />
        )}
        {mode === 'group' && picked.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '6px 0' }}>
            {picked.map((c) => <span key={c.id} onClick={() => toggle(c)} style={{ cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--accent-ink)', background: 'var(--accent-soft)', borderRadius: 'var(--r-full)', padding: '3px 10px' }}>{c.name} ×</span>)}
          </div>
        )}

        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search people…" style={{ width: '100%', boxSizing: 'border-box', padding: '9px 11px', border: '1.5px solid var(--line)', borderRadius: 'var(--r-1)', fontSize: 13, fontFamily: 'inherit', margin: '8px 0 4px' }} />
        {contacts.isLoading ? <Spinner /> : contacts.isError ? (
          // An empty people-picker on a failed read looks like having nobody
          // to talk to. The connections are still there.
          <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.6 }}>
            We couldn’t load your people just now — your connections are all
            still there. Try again in a moment.
          </p>
        ) : (
          <div style={{ display: 'grid', gap: 2, maxHeight: 300, overflow: 'auto' }}>
            {list.slice(0, 40).map((c) => {
              const active = picked.some((x) => x.id === c.id);
              return (
                <div key={c.id} onClick={() => (mode === 'direct' ? setPicked([c]) : toggle(c))} style={rowStyle(active)}>
                  <div className="tc-avatar" style={{ background: 'var(--accent-soft)', color: 'var(--accent-ink)', width: 30, height: 30, fontSize: 12 }}>{c.name.slice(0, 2).toUpperCase()}</div>
                  <span style={{ fontWeight: 600, fontSize: 13.5 }}>{c.name}</span>
                  <span className="muted" style={{ fontSize: 12 }}>@{c.handle}</span>
                  {active && <span style={{ marginLeft: 'auto', color: 'var(--accent-ink)', fontWeight: 800 }}>✓</span>}
                </div>
              );
            })}
          </div>
        )}

        {error && <p style={{ color: 'var(--danger-ink)', fontSize: 12.5, marginTop: 10 }}>{error}</p>}

        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <Button variant="accent" disabled={busy || !picked.length} onClick={() => void submit()}>
            {busy ? 'Creating…' : mode === 'group' ? `Create group (${picked.length})` : 'Start chat'}
          </Button>
          <Button variant="line" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}
