import { useMemo, useState } from 'react';
import { Button } from '@/components/ui';
import { useGroceryCatalogue, type CatalogueProduct, type MenuDraftItem } from './api';

/**
 * ── PICKING A SHELF OFF THE CITY'S CATALOGUE (owner, 8 Sep) ──────────────────
 *
 * "Create an online grocery store using the internet, show all the products
 * that's available in an area."
 *
 * A kirana carrying four hundred lines will not type four hundred lines. It has
 * them in a sheet, which is the door that shipped this morning — and if it does
 * not, it now has this one: search the city's catalogue, tick what is on the
 * shelves, and the picked rows land in the same review grid every other door
 * feeds, with the prices left EMPTY.
 *
 * THE PRICE IS LEFT EMPTY ON PURPOSE, and it is the whole design. The catalogue
 * knows what a pack is; it does not know and will never know what this shop
 * charges for it. A picker that helpfully pre-filled an MRP would be putting a
 * number in a shopkeeper's mouth and publishing it under their name — which is
 * the July mistake `grocery-orders-removed.spec.ts` still remembers. An empty
 * field asks to be filled; a filled one asks to be trusted.
 *
 * WHAT A PICKED ROW CARRIES BACK is the product's id, and that is what lets the
 * store put eight shops' atta on one tile with a price from each. The name and
 * the price stay the shop's: rename a line and it is theirs again.
 *
 * SOURCES ARE PRINTED, not hidden behind an info dot. Every row says which
 * public database it came from, because a catalogue that will not say where it
 * got a product is a catalogue asking to be believed.
 */

const box: React.CSSProperties = {
  padding: '8px 10px', border: '1.5px solid var(--line)', borderRadius: 'var(--r-1)',
  fontSize: 13, fontFamily: 'inherit', background: 'var(--card)', boxSizing: 'border-box',
};

/** The line under a name: the pack, or — for loose goods — that there is none. */
function packLine(p: CatalogueProduct): string {
  if (p.loose) return 'Sold loose — you set the unit and the price';
  return p.pack ?? '';
}

export function CataloguePicker({ onAdd, onCancel }: {
  onAdd: (items: MenuDraftItem[]) => void;
  onCancel: () => void;
}) {
  const [q, setQ] = useState('');
  const [aisle, setAisle] = useState<string>('');
  const [page, setPage] = useState(1);
  const [picked, setPicked] = useState<Record<string, CatalogueProduct>>({});

  const params = useMemo(() => ({ q: q.trim() || undefined, aisle: aisle || undefined, page }), [q, aisle, page]);
  const list = useGroceryCatalogue(params);

  const pickedCount = Object.keys(picked).length;
  const toggle = (p: CatalogueProduct) =>
    setPicked((cur) => {
      const next = { ...cur };
      if (next[p.id]) delete next[p.id]; else next[p.id] = p;
      return next;
    });

  /**
   * PICKED ROWS BECOME DRAFT LINES, and the mapping is deliberately plain:
   *
   *   name     brand + name + pack, which is what a shopkeeper would write on a
   *            board and what a citizen searches for. Editable afterwards.
   *   section  the aisle, so `grocery.ts` files it under the shopkeeper's own
   *            heading rather than falling through to "Everything else".
   *   price    NULL. Always. See the note at the top of this file.
   */
  const add = () => {
    const items: MenuDraftItem[] = Object.values(picked).map((p) => ({
      name: [p.brand, p.name, p.loose ? null : p.pack].filter(Boolean).join(' ').slice(0, 90),
      section: list.data?.aisles.find((a) => a.key === p.aisle)?.label,
      priceInr: null,
      productId: p.id,
    }));
    onAdd(items);
  };

  const total = list.data?.total ?? 0;
  const pageSize = list.data?.pageSize ?? 40;
  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div style={{ display: 'grid', gap: 'var(--space-10)' }}>
      <p style={{ fontSize: 12.5, margin: 0, fontWeight: 700 }}>
        Search the city’s catalogue and tick what you stock.
      </p>
      <p className="muted" style={{ fontSize: 12, margin: 0 }}>
        You set every price yourself on the next screen — nothing here is priced, and nothing
        publishes until you have looked at each line.
      </p>

      <input
        style={{ ...box, width: '100%' }} value={q} aria-label="Search the grocery catalogue"
        placeholder="Search — a brand, a product, an aisle"
        onChange={(e) => { setQ(e.target.value); setPage(1); }} maxLength={80}
      />

      <div style={{ display: 'flex', gap: 'var(--space-6)', flexWrap: 'wrap' }}>
        <button type="button" onClick={() => { setAisle(''); setPage(1); }}
          aria-pressed={aisle === ''} style={chip(aisle === '')}>All aisles</button>
        {(list.data?.aisles ?? []).map((a) => (
          <button key={a.key} type="button" onClick={() => { setAisle(a.key); setPage(1); }}
            aria-pressed={aisle === a.key} style={chip(aisle === a.key)}>{a.label}</button>
        ))}
      </div>

      {list.isLoading && <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>Reading the catalogue…</p>}
      {list.isError && (
        <p style={{ color: 'var(--danger-ink)', fontSize: 12.5, margin: 0 }} role="alert">
          The catalogue could not be read just now. Your sheet and the camera still work.
        </p>
      )}
      {list.data && list.data.products.length === 0 && (
        /* NOT "no results" — the catalogue genuinely may not have it, and the
           shop can still type the line themselves. Saying so is the honest
           empty state; a shrug is not. */
        <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>
          Nothing in the catalogue matches that. Type the line in yourself — your own products
          belong on your shelf whether or not a database has heard of them.
        </p>
      )}

      <div style={{ display: 'grid', gap: 'var(--space-6)', maxHeight: 420, overflowY: 'auto' }}>
        {(list.data?.products ?? []).map((p) => {
          const on = !!picked[p.id];
          return (
            <label key={p.id} style={{
              display: 'grid', gridTemplateColumns: '24px 44px 1fr', gap: 'var(--space-10)', alignItems: 'center',
              padding: '7px 9px', border: `1.5px solid ${on ? 'var(--accent-ink)' : 'var(--line)'}`,
              borderRadius: 'var(--r-1)', background: 'var(--card)', cursor: 'pointer',
            }}>
              <input type="checkbox" checked={on} onChange={() => toggle(p)}
                aria-label={`Stock ${[p.brand, p.name].filter(Boolean).join(' ')}`}
                style={{ width: 18, height: 18 }} />
              {p.imageUrl
                ? <img src={p.imageUrl} alt="" width={44} height={44} loading="lazy"
                    style={{ objectFit: 'contain', borderRadius: 'var(--r-1)', background: 'var(--paper)' }} />
                /* No picture is no picture. A silhouette standing in for a
                   vegetable would be a photograph of something that is not
                   this. */
                : <span aria-hidden style={{ width: 44, height: 44, borderRadius: 'var(--r-1)', background: 'var(--paper)' }} />}
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13, lineHeight: 1.3 }}>
                  {p.brand && <strong>{p.brand} </strong>}{p.name}
                </span>
                <span className="muted" style={{ display: 'block', fontSize: 11.5 }}>
                  {packLine(p)}{p.source && packLine(p) ? ' · ' : ''}
                  {p.source && <a href={p.source.url} target="_blank" rel="noreferrer noopener"
                    onClick={(e) => e.stopPropagation()}
                    style={{ color: 'inherit' }}>{p.source.name}</a>}
                </span>
              </span>
            </label>
          );
        })}
      </div>

      {pages > 1 && (
        <div style={{ display: 'flex', gap: 'var(--space-8)', alignItems: 'center', flexWrap: 'wrap' }}>
          <Button variant="line" size="sm" disabled={page <= 1} onClick={() => setPage((n) => n - 1)}>Back</Button>
          <span className="muted" style={{ fontSize: 12 }}>Page {page} of {pages} · {total} products</span>
          <Button variant="line" size="sm" disabled={page >= pages} onClick={() => setPage((n) => n + 1)}>More</Button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 'var(--space-8)', flexWrap: 'wrap' }}>
        <Button variant="accent" size="sm" disabled={pickedCount === 0} onClick={add}>
          {pickedCount === 0 ? 'Tick what you stock' : `Add ${pickedCount} to your list`}
        </Button>
        <Button variant="line" size="sm" onClick={onCancel}>Cancel</Button>
        {pickedCount > 0 && (
          <span className="muted" style={{ fontSize: 12, alignSelf: 'center' }}>
            Ticks are kept while you search — search again and add more before you finish.
          </span>
        )}
      </div>
    </div>
  );
}

function chip(on: boolean): React.CSSProperties {
  return {
    padding: '5px 10px', borderRadius: 'var(--r-full)', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer',
    border: `1.5px solid ${on ? 'var(--accent-ink)' : 'var(--line)'}`,
    background: on ? 'var(--accent-soft)' : 'var(--card)',
    color: 'inherit', minHeight: 30,
  };
}
