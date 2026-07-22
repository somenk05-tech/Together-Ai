import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Spinner, Tag } from '@/components/ui';
import { useQcCompare, useQcOrder, useQcSearch } from '../hooks';
import type { QcQuote } from '../api';

const BADGE_STYLE: Record<string, { bg: string; fg: string }> = {
  recommended: { bg: '#2e7d4f', fg: '#fff' },
  cheapest: { bg: '#b9770e', fg: '#fff' },
  fastest: { bg: '#2f8fce', fg: '#fff' },
  'best availability': { bg: '#7d3c98', fg: '#fff' },
};

function QuoteCard({ q, selected, onSelect }: { q: QcQuote; selected: boolean; onSelect: () => void }) {
  return (
    <button type="button" onClick={onSelect}
      style={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%' }}>
      <Card style={{ padding: '16px 18px', border: selected ? '2px solid var(--accent)' : undefined }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 22 }}>{q.provider.icon}</span>
          <div style={{ flex: 1, minWidth: 140 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <b style={{ fontSize: 14.5 }}>{q.provider.name}</b>
              {q.badges.map((b) => (
                <span key={b} style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase',
                  padding: '2px 7px', borderRadius: 999, background: BADGE_STYLE[b]?.bg ?? 'var(--line)', color: BADGE_STYLE[b]?.fg ?? 'var(--ink)' }}>
                  {b}
                </span>
              ))}
            </div>
            <p className="muted" style={{ fontSize: 11.5, margin: '2px 0 0' }}>
              ⏱ {q.etaMinutes} min · {q.availableCount}/{q.itemCount} items
              {q.unavailableCount > 0 && ` · ${q.unavailableCount} unavailable`}
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontWeight: 800, fontSize: 17 }}>₹{q.totalInr.toLocaleString('en-IN')}</div>
            <p className="muted" style={{ fontSize: 10.5, margin: 0 }}>
              items ₹{q.itemsTotalInr.toLocaleString('en-IN')} · delivery {q.deliveryFeeInr === 0 ? 'FREE' : `₹${q.deliveryFeeInr}`}
              {q.surgeInr > 0 ? ` · surge ₹${q.surgeInr}` : ''}
            </p>
          </div>
        </div>
        {selected && q.unavailable.length > 0 && (
          <p className="muted" style={{ fontSize: 11, margin: '8px 0 0' }}>
            Not available here: {q.unavailable.join(', ')}{q.unavailableCount > q.unavailable.length ? '…' : ''}
          </p>
        )}
      </Card>
    </button>
  );
}

/** Quick Commerce — the grocery list found across online stores: compare
 *  price, availability and delivery time, then order through the winner. */
export function QuickCommercePanel({ mode = 'individual' }: { mode?: 'individual' | 'family' }) {
  const compare = useQcCompare(mode);
  const order = useQcOrder();
  const search = useQcSearch();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);

  const quotes = compare.data?.quotes ?? [];
  const chosen = quotes.find((x) => x.provider.key === selected) ?? quotes[0];

  const placeOrder = () => {
    if (!chosen) return;
    setError(null);
    order.mutate({ provider: chosen.provider.key, mode }, {
      onSuccess: () => navigate('/nutrition/orders'),
      onError: (e) => {
        const m = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
        setError(Array.isArray(m) ? m.join(' ') : m ?? 'Could not place the order.');
      },
    });
  };

  return (
    <div style={{ margin: '18px 0 22px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
        <h3 style={{ fontFamily: 'var(--serif)', fontSize: 19, margin: 0 }}>Your list, across every store</h3>
        {compare.data?.live
          ? <Tag>LIVE prices</Tag>
          : compare.data?.liveEnabled
            ? <span className="muted" style={{ fontSize: 11 }}>⚡ live store connection active — matching products… (estimates shown meanwhile)</span>
            : <span className="muted" style={{ fontSize: 11 }}>estimated prices — live store data connects automatically when enabled</span>}
      </div>
      <p className="muted" style={{ fontSize: 12.5, margin: '0 0 14px' }}>
        The same {compare.data?.itemCount ?? ''} items priced at each quick-commerce store — with delivery time,
        stock and fees — so you can order through whichever wins.
      </p>

      {compare.isLoading && <Spinner label="Pricing your list across stores…" />}
      {compare.data?.note && <Card style={{ padding: 16 }}><p className="muted" style={{ fontSize: 13 }}>{compare.data.note}</p></Card>}

      {quotes.length > 0 && (
        <>
          <div style={{ display: 'grid', gap: 10 }}>
            {quotes.map((quote) => (
              <QuoteCard key={quote.provider.key} q={quote}
                selected={chosen?.provider.key === quote.provider.key}
                onSelect={() => setSelected(quote.provider.key)} />
            ))}
          </div>
          {error && <p style={{ color: '#c0392b', fontSize: 13, margin: '10px 0 0' }}>{error}</p>}
          {chosen && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
              <Button variant="accent" disabled={order.isPending || chosen.availableCount === 0} onClick={placeOrder}>
                {order.isPending ? 'Placing order…' : `Order via ${chosen.provider.name} · ₹${chosen.totalInr.toLocaleString('en-IN')}`}
              </Button>
              <span className="muted" style={{ fontSize: 12 }}>
                ⏱ arrives in ~{chosen.etaMinutes} min · paid from your city wallet · live tracking in My Orders
              </span>
            </div>
          )}
        </>
      )}

      {/* Find ONE product across apps */}
      <div style={{ marginTop: 22 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && q.trim().length > 1) search.mutate(q.trim()); }}
            placeholder="Find any product across apps — e.g. paneer, cold coffee, atta…"
            style={{ flex: 1, padding: '11px 14px', borderRadius: 10, border: '1.5px solid var(--line)',
              background: 'var(--card)', color: 'var(--ink)', fontFamily: 'inherit', fontSize: 13.5 }} />
          <Button variant="line" size="sm" disabled={q.trim().length < 2 || search.isPending}
            onClick={() => search.mutate(q.trim())}>
            {search.isPending ? 'Searching…' : 'Search'}
          </Button>
        </div>
        {search.data && (
          <Card style={{ marginTop: 10, padding: '14px 18px' }}>
            <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
              “{search.data.query}” across stores {search.data.live && <Tag>LIVE</Tag>}
            </p>
            <div style={{ display: 'grid', gap: 6 }}>
              {search.data.results.map((row) => (
                <div key={row.provider.key} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                  <span>{row.provider.icon}</span>
                  <span style={{ flex: 1 }}>{row.provider.name}</span>
                  <span className="muted" style={{ fontSize: 11.5 }}>⏱ {row.etaMinutes}m</span>
                  {row.available
                    ? <b>₹{row.priceInr}</b>
                    : <span className="muted" style={{ fontSize: 12 }}>out of stock</span>}
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
