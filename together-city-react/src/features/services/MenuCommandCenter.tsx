import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui';
import { mediaApi, uploadErrorMessage } from '@/api/media.api';
import {
  rupees, useBusinessOrders, useMenu, usePatchMenuItem,
  type MenuItem, type MenuOption, type PatchMenuItemInput,
} from './api';

/**
 * THE COMMAND CENTRE — the owner's counter, in two halves.
 *
 * THE BOARD is every live order, newest first, with Accept / Reject and the
 * status steps on each card. It polls while the page is open, because a
 * kitchen does not press refresh. The same cards appear in the thread; this
 * is the same data on one screen instead of scattered across conversations.
 *
 * THE MENU TABLE is one row per published line with the controls a service
 * needs mid-day: sold out in one tap (the citizen's page greys the dish the
 * same minute — the cart refuses it and the recommender stops saying its
 * name), the price inline, and behind "More" the fields worth setting once —
 * veg mark, spice, a photo, prep time, sizes and add-ons. Every edit is a
 * PATCH on that one line: nothing here republishes the other hundred and
 * ninety-nine, and nothing here resets what the bulk editor cannot see.
 */

const failText = (e: unknown, fallback: string) =>
  (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;

/**
 * THE ONE-LINE SUMMARY, AND THE DOOR. The board itself became its own room
 * (owner, 24 Aug) — /services/:id/orders, beside Invoices and Payments — so
 * My Business carries the count and the way there, loudest when somebody's
 * paid order is waiting on a yes.
 */
export function OrdersStrip({ listingId }: { listingId: string }) {
  const q = useBusinessOrders(listingId);
  const open = q.data?.open ?? [];
  const done = q.data?.done ?? [];
  if (!q.data || (open.length === 0 && done.length === 0)) return null;

  return (
    <div className="mcc-block">
      <div className="svo-row">
        <strong className="mcc-title">Orders</strong>
        <span className="muted mcc-sub">
          {open.length === 0
            ? `Nothing waiting · ${done.length} finished`
            : `${open.length} paid and waiting on you`}
        </span>
        <Link to={`/services/${listingId}/orders`}>
          <Button variant={open.length > 0 ? 'accent' : 'line'} size="sm">
            {open.length > 0 ? 'Open the orders board' : 'Orders board'}
          </Button>
        </Link>
      </div>
    </div>
  );
}

/** name + price pairs — sizes and add-ons share the one editor. */
function OptionsEditor({ label, hint, value, onSave, saving }: {
  label: string; hint: string; value: MenuOption[];
  onSave: (next: MenuOption[]) => void; saving: boolean;
}) {
  const [rows, setRows] = useState<Array<{ name: string; price: string }>>(
    value.length ? value.map((v) => ({ name: v.name, price: String(v.priceInr) })) : [{ name: '', price: '' }],
  );
  const clean: MenuOption[] = rows
    .filter((r) => r.name.trim() && r.price !== '' && Number.isFinite(Number(r.price)))
    .map((r) => ({ name: r.name.trim(), priceInr: Number(r.price) }));
  return (
    <div className="svo-gap6">
      <span className="mcc-hint">{label} <span>{hint}</span></span>
      {rows.map((r, i) => (
        <div key={i} className="mpaper-seg">
          <input className="mcc-select mcc-optname" value={r.name} placeholder="Name" maxLength={60} aria-label={`${label} ${i + 1} name`}
            onChange={(e) => setRows((x) => x.map((v, n) => (n === i ? { ...v, name: e.target.value } : v)))} />
          <input className="mcc-select mcc-optprice" value={r.price} placeholder="₹" inputMode="numeric" maxLength={6} aria-label={`${label} ${i + 1} price`}
            onChange={(e) => setRows((x) => x.map((v, n) => (n === i ? { ...v, price: e.target.value.replace(/[^\d]/g, '') } : v)))} />
          <button type="button" className="mcc-x" aria-label={`Remove ${label.toLowerCase()} ${i + 1}`}
            onClick={() => setRows((x) => x.filter((_, n) => n !== i))}>×</button>
        </div>
      ))}
      <div className="svo-row">
        <Button variant="line" size="sm" onClick={() => setRows((x) => [...x, { name: '', price: '' }])}>Add a line</Button>
        <Button variant="accent" size="sm" disabled={saving} onClick={() => onSave(clean)}>
          {saving ? 'Saving…' : `Save ${label.toLowerCase()}`}
        </Button>
      </div>
    </div>
  );
}

function ItemRow({ listingId, item }: { listingId: string; item: MenuItem }) {
  const patch = usePatchMenuItem(listingId);
  const [price, setPrice] = useState(item.priceInr == null ? '' : String(item.priceInr));
  const [prep, setPrep] = useState(item.prepMinutes == null ? '' : String(item.prepMinutes));
  const [more, setMore] = useState(false);
  const [busyPhoto, setBusyPhoto] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = (p: PatchMenuItemInput) => {
    setErr(null);
    patch.mutate({ itemId: item.id, patch: p }, { onError: (e) => setErr(failText(e, 'That change did not save.')) });
  };
  const commitPrice = () => {
    const next = price === '' ? null : Number(price);
    if (next !== item.priceInr) save({ priceInr: next });
  };

  const photo = async (file?: File | null) => {
    if (!file) return;
    setErr(null); setBusyPhoto(true);
    try { save({ photoUrl: await mediaApi.upload(file) }); }
    catch (e) { setErr(uploadErrorMessage(e)); }
    finally { setBusyPhoto(false); }
  };

  return (
    <div className="mcc-row">
      <div className="svo-row">
        <span className={`mcc-name${item.available ? '' : ' is-out'}`}>
          {item.name}
          {item.section && <span className="muted mp-plain"> · {item.section}</span>}
        </span>
        <input className="mcc-price" value={price} inputMode="numeric" maxLength={6} aria-label={`${item.name} price in rupees`}
          placeholder="Ask" onChange={(e) => setPrice(e.target.value.replace(/[^\d]/g, ''))}
          onBlur={commitPrice} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
        {/* THE ONE-TAP SWITCH. The button says what the citizen currently
            sees; pressing it flips both. */}
        <button type="button" className={`mcc-onoff${item.available ? '' : ' is-out'}`} disabled={patch.isPending}
          onClick={() => save({ available: !item.available })}
          aria-label={item.available ? `Mark ${item.name} sold out` : `Put ${item.name} back on`}>
          {item.available ? '● Available' : '● Sold out'}
        </button>
        <button type="button" className="svo-linkbtn" onClick={() => setMore((v) => !v)}>
          {more ? 'Less' : 'More'}
        </button>
      </div>

      {more && (
        <div className="mcc-more">
          <div className="svo-row mcc-wide">
            <label className="svo-minlabel">
              Diet
              <select className="mcc-select" value={item.veg ?? ''} aria-label={`${item.name} veg or non-veg`}
                onChange={(e) => save({ veg: (e.target.value || null) as PatchMenuItemInput['veg'] })}>
                <option value="">unsaid</option>
                <option value="veg">veg</option>
                <option value="nonveg">non-veg</option>
                <option value="egg">egg</option>
              </select>
            </label>
            <label className="svo-minlabel">
              Spice
              <select className="mcc-select" value={item.spice == null ? '' : String(item.spice)} aria-label={`${item.name} spice level`}
                onChange={(e) => save({ spice: e.target.value === '' ? null : Number(e.target.value) })}>
                <option value="">unsaid</option>
                <option value="0">none</option>
                <option value="1">🌶</option>
                <option value="2">🌶🌶</option>
                <option value="3">🌶🌶🌶</option>
              </select>
            </label>
            <label className="svo-minlabel">
              Prep
              <input className="mcc-mini" value={prep} inputMode="numeric" maxLength={3} aria-label={`${item.name} preparation minutes`}
                onChange={(e) => setPrep(e.target.value.replace(/[^\d]/g, ''))}
                onBlur={() => save({ prepMinutes: prep === '' ? null : Number(prep) })} />
              min
            </label>
            <label className="svo-minlabel mcc-cap">
              {item.photoUrl ? 'New photo' : 'Photo'}
              <input type="file" accept="image/*" disabled={busyPhoto} aria-label={`Photograph of ${item.name}`}
                onChange={(e) => { void photo(e.target.files?.[0]); e.target.value = ''; }}
                className="mcc-file" />
            </label>
            {item.photoUrl && <img className="mcc-thumb" src={item.photoUrl} alt={item.name} />}
          </div>

          <OptionsEditor label="Sizes" hint="— Half / Full, each with its price. The cheapest shows on the card."
            value={item.variants} saving={patch.isPending}
            onSave={(v) => save({ variants: v.length ? v : null })} />
          <OptionsEditor label="Add-ons" hint="— extras that ride on it, like “Extra gravy” +₹40."
            value={item.addons} saving={patch.isPending}
            onSave={(v) => save({ addons: v.length ? v : null })} />
        </div>
      )}
      {err && <p className="svo-err" role="alert">{err}</p>}
    </div>
  );
}

export function MenuCommandCenter({ listingId }: { listingId: string }) {
  const live = useMenu(listingId);
  const [open, setOpen] = useState(false);
  const count = live.data?.count ?? 0;
  if (count === 0) return null;
  const items = (live.data?.sections ?? []).flatMap((s) => s.items);
  const off = items.filter((i) => !i.available).length;
  const priced = items.filter((i) => i.priceInr != null);

  return (
    <div className="mcc-block">
      <div className="svo-row">
        <strong className="mcc-title">Today’s menu</strong>
        <span className="muted mcc-sub">
          {count} {count === 1 ? 'item' : 'items'}{off > 0 ? ` · ${off} sold out` : ''}
          {priced.length > 0 ? ` · from ${rupees(Math.min(...priced.map((i) => i.priceInr as number)))}` : ''}
        </span>
        <Button variant="line" size="sm" onClick={() => setOpen((v) => !v)}>
          {open ? 'Close' : 'Prices, sold-out & photos'}
        </Button>
      </div>
      {open && (
        <div className="mcc-open">
          <p className="muted mcc-note">
            Every change lands on your public page the same minute. Sold out keeps the dish on
            the menu and says so — it does not hide it.
          </p>
          {items.map((it) => <ItemRow key={it.id} listingId={listingId} item={it} />)}
        </div>
      )}
    </div>
  );
}
