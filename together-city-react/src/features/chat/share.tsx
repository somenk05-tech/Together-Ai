import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Spinner } from '@/components/ui';
import { chatApi, useConversations, useChatContacts } from '@/api';
import type { ShareCard } from '@/types';

const KIND_META: Record<string, { icon: string; label: string }> = {
  flight: { icon: '✈️', label: 'Flight' }, trip: { icon: '🧳', label: 'Trip' },
  product: { icon: '🛍', label: 'Product' }, property: { icon: '🏠', label: 'Property' },
  event: { icon: '🎟', label: 'Event' }, restaurant: { icon: '🍽', label: 'Restaurant' },
  dish: { icon: '🍲', label: 'Dish' }, ticket: { icon: '🎫', label: 'Ticket' }, job: { icon: '💼', label: 'Job' },
  movie: { icon: '🎬', label: 'Movie' }, tv: { icon: '📺', label: 'TV Show' },
  recipe: { icon: '🥗', label: 'Recipe' }, place: { icon: '📍', label: 'Place' },
};
const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');

/** Renders a shared hub item as a rich card (used inside a chat message and in the share preview). */
export function ShareCardView({ card, compact }: { card: ShareCard; compact?: boolean }) {
  const meta = KIND_META[card.kind] ?? { icon: '🔗', label: 'Shared' };
  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 14, overflow: 'hidden', background: 'var(--card, #fff)', width: compact ? '100%' : 280, maxWidth: '100%' }}>
      {card.image && <div style={{ aspectRatio: '16 / 9', background: 'var(--line)' }}><img src={card.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></div>}
      <div style={{ padding: '10px 12px' }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--accent)' }}>{meta.icon} {card.hub || meta.label}</div>
        <div style={{ fontWeight: 700, fontSize: 14, marginTop: 2 }}>{card.title}</div>
        {card.subtitle && <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>{card.subtitle}</div>}
        {card.meta && card.meta.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 7 }}>
            {card.meta.map((m, i) => <span key={i} style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--ink-soft)', background: 'var(--line)', borderRadius: 999, padding: '2px 8px' }}>{m}</span>)}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 9 }}>
          {typeof card.priceInr === 'number' && card.priceInr > 0 && <div style={{ fontWeight: 800, fontSize: 15 }}>{inr(card.priceInr)}</div>}
          {card.deepLink && <Link to={card.deepLink} style={{ marginLeft: 'auto' }}><Button variant="line" size="sm">View in hub →</Button></Link>}
        </div>
      </div>
    </div>
  );
}

/** A "Share" button that opens a modal to send this item into a Together City chat. */
export function ShareToChat({ item, label = 'Share to chat', variant = 'line', size = 'sm' }: {
  item: ShareCard; label?: string; variant?: 'line' | 'accent' | 'ghost'; size?: 'sm' | 'md';
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} size={size} onClick={() => setOpen(true)}>💬 {label}</Button>
      {open && <ShareModal item={item} onClose={() => setOpen(false)} />}
    </>
  );
}

function ShareModal({ item, onClose }: { item: ShareCard; onClose: () => void }) {
  const convos = useConversations();
  const contacts = useChatContacts();
  const [note, setNote] = useState('');
  const [target, setTarget] = useState<{ type: 'conversation' | 'contact'; id: string; handle?: string; label: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [query, setQuery] = useState('');

  const contactList = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (contacts.data ?? []).filter((c) => !q || c.name.toLowerCase().includes(q) || c.handle.toLowerCase().includes(q));
  }, [contacts.data, query]);

  const send = async () => {
    if (!target) return;
    setBusy(true);
    try {
      let convId = target.id;
      if (target.type === 'contact') { const c = await chatApi.startDirect(target.handle as string); convId = c.id; }
      await chatApi.sendShare(convId, note.trim(), item);
      setDone(true);
      setTimeout(onClose, 1100);
    } finally { setBusy(false); }
  };

  const row = (active: boolean): React.CSSProperties => ({ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', borderRadius: 10, cursor: 'pointer', border: `1.5px solid ${active ? 'var(--accent)' : 'transparent'}`, background: active ? 'var(--accent-soft, #f5efe0)' : 'transparent' });

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 100, display: 'grid', placeItems: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} className="card" style={{ width: 'min(460px, 96vw)', maxHeight: '88vh', overflow: 'auto' }}>
        {done ? (
          <div style={{ textAlign: 'center', padding: '24px 8px' }}>
            <div style={{ fontSize: 34 }}>✅</div>
            <div style={{ fontWeight: 700, fontSize: 16, marginTop: 6 }}>Shared to your chat</div>
            <div className="muted" style={{ fontSize: 13 }}>Open Chats to see it.</div>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ fontSize: 18, margin: 0 }}>Share to a chat</h2>
              <button type="button" onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--ink-soft)' }}>×</button>
            </div>
            <div style={{ margin: '12px 0' }}><ShareCardView card={item} compact /></div>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Add a note (optional)…"
              style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1.5px solid var(--line)', borderRadius: 10, fontSize: 13.5, fontFamily: 'inherit', resize: 'vertical' }} />

            <div className="eyebrow" style={{ marginTop: 12 }}>Recent chats</div>
            {convos.isLoading ? <Spinner /> : (
              <div style={{ display: 'grid', gap: 2, marginTop: 4 }}>
                {(convos.data ?? []).slice(0, 4).map((c) => (
                  <div key={c.id} onClick={() => setTarget({ type: 'conversation', id: c.id, label: c.title ?? 'Chat' })} style={row(target?.type === 'conversation' && target.id === c.id)}>
                    <div className="tc-avatar" style={{ background: 'var(--accent-soft)', color: 'var(--accent)', width: 30, height: 30, fontSize: 12 }}>{c.isGroup ? '👥' : (c.title ?? 'C').slice(0, 2).toUpperCase()}</div>
                    <span style={{ fontWeight: 600, fontSize: 13.5 }}>{c.title ?? 'Conversation'}</span>
                    {c.isGroup && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-soft, #f5efe0)', borderRadius: 999, padding: '1px 7px' }}>GROUP</span>}
                  </div>
                ))}
              </div>
            )}

            <div className="eyebrow" style={{ marginTop: 12 }}>Or send to someone</div>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search people…" style={{ width: '100%', boxSizing: 'border-box', padding: '9px 11px', border: '1.5px solid var(--line)', borderRadius: 10, fontSize: 13, fontFamily: 'inherit', marginBottom: 4 }} />
            <div style={{ display: 'grid', gap: 2, maxHeight: 180, overflow: 'auto' }}>
              {contactList.slice(0, 20).map((c) => (
                <div key={c.id} onClick={() => setTarget({ type: 'contact', id: c.id, handle: c.handle, label: c.name })} style={row(target?.type === 'contact' && target.id === c.id)}>
                  <div className="tc-avatar" style={{ background: 'var(--accent-soft)', color: 'var(--accent)', width: 30, height: 30, fontSize: 12 }}>{c.name.slice(0, 2).toUpperCase()}</div>
                  <span style={{ fontWeight: 600, fontSize: 13.5 }}>{c.name}</span>
                  <span className="muted" style={{ fontSize: 12 }}>@{c.handle}</span>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 14, alignItems: 'center' }}>
              <Button variant="accent" disabled={!target || busy} onClick={send}>{busy ? 'Sending…' : target ? `Send to ${target.label}` : 'Pick a chat'}</Button>
              <Button variant="line" onClick={onClose}>Cancel</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
