import { useMemo, useState } from 'react';
import { AllergyNote, Button, EmptyState, Spinner } from '@/components/ui';
import { useBagActions, useBeautyProducts, useBeautyRoutine, type RecommendedProduct } from '../api';
import { BeautyBagBar } from '../components/BeautyBagBar';
import { ShareToChat } from '@/features/chat/share';
import { ProductShot } from '../components/ProductShot';

/**
 * The whole shelf, laid out as a shop.
 *
 * THE SERVER HAS ALWAYS SENT EVERYTHING. `recommendProducts()` scores every
 * product, drops only what a declared sensitivity makes unsafe, and sorts
 * matched first — there is no cap anywhere in the path. With thirteen products
 * that meant a page you took in at a glance. With seventy it means a wall, and
 * "everything is here" stops being the same thing as "you can find it".
 *
 * THE REFERENCE THE OWNER SENT is The Ordinary's shop: a category row across
 * the top, a filter / title / sort bar, and a wide grid of large photographs on
 * white with the name and the price centred underneath in small type. What that
 * layout is FOR is comparison — you are looking across eight bottles at once,
 * not reading one. So the tile carries the four things you compare on (picture,
 * brand, name, price) and everything else waits behind a disclosure.
 *
 * WHAT THAT COST, AND WHY IT IS WORTH IT. The old card printed the matched-
 * because chips, the biomarker chips, the actives, the usage and the blurb, all
 * at once, on every product. That is the right density for thirteen products
 * and unreadable across seventy. It is all still here, one tap down, on the
 * tile you are actually interested in.
 *
 * "SORTED IN CATEGORIES" IS THE DEFAULT AND NOT A FILTER. With no category
 * chosen the grid runs as labelled sections — Cleanser, Toner, Serum — in shelf
 * order, because a flat grid of thirty-eight skincare products sorted by match
 * score is a heap. Choosing one category collapses to that section alone.
 *
 * THE SEGMENTS READ `group`, WHICH IS A BUG FIX AND NOT A REFACTOR. They were
 * decided by sniffing the display category for "Haircare", "Hair" or "Scalp".
 * That was true of the old thirteen and is false of the new seventy: "Shampoo"
 * and "Conditioner" contain none of those words, so the two most obvious hair
 * products in the shop were filed under Skin — and body care, a group that did
 * not exist when the rule was written, went there too.
 */

const SEGMENTS = [
  { key: 'Skincare', label: 'Skincare' },
  { key: 'Hair Care', label: 'Hair' },
  { key: 'Body Care', label: 'Body' },
] as const;
type Segment = typeof SEGMENTS[number]['key'];

const SORTS = [
  { key: 'match', label: 'Best match' },
  { key: 'low', label: 'Price: low to high' },
  { key: 'high', label: 'Price: high to low' },
  { key: 'name', label: 'Name' },
] as const;
type Sort = typeof SORTS[number]['key'];

const TIER_TONE: Record<string, string> = { Budget: 'var(--ok-ink)', 'Mid-range': 'var(--info-ink)', Premium: 'var(--accent-ink)' };

/** Where in the routine a product already appears, in the reader's words. */
const BAND_WORD: Record<string, string> = { morning: 'morning', evening: 'evening', weekly: 'wash day', body: 'body care' };

function Tile(
  { p, inRoutine, qty, onAdd, onRemove }:
  { p: RecommendedProduct; inRoutine: string[]; qty: number; onAdd: () => void; onRemove: () => void },
) {
  const [open, setOpen] = useState(false);
  return (
    <article style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <div style={{ position: 'relative' }}>
        {/* THE + IS THE WHOLE INTERACTION on the reference's tile, and it is a
            44px target around a small mark for the same reason the photo grid
            uses one: the tap area is not the drawing. */}
        <button type="button" onClick={qty > 0 ? onRemove : onAdd}
          aria-label={qty > 0 ? `Remove ${p.name} from your bag` : `Add ${p.name} to your bag`}
          style={{ position: 'absolute', top: 0, right: 0, zIndex: 1, width: 44, height: 44, border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, display: 'grid', placeItems: 'center' }}>
          <span aria-hidden style={{
            width: 26, height: 26, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 15, lineHeight: 1,
            background: qty > 0 ? 'var(--accent)' : 'transparent', color: qty > 0 ? 'var(--on-accent)' : 'var(--ink-soft)',
          }}>{qty > 0 ? '−' : '+'}</span>
        </button>

        <div style={{ display: 'grid', placeItems: 'center', padding: '18px 10px 6px' }}>
          <ProductShot image={p.image} imageAlt={p.imageAlt} category={p.category} size={168} bare />
        </div>
      </div>

      <div style={{ textAlign: 'center', padding: '0 6px' }}>
        <div className="muted" style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.09em', textTransform: 'uppercase' }}>{p.brand}</div>
        <div style={{ marginTop: 3 }}>
          {/* NO WAY OUT OF THE SHOP. The last outbound link in the hub — the
              tile's name opened the retailer's own page in a new tab. The
              routine's equivalent went at the owner's word and this is the
              same argument one page over: a market that sends you to
              plumgoodness.com is a market showing you the door on the way to
              its own checkout. `productUrl` stays on the wire; the shelf spec
              requires it and it is what the order is fulfilled against. */}
          <span style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.35 }}>{p.name}</span>
        </div>
        <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>₹{p.priceInr.toLocaleString('en-IN')}</div>

        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', justifyContent: 'center', marginTop: 7, minHeight: 20 }}>
          {/* THE ONE FLAG THAT IS NOT ABOUT SELLING. Somebody browsing the shop
              needs to know they have already been told to use this — otherwise
              the market and the routine are two lists of products that do not
              acknowledge each other, and you buy your own cleanser twice. */}
          {inRoutine.length > 0 && (
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--accent-ink)', background: 'var(--accent-soft)', border: '1px solid var(--accent-line)', borderRadius: 999, padding: '3px 9px' }}>
              ✓ Routine · {inRoutine.map((b) => BAND_WORD[b] ?? b).join(' & ')}
            </span>
          )}
          {p.matched && inRoutine.length === 0 && (
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--muted)', border: '1px solid var(--line)', borderRadius: 999, padding: '3px 9px' }}>
              {p.matchScore}% match
            </span>
          )}
          {p.tier && (
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: TIER_TONE[p.tier] ?? 'var(--muted)' }}>{p.tier}</span>
          )}
        </div>

        <button type="button" onClick={() => setOpen(!open)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, fontWeight: 700, color: 'var(--accent-ink)', padding: '8px 4px 0' }}>
          {open ? '▴ Less' : '▾ Details'}
        </button>
      </div>

      {open && (
        <div style={{ textAlign: 'left', marginTop: 6, padding: '10px 12px', background: 'var(--paper)', borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 7 }}>
          <p style={{ fontSize: 12, lineHeight: 1.55, margin: 0, color: 'var(--ink-soft)' }}>{p.blurb}</p>
          <div className="muted" style={{ fontSize: 11 }}>
            <strong style={{ color: 'var(--ink-soft)' }}>{p.actives.slice(0, 3).join(' · ')}</strong>
            {' '}· {p.usage.toLowerCase()}{!p.suitableSkin.includes('all') ? ` · for ${p.suitableSkin.join('/')} skin` : ''}
          </div>
          {p.primaryReasons.length > 0 && (
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {p.primaryReasons.map((r) => (
                <span key={r} style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent-ink)', background: 'var(--accent-soft)', borderRadius: 999, padding: '3px 9px' }}>{r}</span>
              ))}
            </div>
          )}
          {p.biomarkerReasons.length > 0 && (
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {p.biomarkerReasons.map((r) => (
                <span key={r} style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', border: '1px solid var(--line)', borderRadius: 999, padding: '2px 8px' }}>🩸 {r}</span>
              ))}
            </div>
          )}
          <p style={{ fontSize: 11.5, lineHeight: 1.55, margin: 0, color: 'var(--muted)' }}>{p.explanation}</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Button variant="line" size="sm" onClick={onAdd}>{qty > 0 ? `In bag · ${qty}` : 'Add to bag'}</Button>
            <span style={{ marginLeft: 'auto' }}>
              <ShareToChat label="" item={{
                kind: 'product', hub: 'Beauty', title: p.name, subtitle: `${p.category} · ${p.keyIngredient}`,
                priceInr: p.priceInr, deepLink: '/beauty/market', meta: p.matched ? [`${p.matchScore}% match`] : [],
              }} />
            </span>
          </div>
        </div>
      )}
    </article>
  );
}

export function Market() {
  const products = useBeautyProducts();
  const routine = useBeautyRoutine();
  // THE SAME BAG THE ROUTINE USES. This page kept its own React state, so the
  // hub had two bags with two totals and two checkout buttons, and a link
  // emptied whichever one you were not looking at.
  const bagged = useBagActions();
  const [seg, setSeg] = useState<Segment>('Skincare');
  const [cat, setCat] = useState('');
  const [sort, setSort] = useState<Sort>('match');
  const [q, setQ] = useState('');

  const all = useMemo(() => products.data?.products ?? [], [products.data]);

  /** productId → the bands it already appears in. Read from the routine the
   *  citizen has already been given, not re-derived here; two answers to
   *  "is this in my routine" is one answer too many. */
  const routineBands = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const r of routine.data?.routines ?? []) {
      for (const s of r.steps) m.set(s.productId, [...(m.get(s.productId) ?? []), r.timeOfDay]);
    }
    return m;
  }, [routine.data]);

  const inSegment = useMemo(() => all.filter((p) => p.group === seg), [all, seg]);

  /** The categories this segment actually has, in shelf order — so the strip
   *  never offers a filter that would empty the page. */
  const categories = useMemo(() => {
    const seen = new Map<string, number>();
    for (const p of inSegment) seen.set(p.category, (seen.get(p.category) ?? 0) + 1);
    return [...seen];
  }, [inSegment]);

  const sorter = useMemo(() => ({
    match: (a: RecommendedProduct, b: RecommendedProduct) => b.matchScore - a.matchScore || a.priceInr - b.priceInr,
    low: (a: RecommendedProduct, b: RecommendedProduct) => a.priceInr - b.priceInr,
    high: (a: RecommendedProduct, b: RecommendedProduct) => b.priceInr - a.priceInr,
    name: (a: RecommendedProduct, b: RecommendedProduct) => a.name.localeCompare(b.name),
  }[sort]), [sort]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return inSegment
      .filter((p) => !cat || p.category === cat)
      .filter((p) => !needle || `${p.name} ${p.brand} ${p.actives.join(' ')} ${p.keyIngredient}`.toLowerCase().includes(needle))
      .slice()
      .sort(sorter);
  }, [inSegment, cat, q, sorter]);

  /** With nothing chosen the grid runs as labelled sections; with a category
   *  chosen, or a search typed, it is one run — a heading over a search result
   *  saying "Serum" is furniture. */
  const sections = useMemo(() => {
    if (cat || q.trim()) return [{ title: '', rows: shown }];
    return categories
      .map(([c]) => ({ title: c, rows: shown.filter((p) => p.category === c) }))
      .filter((s) => s.rows.length > 0);
  }, [cat, q, shown, categories]);

  if (products.isLoading) return <Spinner label="Curating your shelf…" />;
  if (products.isError || !products.data) return <EmptyState title="Couldn't load the market" hint="Please check your connection and try again." />;

  const countIn = (k: Segment) => all.filter((p) => p.group === k).length;
  const heading = cat || (q.trim() ? `“${q.trim()}”` : `All ${SEGMENTS.find((s) => s.key === seg)!.label.toLowerCase()}`);

  return (
    /* THE SHEET IS WHAT MAKES THIS PAGE PART OF THE HUB. Profile and Routine
       read as beige because their plates and sheets cover the page; this one
       had nothing, so a grid of white product tiles sat straight on the black
       wall and the whole shop read as a different application. The owner's
       call was explicit: the wall stays, and every page gets a sheet so the
       black shows only at the edges.

       NOT on `.page` globally — that makes one undifferentiated cream slab and
       the plates lose the edge that makes them read as plates. */
    <div className="beauty-sheet">
      <div className="eyebrow">Beauty Market · Shop</div>

      {/* ── the category row, across the top, as in the reference ───────── */}
      <nav className="market-tabs" aria-label="Shop by">
        {SEGMENTS.map(({ key, label }) => (
          <button key={key} type="button" onClick={() => { setSeg(key); setCat(''); }}
            aria-current={seg === key ? 'true' : undefined}
            className={seg === key ? 'on' : undefined}>
            {label} <span style={{ opacity: .55, fontWeight: 500 }}>{countIn(key)}</span>
          </button>
        ))}
      </nav>

      <AllergyNote notice={products.data.allergyNotice} manageTo="/beauty/profile" />

      {/* ── filter · title · sort ───────────────────────────────────────── */}
      <div className="market-bar">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 0 }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search the shelf"
            placeholder="Search name, brand or ingredient"
            style={{ width: '100%', maxWidth: 260, border: '1px solid var(--line)', borderRadius: 999, padding: '8px 14px', fontSize: 12.5, fontFamily: 'inherit', background: 'var(--paper)', color: 'var(--ink)', outline: 'none' }} />
        </div>

        <h1 style={{ fontSize: 19, margin: 0, textAlign: 'center', fontWeight: 600 }}>{heading}</h1>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, alignItems: 'center' }}>
          <label className="muted" style={{ fontSize: 11.5 }} htmlFor="market-sort">Sort by</label>
          <select id="market-sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)}
            style={{ border: '1px solid var(--line)', borderRadius: 999, padding: '7px 12px', fontSize: 12.5, fontFamily: 'inherit', background: 'var(--paper)', color: 'var(--ink)', outline: 'none' }}>
            {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '0 0 20px' }}>
        {[['', `Everything ${inSegment.length}`] as [string, string],
          ...categories.map(([c, n]) => [c, `${c} ${n}`] as [string, string])].map(([value, label]) => (
          <button key={value || 'all'} type="button" onClick={() => setCat(value)}
            style={{ cursor: 'pointer', borderRadius: 999, padding: '6px 13px', fontSize: 12, fontFamily: 'inherit', fontWeight: 600,
              border: `1.5px solid ${cat === value ? 'var(--accent)' : 'var(--line)'}`,
              background: cat === value ? 'var(--accent)' : 'transparent',
              color: cat === value ? 'var(--on-accent)' : 'var(--ink-soft)' }}>
            {label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <EmptyState
          icon="🧴"
          title="Nothing here"
          hint={q.trim()
            ? `Nothing on this shelf matches “${q.trim()}”. Try a brand, or an ingredient like niacinamide.`
            : products.data.allergyNotice
              ? 'Everything in this part of the shelf has an ingredient you told us to avoid.'
              : 'Nothing in this part of the shelf yet.'}
        />
      ) : (
        sections.map((s) => (
          <section key={s.title || 'all'} style={{ marginBottom: 26 }}>
            {s.title && (
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, borderBottom: '1px solid var(--line)', paddingBottom: 7, marginBottom: 16 }}>
                <h2 style={{ fontSize: 12, margin: 0, textTransform: 'uppercase', letterSpacing: '.11em' }}>{s.title}</h2>
                <span className="muted" style={{ fontSize: 11.5 }}>{s.rows.length}</span>
              </div>
            )}
            <div className="market-grid">
              {s.rows.map((p) => (
                <Tile key={p.id} p={p} inRoutine={routineBands.get(p.id) ?? []}
                  qty={bagged.qtyOf(p.id)} onAdd={() => bagged.add(p.id)} onRemove={() => bagged.remove(p.id)} />
              ))}
            </div>
          </section>
        ))
      )}

      <BeautyBagBar />
    </div>
  );
}
