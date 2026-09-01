import { useState } from 'react';
import { Button, Spinner } from '@/components/ui';
import { useMenu, useAskAboutMenu, menuVoice, rupees } from './api';

/**
 * THE MENU, AND ASKING ABOUT SOME OF IT.
 *
 * Picking items sends a MESSAGE, not an order. There is no payment here, no
 * stock, no confirmation — and a business acting on an "order" the app never
 * actually took is the worst kind of half-feature, so the button says "Ask
 * about these" and the message it writes ends with the same sentence.
 *
 * A total is shown only when every picked line has a price. A total that
 * silently leaves out the "ask" items is a number the citizen will hold the
 * business to, and it is wrong in the direction that causes an argument.
 */
export function MenuView({ listingId, group, onSent }: { listingId: string; group?: string; onSent?: (threadId: string) => void }) {
  const voice = menuVoice(group ?? '');
  const q = useMenu(listingId);
  const ask = useAskAboutMenu(listingId);
  const [picked, setPicked] = useState<string[]>([]);
  const [note, setNote] = useState('');

  if (q.isLoading) return <Spinner label="Loading…" />;
  // A menu that failed to load says so. Falling through to `count === 0` would
  // render nothing at all, which reads as "this business has no menu" — a claim
  // about somebody else's business that was never checked.
  if (q.isError) {
    return (
      <p className="muted" style={{ fontSize: 12.5, marginTop: 14 }} role="alert">
        That list could not be loaded just now.
      </p>
    );
  }
  if (!q.data || q.data.count === 0) return null;

  const all = q.data.sections.flatMap((s) => s.items);
  const chosen = all.filter((i) => picked.includes(i.id));
  const priced = chosen.filter((i) => i.priceInr != null);
  const total = chosen.length > 0 && priced.length === chosen.length
    ? priced.reduce((n, i) => n + (i.priceInr as number), 0)
    : null;

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <div style={{ borderTop: '1px solid var(--line)', marginTop: 16, paddingTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 14 }}>{voice.heading}</strong>
        <span className="muted" style={{ fontSize: 12.5 }}>{q.data.count} {voice.unit(q.data.count)}</span>
        {q.data.scanUrl && (
          <a href={q.data.scanUrl} target="_blank" rel="noreferrer"
            style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--accent-ink)' }}>See the original</a>
        )}
      </div>

      {q.data.sections.map((sec) => (
        <div key={sec.section ?? '_'} style={{ marginTop: 10 }}>
          {sec.section && (
            <div className="eyebrow" style={{ margin: '0 0 4px' }}>{sec.section}</div>
          )}
          <div style={{ display: 'grid', gap: 2 }}>
            {sec.items.map((it) => (
              <label key={it.id}
                style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '7px 2px', cursor: 'pointer', minHeight: 44 }}>
                <input type="checkbox" checked={picked.includes(it.id)} onChange={() => toggle(it.id)}
                  style={{ marginTop: 3, flexShrink: 0 }} />
                <span className="flex-min">
                  <span style={{ fontSize: 13.5, fontWeight: 600 }}>{it.name}</span>
                  {it.description && (
                    <span className="muted" style={{ display: 'block', fontSize: 12 }}>{it.description}</span>
                  )}
                </span>
                <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0 }}>
                  {/* Not free — unpriced. The word matters. */}
                  {it.priceInr != null ? rupees(it.priceInr) : <span className="muted" style={{ fontWeight: 400 }}>Ask</span>}
                </span>
              </label>
            ))}
          </div>
        </div>
      ))}

      {chosen.length > 0 && (
        <div style={{ marginTop: 12, padding: '12px 14px', border: '1px solid var(--line)', borderRadius: 12 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600 }}>
            {chosen.length} picked
            {total != null
              ? ` · ${rupees(total)} at the listed prices`
              : ' · some of these have no listed price'}
          </div>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500}
            aria-label="Anything to add" placeholder="Anything to add? Timing, quantity, questions…"
            style={{ width: '100%', boxSizing: 'border-box', marginTop: 8, padding: '9px 12px', border: '1.5px solid var(--line)', borderRadius: 'var(--r-1)', fontSize: 13.5, fontFamily: 'inherit', background: 'var(--card)' }} />
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <Button variant="accent" size="sm" disabled={ask.isPending}
              onClick={() => ask.mutate({ itemIds: picked, note: note.trim() || undefined }, {
                onSuccess: (r) => { setPicked([]); setNote(''); onSent?.(r.threadId); },
              })}>
              {ask.isPending ? 'Sending…' : voice.action}
            </Button>
            <Button variant="line" size="sm" onClick={() => setPicked([])}>Clear</Button>
          </div>
          <p className="muted" style={{ fontSize: 11.5, margin: '8px 0 0' }}>
            This sends a message to the business. {voice.caveat} — nothing is reserved and
            nothing is paid.
          </p>
        </div>
      )}
    </div>
  );
}
