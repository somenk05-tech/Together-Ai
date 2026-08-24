import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Spinner } from '@/components/ui';
import { useForgetAddress, useMasterProfile, useSavedAddresses } from '@/features/profile/hooks';
import {
  currentPosition, rupees,
  useAskAboutMenu, useMenu, usePlaceOrder, useQuoteOrder, useRecommend,
  type MenuItem, type OrderPick, type OrderQuote, type RecommendResult,
} from './api';

/**
 * THE MENU PAPER — order and pay, on the business page, in the one design
 * every kitchen in the city wears (owner, 24 Aug; menu-paper.css has the
 * argument). The Together City script mark sits over the restaurant's own
 * name, sections are ruled in gold, and the cart is the cream band at the
 * foot — a menu is recognisably a Together City menu wherever you are.
 *
 * Food businesses only; everyone else keeps the ask-to-book flow (MenuView),
 * because "order a haircut × 2" is the app not knowing what a salon does.
 *
 * The honesty rules, all enforced again by the server:
 *  · a SOLD OUT line stays on the page and says so — a dish that vanishes
 *    reads as a menu that shrank;
 *  · an UNPRICED line ("Ask") starts a conversation, never a checkout;
 *  · the number on the button is the server's quote, charged only while it
 *    is still true (`expectInr`);
 *  · payment is the city wallet, at submit — "accepted" never means "now
 *    chase the money", and a rejection is an automatic refund;
 *  · the share-details sentence prints BEFORE the button, and a pickup order
 *    shares no address at all.
 */

interface CartLine { key: string; itemId: string; qty: number; variant?: string; addons: string[] }

const keyOf = (itemId: string, variant?: string, addons: string[] = []) =>
  `${itemId}|${variant ?? ''}|${[...addons].sort().join('+')}`;

const failText = (e: unknown, fallback: string) =>
  (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;

function VegMark({ veg }: { veg: string | null }) {
  if (!veg) return null;
  return (
    <span className={`mpaper-veg${veg === 'nonveg' ? ' is-nonveg' : veg === 'egg' ? ' is-egg' : ''}`}
      aria-label={veg === 'veg' ? 'vegetarian' : veg === 'egg' ? 'contains egg' : 'non-vegetarian'}>
      <i />
    </span>
  );
}

function unitPrice(item: MenuItem, variant?: string, addons: string[] = []): number | null {
  const base = variant ? item.variants.find((v) => v.name === variant)?.priceInr ?? null : item.priceInr;
  if (base == null) return null;
  return base + addons.reduce((s, name) => s + (item.addons.find((a) => a.name === name)?.priceInr ?? 0), 0);
}

export function OrderMenu({ listingId, businessName, logoUrl, onSent }: {
  listingId: string;
  businessName: string;
  /** The first photograph the owner uploaded, worn as the kitchen's mark. */
  logoUrl?: string | null;
  onSent?: (threadId: string) => void;
}) {
  const q = useMenu(listingId);
  const ask = useAskAboutMenu(listingId);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customising, setCustomising] = useState<string | null>(null);
  const [checkout, setCheckout] = useState(false);

  const items = useMemo(() => new Map((q.data?.sections ?? []).flatMap((s) => s.items).map((i) => [i.id, i])), [q.data]);

  if (q.isLoading) return <Spinner label="Loading…" />;
  if (q.isError) {
    return <p className="muted mpaper-small" role="alert">The menu could not be loaded just now.</p>;
  }
  if (!q.data || q.data.count === 0) return null;

  const qtyOf = (key: string) => cart.find((l) => l.key === key)?.qty ?? 0;
  const add = (item: MenuItem, variant?: string, addons: string[] = []) => {
    const key = keyOf(item.id, variant, addons);
    setCart((c) => {
      const hit = c.find((l) => l.key === key);
      if (hit) return c.map((l) => (l.key === key ? { ...l, qty: Math.min(20, l.qty + 1) } : l));
      return [...c, { key, itemId: item.id, qty: 1, variant, addons }];
    });
    setCheckout(false);
  };
  const less = (key: string) => {
    setCart((c) => c.flatMap((l) => (l.key !== key ? [l] : l.qty > 1 ? [{ ...l, qty: l.qty - 1 }] : [])));
    setCheckout(false);
  };

  const picks: OrderPick[] = cart.map((l) => ({
    itemId: l.itemId, qty: l.qty,
    ...(l.variant ? { variant: l.variant } : {}),
    ...(l.addons.length ? { addons: l.addons } : {}),
  }));
  const count = cart.reduce((s, l) => s + l.qty, 0);
  // The band's number is an estimate off the same rows the page renders; the
  // number on the PLACE button is the server's quote, and only it is charged.
  const roughTotal = cart.reduce((s, l) => s + l.qty * (unitPrice(items.get(l.itemId) as MenuItem, l.variant, l.addons) ?? 0), 0);
  const hasVeg = [...items.values()].some((i) => i.veg === 'veg');
  const hasNonveg = [...items.values()].some((i) => i.veg === 'nonveg');

  return (
    <div className="mpaper">
      {/* ── the masthead: the city's mark, the kitchen's name ─────────────── */}
      <div className="mpaper-mast">
        <img className="mpaper-tc" src="/menu/tc-script.webp" alt="Together City" />
        <div className="mpaper-titleline mp-center">
          {logoUrl && <img className="mpaper-restlogo" src={logoUrl} alt="" />}
          <span className="mpaper-restaurant">{businessName}</span>
        </div>
        <span className="mpaper-tag">Explore · Choose · Enjoy</span>
        <span className="mpaper-meta">
          {q.data.count} {q.data.count === 1 ? 'item' : 'items'} · paid from your wallet
          {q.data.scanUrl && <>{' · '}<a href={q.data.scanUrl} target="_blank" rel="noreferrer">the original</a></>}
        </span>
      </div>

      <Waiter listingId={listingId} onAdd={(r) => {
        setCart((c) => {
          let next = c;
          for (const p of r.picks) {
            const key = keyOf(p.itemId);
            const hit = next.find((l) => l.key === key);
            next = hit
              ? next.map((l) => (l.key === key ? { ...l, qty: Math.min(20, l.qty + p.qty) } : l))
              : [...next, { key, itemId: p.itemId, qty: p.qty, addons: [] }];
          }
          return next;
        });
        setCheckout(false);
      }} />

      {q.data.sections.map((sec) => (
        <div key={sec.section ?? '_'}>
          {sec.section && <div className="mpaper-sec">{sec.section}</div>}
          {sec.items.map((item) => {
            const plainKey = keyOf(item.id);
            const orderable = item.available && item.priceInr != null;
            const hasOptions = item.variants.length > 0 || item.addons.length > 0;
            const inCart = cart.filter((l) => l.itemId === item.id).reduce((s, l) => s + l.qty, 0);
            return (
              <div key={item.id}>
                <div className={`mpaper-row${item.available ? '' : ' is-out'}`}>
                  {item.photoUrl && <img className="mpaper-photo" src={item.photoUrl} alt="" loading="lazy" />}
                  <span className="mpaper-main">
                    <span className="mpaper-titleline">
                      <VegMark veg={item.veg} />
                      <span className="mpaper-iname">{item.name}</span>
                      {item.spice != null && item.spice > 0 && (
                        <span className="mpaper-spice" aria-label={`spice level ${item.spice} of 3`}>
                          {'🌶'.repeat(Math.min(3, item.spice))}
                        </span>
                      )}
                      {!item.available && <span className="mpaper-out">Sold out</span>}
                    </span>
                    {item.description && <span className="mpaper-desc">{item.description}</span>}
                    {item.prepMinutes != null && item.available && <span className="mpaper-mins">~{item.prepMinutes} min</span>}
                  </span>
                  <span className="mpaper-price">
                    {item.priceInr != null
                      ? rupees(item.variants.length ? Math.min(item.priceInr, ...item.variants.map((v) => v.priceInr)) : item.priceInr)
                      : 'Ask'}
                  </span>

                  {/* The verb, per line. Priced and present → the gold stepper.
                      Unpriced → the conversation. Sold out → nothing at all,
                      because a control on a dish that cannot come is a lie. */}
                  {orderable && !hasOptions && (
                    qtyOf(plainKey) === 0 ? (
                      <button type="button" className="mpaper-btn" onClick={() => add(item)}>Add</button>
                    ) : (
                      <span className="mpaper-step">
                        <button type="button" className="mpaper-stepbtn" aria-label={`One less ${item.name}`} onClick={() => less(plainKey)}>−</button>
                        <span className="mpaper-count">{qtyOf(plainKey)}</span>
                        <button type="button" className="mpaper-stepbtn" aria-label={`One more ${item.name}`} onClick={() => add(item)}>+</button>
                      </span>
                    )
                  )}
                  {orderable && hasOptions && (
                    <button type="button" className="mpaper-btn" onClick={() => setCustomising((v) => (v === item.id ? null : item.id))}>
                      {inCart > 0 ? `×${inCart} · more` : customising === item.id ? 'Close' : 'Choose'}
                    </button>
                  )}
                  {!orderable && item.available && item.priceInr == null && (
                    <button type="button" className="mpaper-btn" disabled={ask.isPending}
                      onClick={() => ask.mutate({ itemIds: [item.id] }, { onSuccess: (r) => onSent?.(r.threadId) })}>
                      Ask
                    </button>
                  )}
                </div>

                {customising === item.id && orderable && (
                  <Customiser item={item} onAdd={(variant, addons) => { add(item, variant, addons); setCustomising(null); }} />
                )}
              </div>
            );
          })}
        </div>
      ))}

      {(hasVeg || hasNonveg) && (
        <div className="mpaper-legend">
          {hasVeg && <span><VegMark veg="veg" /> Vegetarian</span>}
          {hasNonveg && <span><VegMark veg="nonveg" /> Non-vegetarian</span>}
        </div>
      )}

      {!checkout && (
        <div className="mpaper-cart">
          <span className="mpaper-cartlabel">
            Your order
            <span className="mpaper-cartsub">{count === 0 ? 'nothing yet' : `${count} ${count === 1 ? 'item' : 'items'}`}</span>
          </span>
          <span className="mpaper-cartdivide" aria-hidden />
          <span className="mpaper-cartlabel">
            Items
            <span className="mpaper-carttotal">{rupees(roughTotal)}</span>
            <span className="mpaper-cartsub">+ ₹20 platform · ₹50 delivery</span>
          </span>
          <span className="mpaper-flex mp-auto">
            {count > 0 && <button type="button" className="mpaper-quiet" onClick={() => setCart([])}>Clear</button>}
            <button type="button" className="mpaper-goldpill" disabled={count === 0} onClick={() => setCheckout(true)}>
              Review & place
            </button>
          </span>
        </div>
      )}

      {checkout && cart.length > 0 && (
        <Checkout listingId={listingId} picks={picks}
          onBack={() => setCheckout(false)}
          onPlaced={(threadId) => { setCart([]); setCheckout(false); onSent?.(threadId); }} />
      )}
    </div>
  );
}

/** Sizes and extras for one dish — each combination is its own cart line. */
function Customiser({ item, onAdd }: { item: MenuItem; onAdd: (variant: string | undefined, addons: string[]) => void }) {
  const [variant, setVariant] = useState<string | undefined>(item.variants[0]?.name);
  const [addons, setAddons] = useState<string[]>([]);
  const price = unitPrice(item, item.variants.length ? variant : undefined, addons);
  return (
    <div className="mpaper-sub">
      {item.variants.length > 0 && (
        <div className="mpaper-flex" role="radiogroup" aria-label={`${item.name} size`}>
          {item.variants.map((v) => (
            <button key={v.name} type="button" role="radio" aria-checked={variant === v.name}
              className={`mpaper-segbtn${variant === v.name ? ' is-on' : ''}`} onClick={() => setVariant(v.name)}>
              {v.name} · {rupees(v.priceInr)}
            </button>
          ))}
        </div>
      )}
      {item.addons.map((a) => (
        <label key={a.name} className="mpaper-choice mp-mid">
          <input type="checkbox" checked={addons.includes(a.name)}
            onChange={() => setAddons((x) => (x.includes(a.name) ? x.filter((n) => n !== a.name) : [...x, a.name]))} />
          {a.name} <span className="mpaper-small">+{rupees(a.priceInr)}</span>
        </label>
      ))}
      <div>
        <button type="button" className="mpaper-goldpill" onClick={() => onAdd(item.variants.length ? variant : undefined, addons)}>
          Add{price != null ? ` · ${rupees(price)}` : ''}
        </button>
      </div>
    </div>
  );
}

/**
 * "Vegetarian, not too spicy, ₹800 for two." The suggestions come from the
 * LIVE menu — the server shows the model only what is available and priced,
 * screens declared allergens first, and filters the answer against the same
 * set — and nothing is ordered until the citizen presses the same buttons as
 * everyone else.
 */
function Waiter({ listingId, onAdd }: { listingId: string; onAdd: (r: RecommendResult) => void }) {
  const rec = useRecommend(listingId);
  const [open, setOpen] = useState(false);
  const [brief, setBrief] = useState('');
  const [out, setOut] = useState<RecommendResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  if (!open) {
    return (
      <div className="mpaper-mast">
        <button type="button" className="mpaper-quiet" onClick={() => setOpen(true)}>
          Not sure what to get? Say what you feel like →
        </button>
      </div>
    );
  }
  return (
    <div className="mpaper-waiter">
      <div className="mpaper-flex">
        <input className="mpaper-input mp-grow"
          value={brief} onChange={(e) => setBrief(e.target.value)} maxLength={500}
          aria-label="What you feel like eating" placeholder="e.g. vegetarian, not too spicy, ₹800 for two"
          onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }} />
        <button type="button" className="mpaper-btn" disabled={rec.isPending || brief.trim().length < 3}
          onClick={() => { setErr(null); setOut(null); rec.mutate(brief.trim(), { onSuccess: setOut, onError: (e) => setErr(failText(e, 'Could not fetch a suggestion just now.')) }); }}>
          {rec.isPending ? 'Thinking…' : 'Suggest'}
        </button>
        <button type="button" className="mpaper-quiet" onClick={() => { setOpen(false); setOut(null); setErr(null); }}>Close</button>
      </div>
      {err && <p className="mpaper-alert" role="alert">{err}</p>}
      {out && (
        <div className="mpaper-grid">
          {out.why && <p className="mpaper-quote mp-m0">{out.why}</p>}
          <div className="mpaper-quote">
            {out.picks.map((p) => (
              <div key={p.itemId} className="mpaper-quoteline">
                <span>{p.name} × {p.qty}</span><span>{rupees(p.lineTotalInr)}</span>
              </div>
            ))}
            <div className="mpaper-quotetotal"><span>Together</span><span>{rupees(out.totalInr)}</span></div>
          </div>
          {(out.screened ?? []).map((s) => <p key={s} className="mpaper-small">{s}</p>)}
          <p className="mpaper-small">{out.caveat}</p>
          <div>
            <button type="button" className="mpaper-goldpill" onClick={() => onAdd(out)}>Add these to my order</button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * THE CHECKOUT — where the promise is made, so where everything is said.
 *
 * The quote is the server's: the button charges `expectInr` and the charge is
 * refused if the kitchen repriced anything while this panel was open. The
 * share-details sentence prints above the button, the address block appears
 * only for delivery, "save this as my address" is a tick and never a default,
 * and a delivery order will not go without the browser's own location — the
 * pin is how the kitchen checks the address is findable.
 */
function Checkout({ listingId, picks, onBack, onPlaced }: {
  listingId: string;
  picks: OrderPick[];
  onBack: () => void;
  onPlaced: (threadId: string) => void;
}) {
  const profile = useMasterProfile();
  const quoteM = useQuoteOrder(listingId);
  const place = usePlaceOrder(listingId);

  const [quote, setQuote] = useState<OrderQuote | null>(null);
  const [quoteErr, setQuoteErr] = useState<string | null>(null);
  const [fulfilment, setFulfilment] = useState<'delivery' | 'pickup'>('delivery');
  const [phone, setPhone] = useState('');
  const [phoneTouched, setPhoneTouched] = useState(false);
  /* THE ADDRESS BOOK (owner, 24 Aug) — home, office, other, each its own
     radio, exactly the way the city's other delivery apps taught everybody.
     The legacy single profile line still answers as "home" when the book is
     empty, so nobody's one saved address vanished. */
  const bookQ = useSavedAddresses();
  const forget = useForgetAddress();
  const book = bookQ.data?.addresses ?? [];
  const [pickedLabel, setPickedLabel] = useState<string | null>(null);
  const addressMode: string = pickedLabel ?? (book[0]?.label ?? 'new');
  const chosenEntry = book.find((b) => b.label === addressMode) ?? null;
  /* THE ADDRESS, ASKED THE WAY A DELIVERY NEEDS IT (owner, 24 Aug) — flat and
     building and street as their own boxes, not one field a hungry person
     under-fills. It travels to the kitchen COMPOSED into one line, so the
     server, the order card and the saved profile address all keep their one
     shape and nothing on the wire changed. */
  const [addr, setAddr] = useState({ flat: '', building: '', street: '', area: '', city: profile.data?.city?.trim() ?? '', pin: '', landmark: '' });
  const [saveAddress, setSaveAddress] = useState(false);
  const [saveLabel, setSaveLabel] = useState<'home' | 'work' | 'other'>('home');
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const [pinErr, setPinErr] = useState<string | null>(null);
  const [pinBusy, setPinBusy] = useState(false);
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  // Minted once per open checkout: a double press or a flaky connection
  // retries the SAME order instead of placing a second one.
  const [idemKey] = useState(() => crypto.randomUUID());

  // One quote per cart shape AND per fulfilment — the delivery fee is part of
  // the number, so flipping to pickup reprices honestly instead of pretending.
  const cartShape = JSON.stringify(picks);
  useEffect(() => {
    quoteM.mutate({ items: JSON.parse(cartShape) as OrderPick[], fulfilment }, {
      onSuccess: (r) => { setQuote(r); setQuoteErr(null); },
      onError: (e) => { setQuote(null); setQuoteErr(failText(e, 'Could not price this order just now.')); },
    });
    // quoteM is a fresh mutation object every render; the cart shape and the
    // fulfilment are the real dependencies and the only ones.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartShape, fulfilment]);

  const phoneValue = phoneTouched ? phone : (phone || profile.data?.phone || '');
  const composed = [
    [addr.flat.trim(), addr.building.trim()].filter(Boolean).join(', '),
    addr.street.trim(),
    addr.area.trim(),
    [addr.city.trim(), addr.pin.trim()].filter(Boolean).join(' '),
    addr.landmark.trim() ? `Landmark: ${addr.landmark.trim()}` : '',
  ].filter(Boolean).join(', ').slice(0, 400);
  const addrComplete = !!addr.flat.trim() && !!addr.area.trim() && !!addr.city.trim() && /^\d{6}$/.test(addr.pin.trim());
  const address = fulfilment === 'delivery' ? (chosenEntry ? chosenEntry.addressText : composed) : '';

  const locate = () => {
    setPinErr(null); setPinBusy(true);
    currentPosition()
      .then((p) => { setPin({ lat: p.lat, lng: p.lng }); setPinBusy(false); })
      .catch((e: Error) => {
        setPinBusy(false);
        setPinErr(e.message.replace(/ — you can type the coordinates instead\.?/, ' — delivery needs it, so check the browser’s location permission and try again.'));
      });
  };

  const ready = !!quote
    && phoneValue.trim().length >= 6
    && (fulfilment === 'pickup'
      || ((chosenEntry ? address.length >= 10 : addrComplete) && !!pin));

  const submit = () => {
    if (!quote) return;
    setErr(null);
    place.mutate({
      idempotencyKey: idemKey,
      input: {
        items: picks,
        fulfilment,
        expectInr: quote.totalInr,
        phone: phoneValue.trim(),
        ...(note.trim() ? { note: note.trim() } : {}),
        ...(fulfilment === 'delivery' ? {
          address,
          saveAddress: !chosenEntry && saveAddress,
          ...(!chosenEntry && saveAddress ? { saveLabel } : {}),
          lat: pin?.lat, lng: pin?.lng,
        } : {}),
      },
    }, {
      onSuccess: (r) => onPlaced(r.threadId),
      onError: (e) => setErr(failText(e, 'The order could not be placed. Nothing has been taken.')),
    });
  };

  return (
    <div className="mpaper-panel">
      <div className="mpaper-flex">
        <span className="mpaper-cartlabel">Your order</span>
        <button type="button" className="mpaper-quiet mp-auto" onClick={onBack}>← Back to the menu</button>
      </div>

      {/* The lines, priced by the server. */}
      {quoteErr && <p className="mpaper-alert" role="alert">{quoteErr}</p>}
      {!quote && !quoteErr && <Spinner label="Pricing…" />}
      {quote && (
        <div className="mpaper-quote">
          {quote.lines.map((l, i) => (
            <div key={i} className="mpaper-quoteline">
              <span>
                {l.name}{l.variant ? ` (${l.variant})` : ''} × {l.qty}
                {(l.addons ?? []).length > 0 && <span className="mpaper-small"> — {(l.addons ?? []).map((a) => a.name).join(', ')}</span>}
              </span>
              <span className="mp-amt">{rupees(l.lineTotalInr)}</span>
            </div>
          ))}
          {/* The two flat fees, named — the same rows the server put in the
              quote, never a total that quietly grew. */}
          <div className="mpaper-quoteline mp-mt">
            <span>Items</span><span className="mp-amt">{rupees(quote.subtotalInr)}</span>
          </div>
          {quote.deliveryFeeInr > 0 && (
            <div className="mpaper-quoteline">
              <span>Delivery fee <span className="mpaper-small">(flat)</span></span>
              <span className="mp-amt">{rupees(quote.deliveryFeeInr)}</span>
            </div>
          )}
          <div className="mpaper-quoteline">
            <span>Platform fee <span className="mpaper-small">(flat)</span></span>
            <span className="mp-amt">{rupees(quote.platformFeeInr)}</span>
          </div>
          <div className="mpaper-quotetotal"><span>Total</span><span>{rupees(quote.totalInr)}</span></div>
          <p className="mpaper-small mp-mt">
            Paid from your wallet now ({rupees(quote.walletInr)} in it{quote.card ? `, card ····${quote.card.last4} for any rest` : ''}).
            If the kitchen says no, every rupee comes straight back.
          </p>
          {quote.shortfallInr > 0 && !quote.card && (
            <p className="mpaper-alert" role="alert">
              Your wallet is {rupees(quote.shortfallInr)} short and no card is linked.{' '}
              <Link to="/financial/wallet">Top up your wallet</Link> and come back — this order will wait.
            </p>
          )}
        </div>
      )}

      <div className="mpaper-seg" role="radiogroup" aria-label="Delivery or pickup">
        <button type="button" role="radio" aria-checked={fulfilment === 'delivery'}
          className={`mpaper-segbtn${fulfilment === 'delivery' ? ' is-on' : ''}`} onClick={() => setFulfilment('delivery')}>Delivery</button>
        <button type="button" role="radio" aria-checked={fulfilment === 'pickup'}
          className={`mpaper-segbtn${fulfilment === 'pickup' ? ' is-on' : ''}`} onClick={() => setFulfilment('pickup')}>Pickup</button>
      </div>

      <label className="mpaper-label">
        Phone for this order
        <input className="mpaper-input" value={phoneValue} onChange={(e) => { setPhoneTouched(true); setPhone(e.target.value); }}
          inputMode="tel" maxLength={20} placeholder="So the kitchen can reach you" />
      </label>

      {fulfilment === 'delivery' && (
        <div className="mpaper-grid">
          {book.map((b) => (
            <label key={b.label} className="mpaper-choice">
              <input type="radio" name="addr" checked={addressMode === b.label} onChange={() => setPickedLabel(b.label)} />
              <span className="mp-flex1">
                <strong>{b.label === 'home' ? '🏠 Home' : b.label === 'work' ? '💼 Office' : '📍 Other'}</strong>
                <br /><span className="mpaper-small">{b.addressText}</span>
              </span>
              <button type="button" className="mpaper-quiet" disabled={forget.isPending}
                aria-label={`Forget the ${b.label} address`}
                onClick={() => { forget.mutate(b.label); if (addressMode === b.label) setPickedLabel('new'); }}>
                forget
              </button>
            </label>
          ))}
          <label className="mpaper-choice">
            {book.length > 0 && <input type="radio" name="addr" checked={addressMode === 'new'} onChange={() => setPickedLabel('new')} />}
            <span className="mp-flex1">
              <strong>{book.length > 0 ? 'Somewhere else this time' : 'Delivery address'}</strong>
              {(addressMode === 'new' || book.length === 0) && (
                <>
                  <span className="mpaper-addr">
                    <input className="mpaper-input" value={addr.flat} maxLength={60} aria-label="Flat or house number"
                      placeholder="Flat / house no." onChange={(e) => setAddr((a) => ({ ...a, flat: e.target.value }))} />
                    <input className="mpaper-input" value={addr.building} maxLength={80} aria-label="Building or society"
                      placeholder="Building / society" onChange={(e) => setAddr((a) => ({ ...a, building: e.target.value }))} />
                    <input className="mpaper-input mp-span" value={addr.street} maxLength={80} aria-label="Street or road"
                      placeholder="Street / road" onChange={(e) => setAddr((a) => ({ ...a, street: e.target.value }))} />
                    <input className="mpaper-input" value={addr.area} maxLength={60} aria-label="Area or locality"
                      placeholder="Area / locality" onChange={(e) => setAddr((a) => ({ ...a, area: e.target.value }))} />
                    <input className="mpaper-input" value={addr.city} maxLength={60} aria-label="City"
                      placeholder="City" onChange={(e) => setAddr((a) => ({ ...a, city: e.target.value }))} />
                    <input className="mpaper-input" value={addr.pin} maxLength={6} inputMode="numeric" aria-label="PIN code"
                      placeholder="PIN code" onChange={(e) => setAddr((a) => ({ ...a, pin: e.target.value.replace(/[^\d]/g, '') }))} />
                    <input className="mpaper-input mp-span" value={addr.landmark} maxLength={80} aria-label="Landmark, optional"
                      placeholder="Landmark (optional) — gate, corner, opposite what" onChange={(e) => setAddr((a) => ({ ...a, landmark: e.target.value }))} />
                  </span>
                  {composed && <span className="mpaper-small">Goes to the kitchen as: {composed}</span>}
                  <label className="mpaper-choice mp-mid mp-plain mp-mt">
                    <input type="checkbox" checked={saveAddress} onChange={(e) => setSaveAddress(e.target.checked)} />
                    Save this address for next time, as
                  </label>
                  {saveAddress && (
                    <span className="mpaper-seg" role="radiogroup" aria-label="Save this address as">
                      {(['home', 'work', 'other'] as const).map((l) => (
                        <button key={l} type="button" role="radio" aria-checked={saveLabel === l}
                          className={`mpaper-segbtn${saveLabel === l ? ' is-on' : ''}`} onClick={() => setSaveLabel(l)}>
                          {l === 'home' ? '🏠 Home' : l === 'work' ? '💼 Office' : '📍 Other'}
                        </button>
                      ))}
                    </span>
                  )}
                </>
              )}
            </span>
          </label>

          {/* The pin. Required for delivery, and the sentence says why. */}
          <div className="mpaper-flex">
            {pin ? (
              <span className="mpaper-good">✓ Location on — the kitchen gets a pin with the address.</span>
            ) : (
              <>
                <button type="button" className="mpaper-btn" disabled={pinBusy} onClick={locate}>
                  {pinBusy ? 'Finding you…' : 'Turn on location'}
                </button>
                <span className="mpaper-small mp-half">
                  A delivery order needs your location on — the pin is how the kitchen checks the address is findable.
                </span>
              </>
            )}
          </div>
          {pinErr && <p className="mpaper-alert" role="alert">{pinErr}</p>}
        </div>
      )}

      <input className="mpaper-input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500}
        aria-label="A note to the kitchen" placeholder="A note to the kitchen? Less oil, no onion…" />

      {/* What is shared, said BEFORE the button — the anonymity promise ends
          here only because the citizen ends it, one business at a time. */}
      <p className="mpaper-small">
        {quote?.shares ?? 'Placing this order shares your name and phone — and for delivery, your address — with this business only.'}
        {' '}Your chat here stays under your customer number either way.
      </p>

      {err && <p className="mpaper-alert" role="alert">{err}</p>}
      <div className="mpaper-flex">
        <button type="button" className="mpaper-goldpill" disabled={!ready || place.isPending} onClick={submit}>
          {place.isPending ? 'Placing…' : quote ? `Place order · pay ${rupees(quote.totalInr)}` : 'Place order'}
        </button>
        <button type="button" className="mpaper-btn" onClick={onBack}>Back</button>
      </div>
      {!ready && quote && (
        <p className="mpaper-small">
          {phoneValue.trim().length < 6 ? 'A phone number is needed so the kitchen can reach you.'
            : fulfilment === 'delivery' && !chosenEntry && !addrComplete
              ? 'The kitchen needs at least the flat number, the area, the city and a 6-digit PIN.'
              : fulfilment === 'delivery' && chosenEntry && address.length < 10 ? 'That saved address is too short — write it out this time.'
                : fulfilment === 'delivery' && !pin ? 'Turn on location to place a delivery order.'
                  : ''}
        </p>
      )}
    </div>
  );
}
