import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Spinner } from '@/components/ui';
import { successToast } from '@/components/form-validation';
import { chatApi, useConversations, useChatContacts } from '@/api';
import type { ShareCard } from '@/types';

const KIND_META: Record<string, { icon: string; label: string }> = {
  flight: { icon: '✈️', label: 'Flight' }, trip: { icon: '🧳', label: 'Trip' },
  product: { icon: '🛍', label: 'Product' }, property: { icon: '🏠', label: 'Property' },
  event: { icon: '🎟', label: 'Event' }, restaurant: { icon: '🍽', label: 'Restaurant' },
  dish: { icon: '🍲', label: 'Dish' }, ticket: { icon: '🎫', label: 'Ticket' }, job: { icon: '💼', label: 'Job' },
  movie: { icon: '🎬', label: 'Movie' }, tv: { icon: '📺', label: 'TV Show' },
  recipe: { icon: '🥗', label: 'Recipe' }, place: { icon: '📍', label: 'Place' },
  post: { icon: '📝', label: 'Post' },
};
const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');

/**
 * Renders a shared hub item as a rich card (used inside a chat message and in the share preview).
 * `clickable` makes the WHOLE card a link to its deepLink (used in message threads) — the CTA
 * then renders as a visual affordance only, so we never nest <a> inside <a>.
 */
export function ShareCardView({ card, compact, clickable }: { card: ShareCard; compact?: boolean; clickable?: boolean }) {
  const meta = KIND_META[card.kind] ?? { icon: '🔗', label: 'Shared' };
  const ctaText = KIND_META[card.kind] ? `View ${meta.label} →` : 'View in hub →';
  const asLink = Boolean(clickable && card.deepLink);
  const shell: React.CSSProperties = {
    display: 'block', border: '1px solid var(--line)', borderRadius: 14, overflow: 'hidden',
    background: 'var(--card)', width: compact ? '100%' : 280, maxWidth: '100%',
    /* --ink, NOT inherit. The card paints its own white ground, so inheriting
       meant it rendered in whatever ink surrounded it — which on the chat
       stage is near-white, and the title of every shared film disappeared
       into the card it was printed on. A surface that brings its own ground
       brings its own ink; `inherit` was only ever correct here by luck,
       because everywhere it had landed before was white too. */
    color: 'var(--ink)', textDecoration: 'none', ...(asLink ? { cursor: 'pointer' } : null),
  };
  const body = (
    <>
      {card.image && <div style={{ aspectRatio: '16 / 9', background: 'var(--line)' }}><img src={card.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></div>}
      <div style={{ padding: '10px 12px' }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--accent-ink)' }}>{meta.icon} {card.hub || meta.label}</div>
        <div style={{ fontWeight: 700, fontSize: 14, marginTop: 2 }}>{card.title}</div>
        {card.subtitle && <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>{card.subtitle}</div>}
        {card.meta && card.meta.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 7 }}>
            {card.meta.map((m, i) => <span key={i} style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--ink-soft)', background: 'var(--line)', borderRadius: 999, padding: '2px 8px' }}>{m}</span>)}
          </div>
        )}
        {/* Composite items (e.g. every dish in a shared meal) — the recipient sees the whole card. */}
        {card.items && card.items.length > 0 && (
          <div style={{ marginTop: 8, borderTop: '1px solid var(--line)', paddingTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
            {card.items.map((it, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--ink-soft)' }}>
                <span aria-hidden style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--accent)', flex: '0 0 auto' }} />
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it}</span>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 9 }}>
          {typeof card.priceInr === 'number' && card.priceInr > 0 && <div style={{ fontWeight: 800, fontSize: 15 }}>{inr(card.priceInr)}</div>}
          {card.deepLink && (asLink
            ? <span className="btn btn-line btn-sm" aria-hidden style={{ marginLeft: 'auto', pointerEvents: 'none' }}>{ctaText}</span>
            : <Link to={card.deepLink} style={{ marginLeft: 'auto' }}><Button variant="line" size="sm">{ctaText}</Button></Link>)}
        </div>
      </div>
    </>
  );
  return asLink
    ? <Link to={card.deepLink as string} aria-label={`Open ${card.title}`} style={shell}>{body}</Link>
    : <div style={shell}>{body}</div>;
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

export function ShareModal({ item, onClose }: { item: ShareCard; onClose: () => void }) {
  const convos = useConversations();
  const contacts = useChatContacts();
  const [note, setNote] = useState('');
  const [target, setTarget] = useState<{ type: 'conversation' | 'contact'; id: string; handle?: string; label: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const contactList = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (contacts.data ?? []).filter((c) => !q || c.name.toLowerCase().includes(q) || c.handle.toLowerCase().includes(q));
  }, [contacts.data, query]);

  const send = async () => {
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
      let convId = target.id;
      if (target.type === 'contact') { const c = await chatApi.startDirect(target.handle as string); convId = c.id; }
      await chatApi.sendShare(convId, note.trim(), item);
      // Brief ✓ Sent, then auto-close back to exactly where the user was, with a
      // confirmation toast. Failures keep the dialog open (see catch).
      setDone(true);
      const name = target.label;
      setTimeout(() => { onClose(); successToast(`Shared with ${name}.`); }, 450);
    } catch {
      setError('Unable to send. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const row = (active: boolean): React.CSSProperties => ({ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', borderRadius: 10, cursor: 'pointer', border: `1.5px solid ${active ? 'var(--accent)' : 'transparent'}`, background: active ? 'var(--accent-soft)' : 'transparent' });

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 100, display: 'grid', placeItems: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} className="card" style={{ width: 'min(460px, 96vw)', maxHeight: '88vh', overflow: 'auto' }}>
        {done ? (
          <div style={{ textAlign: 'center', padding: '22px 8px' }}>
            <div style={{ fontSize: 30, color: 'var(--ok-ink)', fontWeight: 800, lineHeight: 1 }}>✓</div>
            <div style={{ fontWeight: 700, fontSize: 15, marginTop: 6 }}>Sent</div>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ fontSize: 18, margin: 0 }}>Share to a chat</h2>
              <button type="button" onClick={onClose} aria-label="Close" style={{ marginLeft: 'auto', background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--ink-soft)' }}>×</button>
            </div>
            <div style={{ margin: '12px 0' }}><ShareCardView card={item} compact /></div>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Add a note (optional)…"
              style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1.5px solid var(--line)', borderRadius: 10, fontSize: 13.5, fontFamily: 'inherit', resize: 'vertical' }} />

            <div className="eyebrow" style={{ marginTop: 12 }}>Recent chats</div>
            {convos.isLoading ? <Spinner /> : convos.isError ? (
              <p className="muted" style={{ fontSize: 12.5 }}>
                We couldn’t load your recent chats just now — they’re still
                there. Try again in a moment.
              </p>
            ) : (
              <div style={{ display: 'grid', gap: 2, marginTop: 4 }}>
                {(convos.data ?? []).slice(0, 4).map((c) => (
                  <div key={c.id} onClick={() => setTarget({ type: 'conversation', id: c.id, label: c.title ?? 'Chat' })} style={row(target?.type === 'conversation' && target.id === c.id)}>
                    <div className="tc-avatar" style={{ background: 'var(--accent-soft)', color: 'var(--accent-ink)', width: 30, height: 30, fontSize: 12 }}>{c.isGroup ? '👥' : (c.title ?? 'C').slice(0, 2).toUpperCase()}</div>
                    <span style={{ fontWeight: 600, fontSize: 13.5 }}>{c.title ?? 'Conversation'}</span>
                    {c.isGroup && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent-ink)', background: 'var(--accent-soft)', borderRadius: 999, padding: '1px 7px' }}>GROUP</span>}
                  </div>
                ))}
              </div>
            )}

            <div className="eyebrow" style={{ marginTop: 12 }}>Or send to someone</div>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search people…" style={{ width: '100%', boxSizing: 'border-box', padding: '9px 11px', border: '1.5px solid var(--line)', borderRadius: 10, fontSize: 13, fontFamily: 'inherit', marginBottom: 4 }} />
            {contacts.isError && (
              <p className="muted" style={{ fontSize: 12.5 }}>
                We couldn’t load your people just now — your connections are all
                still there. Try again in a moment.
              </p>
            )}
            <div style={{ display: 'grid', gap: 2, maxHeight: 180, overflow: 'auto' }}>
              {contactList.slice(0, 20).map((c) => (
                <div key={c.id} onClick={() => setTarget({ type: 'contact', id: c.id, handle: c.handle, label: c.name })} style={row(target?.type === 'contact' && target.id === c.id)}>
                  <div className="tc-avatar" style={{ background: 'var(--accent-soft)', color: 'var(--accent-ink)', width: 30, height: 30, fontSize: 12 }}>{c.name.slice(0, 2).toUpperCase()}</div>
                  <span style={{ fontWeight: 600, fontSize: 13.5 }}>{c.name}</span>
                  <span className="muted" style={{ fontSize: 12 }}>@{c.handle}</span>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 14, alignItems: 'center' }}>
              <Button variant="accent" disabled={!target || busy} onClick={() => void send()}>{busy ? 'Sending…' : target ? `Send to ${target.label}` : 'Pick a chat'}</Button>
              <Button variant="line" onClick={onClose}>Cancel</Button>
            </div>
            {error && (
              <p role="alert" style={{ color: 'var(--danger-ink)', fontSize: 12.5, fontWeight: 600, margin: '10px 0 0' }}>{error}</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
