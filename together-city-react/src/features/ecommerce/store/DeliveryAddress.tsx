import { useEffect, useState, type ChangeEvent } from 'react';
import { Button, SavedMark, Spinner } from '@/components/ui';
import { useSaveAddress, useSavedAddresses } from '@/features/profile/hooks';
import type { AddressLabel, DeliveryAddressInput, SavedAddressView } from '@/features/profile/api';

/**
 * ── A DOOR TO DELIVER TO ────────────────────────────────────────────────────
 *
 * Owner, 7 Sep: "add a detailed delivery address to be saved, and show the
 * delivery address if it is already saved."
 *
 * The cart already had one payment and one list; what it did not have was a
 * door. This is the block above the total: the citizen's saved doors (home,
 * work, other — the address book every hub already reads), the one that is
 * chosen, and a form to add or change one. The form is the whole of what a
 * rider needs and nothing else: a name on the door, a phone to call, the
 * building, the street, a landmark, the city, the state and a PIN.
 *
 * NOTHING IS SAVED UNTIL SAVE IS PRESSED. That press is the consent the book
 * has always asked for (the "save this as…" tick at the local-services
 * checkout); the store's checkout asks the same way. The order then carries
 * the LABEL of the chosen door, and the server keeps a snapshot of it on the
 * order — the receipt for a parcel must still say where it went after the
 * book has changed.
 *
 * THE FIELDS ARE THE BOOK'S OWN. A row dictated before the book had fields is
 * offered as it was — its one line and its label — and can be chosen; editing
 * it opens the form with the line in the street field, so nothing typed once
 * is typed again.
 */

const LABELS: { key: AddressLabel; word: string }[] = [
  { key: 'home', word: 'Home' },
  { key: 'work', word: 'Work' },
  { key: 'other', word: 'Other' },
];

const EMPTY: DeliveryAddressInput = { name: '', phone: '', line1: '', line2: '', landmark: '', city: '', state: '', pincode: '' };

function draftOf(a: SavedAddressView | undefined): DeliveryAddressInput {
  if (!a) return EMPTY;
  return {
    name: a.name ?? '', phone: a.phone ?? '',
    line1: a.line1 ?? (a.city ? '' : a.addressText), line2: a.line2 ?? '', landmark: a.landmark ?? '',
    city: a.city ?? '', state: a.state ?? '', pincode: a.pincode ?? '',
  };
}

/** What the server will refuse, said before the round trip. */
function problems(d: DeliveryAddressInput): string[] {
  const out: string[] = [];
  if (d.name.trim().length < 2) out.push('a name for the door');
  if (!/^\+?[0-9][0-9 -]{7,15}$/.test(d.phone.trim())) out.push('a phone number the rider can call');
  if (d.line1.trim().length < 3) out.push('the building and street');
  if (d.city.trim().length < 2) out.push('the city');
  if (d.state.trim().length < 2) out.push('the state');
  if (!/^[1-9][0-9]{5}$/.test(d.pincode.trim())) out.push('a six-digit PIN');
  return out;
}

export function DeliveryAddress({ chosen, onChoose }: {
  /** The label of the door the order will go to, or null until one is picked. */
  chosen: AddressLabel | null;
  onChoose: (label: AddressLabel | null) => void;
}) {
  const book = useSavedAddresses();
  const save = useSaveAddress();
  const doors = book.data?.addresses ?? [];
  const [editing, setEditing] = useState<AddressLabel | null>(null);
  const [draft, setDraft] = useState<DeliveryAddressInput>(EMPTY);
  const [tried, setTried] = useState(false);

  /* THE FIRST DOOR IS CHOSEN FOR THEM, ONCE. A citizen with one saved door
     should not have to press it to send a parcel there; a citizen with none
     sees the form open. An effect rather than a render-time call, because
     the choice lives on the cart page and a child may not set a parent's
     state while it is being drawn. */
  const first = doors[0]?.label as AddressLabel | undefined;
  useEffect(() => {
    if (chosen === null && first && editing === null) onChoose(first);
  }, [chosen, first, editing, onChoose]);

  const open = (label: AddressLabel) => {
    setEditing(label);
    setDraft(draftOf(doors.find((d) => d.label === label)));
    setTried(false);
  };
  const set = (k: keyof DeliveryAddressInput) => (e: ChangeEvent<HTMLInputElement>) =>
    setDraft((d) => ({ ...d, [k]: e.target.value }));
  const missing = problems(draft);
  const submit = () => {
    const label: AddressLabel = editing ?? 'home';
    setTried(true);
    if (missing.length) return;
    save.mutate({ label, address: draft }, {
      onSuccess: () => { onChoose(label); setEditing(null); },
    });
  };

  if (book.isLoading) {
    return <section className="sf-door" aria-label="Delivery address"><Spinner label="Reading your address book…" /></section>;
  }

  const form = editing !== null;
  const showForm = form || doors.length === 0;
  const formLabel = editing ?? 'home';

  return (
    <section className="sf-door" aria-labelledby="sf-door-title">
      <div className="st-section-head">
        <span id="sf-door-title" className="st-sum-label">Deliver to</span>
        {doors.length > 0 && !form && (
          <button type="button" className="st-quiet" onClick={() => open(nextFreeLabel(doors))}>
            {doors.length < LABELS.length ? 'Add another' : 'Change'}
          </button>
        )}
      </div>

      {doors.length > 0 && !form && (
        <div className="sf-doors" role="radiogroup" aria-label="Saved addresses">
          {doors.map((d) => {
            const on = d.label === chosen;
            return (
              <label key={d.label} className={`sf-door-card${on ? ' on' : ''}`}>
                <input type="radio" name="sf-door" value={d.label} checked={on} onChange={() => onChoose(d.label as AddressLabel)} />
                <span className="sf-door-body">
                  <span className="sf-door-label">{d.label}</span>
                  {d.name && <span className="sf-door-name">{d.name}</span>}
                  <span className="sf-door-text">{d.addressText}</span>
                  {d.phone && <span className="sf-door-phone">{d.phone}</span>}
                </span>
                <button type="button" className="st-quiet sf-door-edit" onClick={(e) => { e.preventDefault(); open(d.label as AddressLabel); }}>
                  Edit
                </button>
              </label>
            );
          })}
        </div>
      )}

      {showForm && (
        <form className="sf-door-form" onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
          <div className="sf-door-labels" role="radiogroup" aria-label="Save this address as">
            {LABELS.map((l) => (
              <label key={l.key} className={`st-aisle${formLabel === l.key ? ' on' : ''}`}>
                {/* Switching the label keeps what has been typed unless that
                    page of the book already has a door on it. */}
                <input type="radio" name="sf-door-label" value={l.key} checked={formLabel === l.key}
                  onChange={() => {
                    setEditing(l.key);
                    const saved = doors.find((d) => d.label === l.key);
                    if (saved) setDraft(draftOf(saved));
                  }} />
                {l.word}
              </label>
            ))}
          </div>
          <div className="sf-door-grid">
            <label className="sf-door-field"><span>Name on the door</span>
              <input value={draft.name} onChange={set('name')} autoComplete="name" /></label>
            <label className="sf-door-field"><span>Phone</span>
              <input value={draft.phone} onChange={set('phone')} inputMode="tel" autoComplete="tel" /></label>
            <label className="sf-door-field sf-door-wide"><span>Flat, building, street</span>
              <input value={draft.line1} onChange={set('line1')} autoComplete="address-line1" /></label>
            <label className="sf-door-field sf-door-wide"><span>Area, locality</span>
              <input value={draft.line2 ?? ''} onChange={set('line2')} autoComplete="address-line2" /></label>
            <label className="sf-door-field sf-door-wide"><span>Landmark</span>
              <input value={draft.landmark ?? ''} onChange={set('landmark')} /></label>
            <label className="sf-door-field"><span>City</span>
              <input value={draft.city} onChange={set('city')} autoComplete="address-level2" /></label>
            <label className="sf-door-field"><span>State</span>
              <input value={draft.state} onChange={set('state')} autoComplete="address-level1" /></label>
            <label className="sf-door-field"><span>PIN</span>
              <input value={draft.pincode} onChange={set('pincode')} inputMode="numeric" autoComplete="postal-code" /></label>
          </div>
          {tried && missing.length > 0 && (
            <p className="st-error">Still needed: {missing.join(', ')}.</p>
          )}
          {save.isError && <p className="st-error">Couldn’t save that address. Try again in a moment.</p>}
          <div className="sf-door-acts">
            <Button type="submit" className="st-cta"
              state={save.isPending ? 'loading' : undefined} loadingLabel="Saving…">
              Save address
            </Button>
            {save.isSuccess && <SavedMark />}
            {doors.length > 0 && (
              <button type="button" className="st-quiet" onClick={() => setEditing(null)}>Cancel</button>
            )}
          </div>
        </form>
      )}
    </section>
  );
}

/** The first page of the book with nothing on it, for "Add another". */
function nextFreeLabel(doors: SavedAddressView[]): AddressLabel {
  const used = new Set(doors.map((d) => d.label));
  return LABELS.find((l) => !used.has(l.key))?.key ?? 'other';
}
