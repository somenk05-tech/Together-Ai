/**
 * ── THIS WEEK'S PET SHOPPING ────────────────────────────────────────────────
 *
 * Generated from the plan, split into the two places it is actually bought, and
 * editable — because a list you cannot correct is a list you stop using by
 * Wednesday.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Empty } from '../components/States';
import { SectionTitle } from './PetsHome';
import { usePets } from '../store';

export function Shopping() {
  const nav = useNavigate();
  const shopping = usePets((s) => s.shopping);
  const toggle = usePets((s) => s.toggleShopping);
  const setQty = usePets((s) => s.setShoppingQty);
  const addItem = usePets((s) => s.addShoppingItem);
  const buildShopping = usePets((s) => s.buildShopping);
  const addToCart = usePets((s) => s.addToCart);
  const activePetId = usePets((s) => s.activePetId);
  const plans = usePets((s) => s.plans);
  const [label, setLabel] = useState('');
  const [qty, setQty2] = useState('');

  const city = shopping.filter((i) => i.source === 'together-city');
  const kitchen = shopping.filter((i) => i.source === 'home-kitchen');
  const hasPlan = activePetId ? Boolean(plans[activePetId]) : false;

  if (!shopping.length) {
    return (
      <Empty
        glyph="🧾"
        title="No list yet"
        line={hasPlan ? 'Build the list from this week’s meal plan.' : 'A meal plan writes this list for you.'}
        action={
          hasPlan
            ? <button type="button" className="btn" onClick={() => activePetId && buildShopping(activePetId)}>Generate from the plan</button>
            : <button type="button" className="btn" onClick={() => nav('/pets/plan')}>Create a diet plan</button>
        }
      />
    );
  }

  return (
    <div style={{ display: 'grid', gap: 22, maxWidth: 820 }}>
      <SectionTitle
        title="This week’s pet shopping"
        line="Written from the meal plan. Tick as you go; the list keeps its own state."
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-sm btn-line" onClick={() => activePetId && buildShopping(activePetId)}>Rebuild from plan</button>
            <button
              type="button"
              className="btn btn-sm"
              style={{ background: 'var(--accent)', color: 'var(--on-accent)', border: 'none' }}
              onClick={() => city.forEach((i) => i.productId && addToCart(i.productId, 0))}
            >
              Add everything to cart
            </button>
          </div>
        }
      />

      <List title="Buy from Together City" line="Complete diets, treats and supplies from the catalogue." items={city} onToggle={toggle} onQty={setQty} onOpen={(id) => nav(`/pets/shop/${id}`)} />
      <List title="Buy for home cooking" line="From your own kitchen shop — quantities are for the week’s home-cooked meals." items={kitchen} onToggle={toggle} onQty={setQty} />

      <form
        onSubmit={(e) => { e.preventDefault(); if (label.trim()) { addItem(label.trim(), qty.trim() || '1'); setLabel(''); setQty2(''); } }}
        style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}
      >
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Add your own item" style={INPUT} />
        <input value={qty} onChange={(e) => setQty2(e.target.value)} placeholder="Quantity" style={{ ...INPUT, maxWidth: 130 }} />
        <button type="submit" className="btn btn-sm btn-line">Add</button>
      </form>
    </div>
  );
}

const INPUT: React.CSSProperties = {
  font: 'inherit', fontSize: 13.5, padding: '9px 12px', borderRadius: 'var(--r-2)',
  border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink)', flex: '1 1 180px',
};

function List(
  { title, line, items, onToggle, onQty, onOpen }:
  {
    title: string; line: string;
    items: { id: string; label: string; qty: string; checked: boolean; productId: string | null; custom: boolean }[];
    onToggle: (id: string) => void; onQty: (id: string, qty: string) => void; onOpen?: (productId: string) => void;
  },
) {
  if (!items.length) return null;
  return (
    <section className="card" style={{ padding: 18, display: 'grid', gap: 12 }}>
      <header style={{ display: 'grid', gap: 2 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{title}</h3>
        <p className="muted" style={{ margin: 0, fontSize: 12 }}>{line}</p>
      </header>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 2 }}>
        {items.map((item) => (
          <li key={item.id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '9px 0', borderBottom: '1px solid var(--line)' }}>
            <input type="checkbox" checked={item.checked} onChange={() => onToggle(item.id)} aria-label={`Mark ${item.label} as bought`} style={{ width: 18, height: 18, accentColor: 'var(--accent)' }} />
            <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, textDecoration: item.checked ? 'line-through' : 'none', opacity: item.checked ? 0.55 : 1 }}>
              {onOpen && item.productId ? (
                <button type="button" onClick={() => onOpen(item.productId!)} style={{ border: 'none', background: 'none', padding: 0, font: 'inherit', textAlign: 'left', cursor: 'pointer' }}>
                  {item.label}
                </button>
              ) : item.label}
            </span>
            <input
              value={item.qty}
              onChange={(e) => onQty(item.id, e.target.value)}
              aria-label={`Quantity for ${item.label}`}
              style={{ font: 'inherit', fontSize: 12.5, width: 148, padding: '5px 9px', borderRadius: 'var(--r-1)', border: '1px solid var(--line)', background: 'var(--wash)', textAlign: 'right', color: 'var(--ink-soft)' }}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
