import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui';
import { estimateFood, type EstimateItem } from '../day.api';
import type { OwnFoodInput } from '../composed.api';

/**
 * + ADD FOOD — anything you actually eat.
 *
 * The day cannot balance itself if it only knows about the meals chosen from
 * its own database. So a citizen can put on the day a plate they cooked, a
 * restaurant meal, a packet, or a bare set of numbers — and every one counts
 * against the target exactly as a recipe does.
 *
 * FOUR WAYS IN, ONE WRITE. Cooked / restaurant / packaged all take a sentence
 * ("chicken biryani, one plate"), send it to the journal's reader for an
 * estimate, and show the estimate for review — every number editable — before
 * one POST /nutrition/plan/own/food. Quick add skips the reader and takes the
 * numbers straight. If the reader is off, the sheet falls back to the numbers
 * itself rather than refusing; a citizen who knows the label can always type
 * it. "Recipe from Together City" is not a mode here: it hands focus to the
 * search on the page, because that is what the page is.
 */

export type FoodMode = 'cooked' | 'restaurant' | 'packaged' | 'quick';

const MODE_COPY: Record<FoodMode, { title: string; hint: string; placeholder: string }> = {
  cooked: { title: 'Food I cooked', hint: 'Say what it was and roughly how much — we estimate the numbers, you correct them.', placeholder: 'Dal, two rotis and a bowl of sabzi' },
  restaurant: { title: 'Restaurant / outside food', hint: 'Name the dish and the serving. Add the place if you like — it shows on the day.', placeholder: 'Chicken biryani, one plate' },
  packaged: { title: 'Packaged food', hint: 'The pack name and how much of it. If the label is in front of you, Quick add takes the label\'s numbers directly.', placeholder: 'Oats, 40 g dry · one protein bar' },
  quick: { title: 'Quick add', hint: 'The numbers as you know them — from a label, a menu, or memory.', placeholder: 'Protein shake' },
};

const SLOTS: Array<{ code: OwnFoodInput['slot']; label: string }> = [
  { code: 'b', label: 'Breakfast' }, { code: 'l', label: 'Lunch' }, { code: 'es', label: 'Evening' }, { code: 'd', label: 'Dinner' },
];

const num = (v: string): number => { const x = Number(v); return Number.isFinite(x) && x >= 0 ? x : 0; };
const r1 = (x: number) => Math.round(x * 10) / 10;

interface Draft { name: string; qty: string; kcal: string; protein: string; carbs: string; fat: string; fiber: string }
const EMPTY: Draft = { name: '', qty: '', kcal: '', protein: '', carbs: '', fat: '', fiber: '' };

function fromItems(items: EstimateItem[], fallbackName: string): Draft {
  const sum = items.reduce((t, i) => ({
    kcal: t.kcal + (i.kcal || 0), protein: t.protein + (i.proteinG || 0), carbs: t.carbs + (i.carbG || 0),
    fat: t.fat + (i.fatG || 0), fiber: t.fiber + (i.fibreG || 0), grams: t.grams + (i.grams || 0),
  }), { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, grams: 0 });
  const name = items.length === 1 ? items[0].name : items.length ? items.map((i) => i.name).join(', ') : fallbackName;
  const qty = items.length === 1 ? `${items[0].qty} ${items[0].unit}` : `${items.length} items`;
  return {
    name: name.slice(0, 80), qty,
    kcal: String(Math.round(sum.kcal)), protein: String(r1(sum.protein)), carbs: String(r1(sum.carbs)),
    fat: String(r1(sum.fat)), fiber: String(r1(sum.fiber)),
  };
}

export function AddFoodSheet({ open, mode, defaultSlot, onClose, onSubmit, busy, prefill }: {
  open: boolean;
  mode: FoodMode;
  defaultSlot: OwnFoodInput['slot'];
  onClose: () => void;
  onSubmit: (food: OwnFoodInput) => void;
  busy: boolean;
  /** A quick-fix row pressed "Add to today": the numbers arrive already filled. */
  prefill?: Partial<Draft> | null;
}) {
  const [text, setText] = useState('');
  const [place, setPlace] = useState('');
  const [slot, setSlot] = useState<OwnFoodInput['slot']>(defaultSlot);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [reading, setReading] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const first = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setText(''); setPlace(''); setNote(null); setReading(false); setSlot(defaultSlot);
    setDraft(mode === 'quick' ? { ...EMPTY, ...(prefill ?? {}) } : null);
    setTimeout(() => first.current?.focus(), 0);
  }, [open, mode, defaultSlot, prefill]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  const copy = MODE_COPY[mode];

  const read = async () => {
    const t = text.trim();
    if (!t) return;
    setReading(true); setNote(null);
    try {
      const res = await estimateFood(mode === 'restaurant' && place.trim() ? `${t} (from ${place.trim()})` : t);
      if (!res.available || !res.items.length) {
        setNote(res.note ?? 'Couldn\'t estimate this one — add the numbers yourself below.');
        setDraft({ ...EMPTY, name: t.slice(0, 80), qty: '1 serving' });
      } else {
        setNote(res.note ?? null);
        setDraft(fromItems(res.items, t));
      }
    } catch {
      setNote('The reader is busy right now — add the numbers yourself below.');
      setDraft({ ...EMPTY, name: t.slice(0, 80), qty: '1 serving' });
    } finally {
      setReading(false);
    }
  };

  const submit = () => {
    if (!draft) return;
    const name = draft.name.trim();
    if (!name) return;
    onSubmit({
      name, source: mode, qty: draft.qty.trim() || undefined, place: place.trim() || undefined, slot,
      kcal: num(draft.kcal), protein: num(draft.protein), carbs: num(draft.carbs), fat: num(draft.fat), fiber: num(draft.fiber),
    });
  };

  const field = (key: keyof Draft, label: string, unit: string, wide = false) => (
    <label className={`byd-field${wide ? ' is-wide' : ''}`}>
      <span>{label}</span>
      <input inputMode={key === 'name' || key === 'qty' ? 'text' : 'decimal'} value={draft?.[key] ?? ''}
        onChange={(e) => setDraft((d) => ({ ...(d ?? EMPTY), [key]: e.target.value }))} />
      {unit && <em>{unit}</em>}
    </label>
  );

  return (
    <div className="byd-sheet-scrim" onClick={onClose} role="presentation">
      <div className="byd-sheet" role="dialog" aria-modal="true" aria-labelledby="byd-sheet-h" onClick={(e) => e.stopPropagation()}>
        <div className="byd-sheet-head">
          <div>
            <div className="byd-eyebrow">Add food</div>
            <h2 id="byd-sheet-h">{copy.title}</h2>
          </div>
          <button type="button" className="byd-sheet-x" aria-label="Close" onClick={onClose}>×</button>
        </div>
        <p className="byd-muted" style={{ marginTop: 0 }}>{copy.hint}</p>

        <div className="byd-slots" role="radiogroup" aria-label="Which course">
          {SLOTS.map((s) => (
            <button type="button" key={s.code} role="radio" aria-checked={slot === s.code}
              className={slot === s.code ? 'is-on' : ''} onClick={() => setSlot(s.code)}>{s.label}</button>
          ))}
        </div>

        {mode !== 'quick' && (
          <form onSubmit={(e) => { e.preventDefault(); void read(); }} className="byd-read">
            <input ref={first} value={text} onChange={(e) => setText(e.target.value)} placeholder={copy.placeholder}
              aria-label="What did you eat" maxLength={300} />
            {mode === 'restaurant' && (
              <input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Where (optional)" aria-label="Restaurant" maxLength={80} />
            )}
            <Button type="submit" variant="line" size="sm" disabled={reading || !text.trim()}>{reading ? 'Reading…' : draft ? 'Read again' : 'Estimate'}</Button>
          </form>
        )}

        {note && <p className="byd-note">{note}</p>}

        {draft && (
          <div className="byd-review">
            {mode !== 'quick' && <div className="byd-eyebrow">Review the estimate — every number is yours to correct</div>}
            <div className="byd-fields">
              {mode === 'quick'
                ? <label className="byd-field is-wide"><span>Name</span><input ref={first} value={draft.name} maxLength={80}
                    onChange={(e) => setDraft((d) => ({ ...(d ?? EMPTY), name: e.target.value }))} placeholder={copy.placeholder} /></label>
                : field('name', 'Name', '', true)}
              {field('qty', 'Amount', '')}
              {field('kcal', 'Calories', 'kcal')}
              {field('protein', 'Protein', 'g')}
              {field('carbs', 'Carbohydrate', 'g')}
              {field('fat', 'Fat', 'g')}
              {field('fiber', 'Fibre', 'g')}
            </div>
            <p className="byd-muted">Estimates, not measurements — the day is only as right as these numbers.</p>
            <div className="byd-sheet-acts">
              <Button variant="accent" size="sm" disabled={busy || !draft.name.trim()} onClick={submit}>{busy ? 'Adding…' : 'Add to today'}</Button>
              <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
