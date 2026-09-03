import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AllergyNote, EmptyState, Spinner } from '@/components/ui';
import { useBagActions, useBeautyProducts, useBeautyRoutine, type RecommendedProduct } from '../api';
import { BeautyBagBar } from '../components/BeautyBagBar';
import { ShareToChat } from '@/features/chat/share';
import { ProductShot } from '../components/ProductShot';
import { IngredientChips, IngredientList } from '../components/Ingredients';

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

/** Where in the routine a product already appears, in the reader's words. */
const BAND_WORD: Record<string, string> = { morning: 'morning', evening: 'evening', weekly: 'wash day', body: 'body care' };

function Tile(
  { p, inRoutine, qty, onAdd, onRemove }:
  { p: RecommendedProduct; inRoutine: string[]; qty: number; onAdd: () => void; onRemove: () => void },
) {
  const [open, setOpen] = useState(false);
  return (
    /*
      THE SAME CARD AS THE E-COMMERCE SHELF (owner, 24 Aug: "match the beauty
      market shop design with the e-commerce beauty page"). One card anatomy,
      one set of classes — the `.st-*` block the store shell already wears —
      so the same product looks like the same product on both floors: framed
      square shot with the one chip that matters on it, uppercase role,
      left-aligned name, brand, price, one quiet why-line, and the black
      Add-to-bag that becomes a stepper. What this page knows that the store
      does not — match score, price tier, the full dossier — stays: score and
      tier ride the why-line and the price, and the dossier keeps its Details
      drawer below.
    */
    <article className="st-card">
      <div className="st-shot">
        {inRoutine.length > 0 ? (
          <span className="st-tier">✓ Routine · {inRoutine.map((b) => BAND_WORD[b] ?? b).join(' & ')}</span>
        ) : p.matched ? (
          <span className="st-tier">Matched to you</span>
        ) : null}
        <ProductShot image={p.image} imageAlt={p.imageAlt} category={p.category} fill />
      </div>
      <div className="st-role">{p.category}</div>
      <h2 className="st-name">{p.name}</h2>
      <div className="st-brand">{p.brand}</div>
      <div className="st-price">
        ₹{p.priceInr.toLocaleString('en-IN')}
        {p.tier && <span className="st-keep"> · {p.tier}</span>}
      </div>
      <IngredientChips ingredients={p.ingredients} />
      {p.matched && <p className="st-why">{p.matchScore}% match</p>}

      <button type="button" className="st-details" onClick={() => setOpen(!open)}
        aria-expanded={open}>
        {open ? '▴ Less' : '▾ Details'}
      </button>

      {open && (
        <div className="st-dossier">
          <p className="st-dossier-blurb">{p.blurb}</p>
          <div className="muted st-dossier-meta">
            <strong>{p.actives.slice(0, 3).join(' · ')}</strong>
            {' '}· {p.usage.toLowerCase()}{!p.suitableSkin.includes('all') ? ` · for ${p.suitableSkin.join('/')} skin` : ''}
          </div>
          {/* The same list the routine card folds, inside the tile's one
              Details panel — a tile is compared, not read, and a second
              disclosure on it would be a second thing to open before the
              first has said anything. */}
          <div>
            <div className="ingredient-head">Ingredients</div>
            <IngredientList ingredients={p.ingredients} source={p.ingredientsSource} />
          </div>
          {p.primaryReasons.length > 0 && (
            <div className="st-dossier-chips">
              {p.primaryReasons.map((r) => <span key={r} className="st-dossier-chip is-reason">{r}</span>)}
            </div>
          )}
          {p.biomarkerReasons.length > 0 && (
            <div className="st-dossier-chips">
              {p.biomarkerReasons.map((r) => <span key={r} className="st-dossier-chip">🩸 {r}</span>)}
            </div>
          )}
          <p className="muted st-dossier-why">{p.explanation}</p>
          <div className="st-dossier-share">
            <span>
              <ShareToChat label="" item={{
                kind: 'product', hub: 'Beauty', title: p.name, subtitle: `${p.category} · ${p.keyIngredient}`,
                priceInr: p.priceInr, deepLink: '/beauty/market', meta: p.matched ? [`${p.matchScore}% match`] : [],
              }} />
            </span>
          </div>
        </div>
      )}

      {qty > 0 ? (
        <div className="st-qty">
          <button type="button" onClick={onRemove} aria-label={`One fewer ${p.name}`}>–</button>
          <span>{qty} in bag</span>
          <button type="button" onClick={onAdd} aria-label={`One more ${p.name}`}>+</button>
        </div>
      ) : (
        <button type="button" className="st-add" onClick={onAdd}>Add to bag</button>
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

  const segLabel = SEGMENTS.find((s) => s.key === seg)!.label;

  return (
    /* THE SHEET IS WHAT MAKES THIS PAGE PART OF THE HUB: the wall stays, and
       every page gets a sheet so the black shows only at the edges.

       A COLLECTION PAGE (owner, 3 Sep: "like a Shopify site"). Breadcrumb on
       top; the filters — shop by, category, sort, search — in a rail on the
       left; the title, the count and the grid on the right. On a phone the
       rail folds above the grid as one row of chips. Nothing the page knew
       moved: the same segments, the same categories in shelf order, the same
       four sorts, the same search over name, brand and ingredient. */
    <div className="beauty-sheet is-shop">
      <nav className="mk-crumb" aria-label="Breadcrumb">
        <Link to="/beauty">Beauty</Link>
        <span aria-hidden>/</span>
        <span>Market</span>
        <span aria-hidden>/</span>
        <span aria-current="page">{cat || segLabel}</span>
      </nav>

      <div className="mk-layout">
        <aside className="mk-aside" aria-label="Filter the shelf">
          <div className="mk-group">
            <div className="st-role">Shop by</div>
            {SEGMENTS.map(({ key, label }) => (
              <button key={key} type="button" className={`mk-opt${seg === key ? ' is-on' : ''}`}
                onClick={() => { setSeg(key); setCat(''); }} aria-current={seg === key ? 'true' : undefined}>
                <span>{label}</span><span className="muted">{countIn(key)}</span>
              </button>
            ))}
          </div>

          {/* The categories this segment actually has, in shelf order — so
              the rail never offers a filter that would empty the page. */}
          <div className="mk-group">
            <div className="st-role">Category</div>
            {[['', 'Everything', inSegment.length] as [string, string, number],
              ...categories.map(([c, n]) => [c, c, n] as [string, string, number])].map(([value, label, n]) => (
              <button key={value || 'all'} type="button" className={`mk-opt${cat === value ? ' is-on' : ''}`}
                onClick={() => setCat(value)} aria-current={cat === value ? 'true' : undefined}>
                <span>{label}</span><span className="muted">{n}</span>
              </button>
            ))}
          </div>

          <div className="mk-group">
            <label className="st-role" htmlFor="market-sort">Sort by</label>
            <select id="market-sort" className="mk-select" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>

          <div className="mk-group">
            <label className="st-role" htmlFor="market-q">Search</label>
            <input id="market-q" className="mk-input" value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Name, brand or ingredient" />
          </div>
        </aside>

        <div className="mk-main">
          <AllergyNote notice={products.data.allergyNotice} manageTo="/beauty/profile" />
          {/* A shorter shelf is only ever OUR RULE or OUR RANGE, and from the
              outside those look identical. A condition that held products
              back says so. */}
          {products.data.conditionNotice && (
            <p className="muted mk-notice">{products.data.conditionNotice.sentence}</p>
          )}

          <div className="mk-head">
            <h1 className="mk-title">{heading}</h1>
            <span className="muted mk-count">{shown.length} product{shown.length === 1 ? '' : 's'}</span>
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
              <section key={s.title || 'all'} className="mk-section">
                {s.title && (
                  <div className="mk-section-head">
                    <h2 className="mk-section-title">{s.title}</h2>
                    <span className="muted mk-count">{s.rows.length}</span>
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
        </div>
      </div>

      <BeautyBagBar />
    </div>
  );
}
