/**
 * ── THE MONTH, AND WHAT IT COSTS TO FEED ────────────────────────────────────
 *
 * Thirty days of meals, and underneath them the whole grocery list the month
 * adds up to — which is why the separate Shopping list room is gone. A list
 * that lives on its own page is a list somebody has to remember to visit; a
 * list under the plan that produced it is the last paragraph of the same
 * sentence.
 *
 * THE MONTH IS DRAWN AS FOUR-AND-A-BIT WEEKS OF COMPACT DAYS, not as thirty
 * expanded cards. A day opens when it is tapped. The shape people actually
 * read a month in is a calendar, and the thing they scan for is "which days
 * are different" — so the repeated days stay quiet and a tap gets the detail.
 *
 * THE CALENDAR IS ONE PET'S. THE LIST IS THE WHOLE HOUSE'S.
 *
 * Two animals' meals in one grid is unreadable, so the month above follows the
 * pet in the header. The shopping does not: a home with a dog and a cat makes
 * one trip and places one order, so the list below adds every pet's month
 * together, merges the lines that are the same product, and says on each line
 * whose it is. Switching pets up top changes the calendar and leaves the list
 * alone — which is the correct answer to "am I looking at everything I need to
 * buy?" being yes, always.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Empty } from '../components/States';
import { Disclaimer } from '../components/Disclaimer';
import { SectionTitle } from './PetsHome';
import { rupees } from '../engine/format';
import { usePets } from '../store';
import { CATALOGUE } from '../data/catalogue';
import { ESTIMATE_CAVEAT } from '../data/density';
import type { ShoppingItem } from '../types';

const DAY_NAME = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const byId = new Map(CATALOGUE.map((p) => [p.id, p]));

export function Monthly() {
  const nav = useNavigate();
  const pets = usePets((s) => s.pets);
  const activePetId = usePets((s) => s.activePetId);
  const plans = usePets((s) => s.plans);
  const shopping = usePets((s) => s.shopping);
  const toggleMealDone = usePets((s) => s.toggleMealDone);
  const regenerate = usePets((s) => s.regenerate);
  const generatePlan = usePets((s) => s.generatePlan);
  const buildShopping = usePets((s) => s.buildShopping);
  const toggleShopping = usePets((s) => s.toggleShopping);
  const setShoppingQty = usePets((s) => s.setShoppingQty);
  const addShoppingItem = usePets((s) => s.addShoppingItem);
  const addToCart = usePets((s) => s.addToCart);
  const cart = usePets((s) => s.cart);

  const [open, setOpen] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [qty, setQty] = useState('');

  const pet = pets.find((p) => p.id === activePetId) ?? null;
  const plan = pet ? plans[pet.id] ?? null : null;

  /* The list is derived from the plans, so it is rebuilt whenever there are
     plans and no list behind them — rather than left empty until somebody finds
     the button that used to live on the old Shopping page. `planCount` rather
     than the active pet's plan: the list covers the house, so a second pet
     getting its first plan has to rebuild it even if the pet on screen has
     had one all along. */
  const planCount = Object.keys(plans).length;
  useEffect(() => {
    if (planCount && shopping.length === 0) buildShopping();
  }, [planCount, shopping.length, buildShopping]);

  if (!pet || !plan) {
    return (
      <Empty
        glyph="📅"
        title="Nothing planned yet"
        line="The month is built from the pet’s profile. Add a weight and it appears."
        action={<button type="button" className="btn" onClick={() => nav('/pets/plan')}>Open the diet plan</button>}
      />
    );
  }

  const meals = plan.days.flatMap((d) => d.meals);
  const done = meals.filter((m) => m.done).length;
  const city = shopping.filter((i) => i.source === 'together-city');
  const kitchen = shopping.filter((i) => i.source === 'home-kitchen');
  const inCart = cart.reduce((n, l) => n + l.qty, 0);

  /* Who the list is actually for — the pets that have a plan behind them, in
     the order the house was added. Named in the heading so a person can see at
     a glance whether somebody has been left out of the shop. */
  const fed = pets.filter((p) => plans[p.id]);
  const unplanned = pets.filter((p) => !plans[p.id]);
  const names = fed.map((p) => p.name);
  const forWhom = names.length > 1
    ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
    : names[0] ?? '';

  const estimatedTotal = city.reduce((sum, item) => {
    const product = item.productId ? byId.get(item.productId) : null;
    return sum + (product?.priceFrom ?? 0);
  }, 0);

  return (
    <div style={{ display: 'grid', gap: 26 }}>
      <SectionTitle
        title={`${pet.name}’s month`}
        line={`${plan.merKcal} kcal a day across ${plan.mealsPerDay} meals · ${plan.days.length} days · ${done} of ${meals.length} meals marked fed`}
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-sm btn-line" onClick={() => { generatePlan(pet.id); buildShopping(); }}>Rebuild month</button>
            <button type="button" className="btn btn-sm" onClick={() => nav('/pets/cart')} style={{ background: 'var(--accent)', color: 'var(--on-accent)', border: 'none' }}>
              Cart · {inCart}
            </button>
          </div>
        }
      />

      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))' }}>
        {plan.days.map((day, i) => {
          const date = new Date(day.date);
          const isOpen = open === day.date;
          return (
            <section
              key={day.date}
              className="card"
              style={{
                padding: 12, display: 'grid', gap: 8, alignContent: 'start',
                gridColumn: isOpen ? 'span 2' : undefined,
                border: i === 0 ? '1px solid var(--accent-line)' : '1px solid var(--line)',
              }}
            >
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : day.date)}
                aria-expanded={isOpen}
                style={{ border: 'none', background: 'none', padding: 0, textAlign: 'left', font: 'inherit', cursor: 'pointer', display: 'grid', gap: 2 }}
              >
                <strong style={{ fontSize: 13.5, fontWeight: 700 }}>
                  {i === 0 ? 'Today' : `${DAY_NAME[date.getDay()]} ${date.getDate()}`}
                </strong>
                <span className="muted" style={{ fontSize: 10.5 }}>
                  {date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · {day.meals.length} meals
                </span>
              </button>

              {isOpen ? (
                <div style={{ display: 'grid', gap: 8 }}>
                  {day.meals.map((meal) => (
                    <div key={meal.id} style={{ display: 'grid', gap: 5, padding: '9px 10px', borderRadius: 'var(--r-2)', background: meal.done ? 'var(--ok-soft)' : 'var(--wash)', border: `1px solid ${meal.done ? 'var(--ok-line)' : 'var(--line)'}` }}>
                      <span className="muted" style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase' }}>
                        {meal.slot} · {meal.time}
                      </span>
                      <span style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.35 }}>{meal.title}</span>
                      <span className="muted" style={{ fontSize: 11 }}>
                        {meal.grams ? `${meal.grams} g` : meal.gramsRange ? `≈ ${meal.gramsRange[0]}–${meal.gramsRange[1]} g` : 'see pack'} · {meal.kcal} kcal
                        {meal.kind === 'complementary' ? ' · complementary' : ''}
                      </span>
                      <span style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                        <MiniBtn onClick={() => toggleMealDone(pet.id, day.date, meal.id)}>{meal.done ? '✓ Fed' : 'Mark fed'}</MiniBtn>
                        <MiniBtn onClick={() => regenerate(pet.id, day.date, meal.id)}>Swap</MiniBtn>
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 3 }}>
                  {day.meals.map((meal) => (
                    <li key={meal.id} className="muted" style={{ fontSize: 11, lineHeight: 1.4, textDecoration: meal.done ? 'line-through' : 'none' }}>
                      {meal.title.length > 30 ? `${meal.title.slice(0, 30)}…` : meal.title}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      {meals.some((m) => m.gramsRange) && (
        <p className="muted" style={{ margin: 0, fontSize: 11.5, lineHeight: 1.6, maxWidth: 760 }}>{ESTIMATE_CAVEAT}</p>
      )}

      {/* ── THE MONTH'S GROCERY LIST ─────────────────────────────────────── */}
      <section style={{ display: 'grid', gap: 16 }}>
        <SectionTitle
          title={fed.length > 1 ? 'This month’s grocery list — the whole house' : 'This month’s grocery list'}
          line={fed.length > 1
            ? `Every meal for ${forWhom}, added up and merged into one order. Two halves, because they are bought in two different places.`
            : 'Every meal above, added up. Two halves, because they are bought in two different places.'}
          action={
            <button
              type="button"
              className="btn btn-sm"
              style={{ background: 'var(--accent)', color: 'var(--on-accent)', border: 'none' }}
              onClick={() => city.forEach((i) => i.productId && addToCart(i.productId, 0))}
            >
              {fed.length > 1 ? 'Add the whole order to cart' : 'Add everything to cart'}
            </button>
          }
        />

        {unplanned.length > 0 && (
          /* NAMED, NOT SILENTLY OMITTED. A list that quietly covers two of three
             animals is worse than one that covers none, because it looks
             complete. A pet with no weight has no calorie target and therefore
             no month to add up — the planner is where that is fixed. */
          <p className="muted" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6 }}>
            {unplanned.map((p) => p.name).join(', ')} {unplanned.length === 1 ? 'is' : 'are'} not in this list — no plan yet.{' '}
            <button type="button" onClick={() => nav('/pets/profiles')} style={{ border: 'none', background: 'none', padding: 0, font: 'inherit', color: 'var(--accent-ink)', cursor: 'pointer', textDecoration: 'underline' }}>
              Add a weight
            </button>{' '}
            and they join it.
          </p>
        )}

        <List
          title="Buy from Together City"
          line={`Complete diets, treats and supplies · ${city.length} line${city.length === 1 ? '' : 's'}${estimatedTotal ? ` · about ${rupees(estimatedTotal)} at listed prices` : ''}`}
          items={city}
          split={fed.length > 1}
          onToggle={toggleShopping}
          onQty={setShoppingQty}
          onOpen={(id) => nav(`/pets/shop/${id}`)}
          onAdd={(id) => addToCart(id, 0)}
        />
        <List
          title="Buy for home cooking"
          line={fed.length > 1
            ? 'From your own kitchen shop — one quantity per ingredient, for every pet’s home-cooked meals this month.'
            : 'From your own kitchen shop — quantities are for the month’s home-cooked meals.'}
          items={kitchen}
          split={fed.length > 1}
          onToggle={toggleShopping}
          onQty={setShoppingQty}
        />

        <form
          onSubmit={(e) => { e.preventDefault(); if (label.trim()) { addShoppingItem(label.trim(), qty.trim() || '1'); setLabel(''); setQty(''); } }}
          style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}
        >
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Add your own item" style={INPUT} />
          <input value={qty} onChange={(e) => setQty(e.target.value)} placeholder="Quantity" style={{ ...INPUT, maxWidth: 130 }} />
          <button type="submit" className="btn btn-sm btn-line">Add</button>
        </form>
      </section>

      <Disclaimer />
    </div>
  );
}

const INPUT: React.CSSProperties = {
  font: 'inherit', fontSize: 13.5, padding: '9px 12px', borderRadius: 'var(--r-2)',
  border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink)', flex: '1 1 180px',
};

function MiniBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ font: 'inherit', fontSize: 10.5, fontWeight: 600, padding: '4px 9px', borderRadius: 999, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink-soft)', cursor: 'pointer' }}
    >
      {children}
    </button>
  );
}

function List(
  { title, line, items, onToggle, onQty, onOpen, onAdd, split }:
  {
    title: string; line: string;
    items: ShoppingItem[];
    onToggle: (id: string) => void; onQty: (id: string, qty: string) => void;
    onOpen?: (productId: string) => void; onAdd?: (productId: string) => void;
    /** Show whose share is whose. Only worth the line in a house with more
     *  than one pet on a plan — for one animal every line is obviously theirs. */
    split?: boolean;
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
          <li key={item.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '9px 0', borderBottom: '1px solid var(--line)', flexWrap: 'wrap' }}>
            <input type="checkbox" checked={item.checked} onChange={() => onToggle(item.id)} aria-label={`Mark ${item.label} as bought`} style={{ width: 18, height: 18, accentColor: 'var(--accent)' }} />
            <span style={{ flex: '1 1 180px', minWidth: 0, display: 'grid', gap: 2, fontSize: 13.5, textDecoration: item.checked ? 'line-through' : 'none', opacity: item.checked ? 0.55 : 1 }}>
              {onOpen && item.productId ? (
                <button type="button" onClick={() => onOpen(item.productId!)} style={{ border: 'none', background: 'none', padding: 0, font: 'inherit', textAlign: 'left', cursor: 'pointer' }}>
                  {item.label}
                </button>
              ) : item.label}
              {/* THE TOTAL, TRACED BACK. "2.40 kg" is a number to act on;
                  "2.40 kg — Max 2.00 kg · Bruno 400 g" is a number to check,
                  and a merged line nobody can check is a merged line nobody
                  trusts. Shown only where more than one animal contributed. */}
              {split && item.forPets.length > 1 && (
                <span className="muted" style={{ fontSize: 11, lineHeight: 1.45 }}>
                  {item.forPets.map((f) => `${f.name} ${f.qty}`).join(' · ')}
                </span>
              )}
              {split && item.forPets.length === 1 && (
                <span className="muted" style={{ fontSize: 11, lineHeight: 1.45 }}>for {item.forPets[0].name}</span>
              )}
            </span>
            <input
              value={item.qty}
              onChange={(e) => onQty(item.id, e.target.value)}
              aria-label={`Quantity for ${item.label}`}
              style={{ font: 'inherit', fontSize: 12.5, width: 168, padding: '5px 9px', borderRadius: 'var(--r-1)', border: '1px solid var(--line)', background: 'var(--wash)', textAlign: 'right', color: 'var(--ink-soft)' }}
            />
            {onAdd && item.productId && (
              <button type="button" className="btn btn-sm btn-line" style={{ fontSize: 11 }} onClick={() => onAdd(item.productId!)}>Add to cart</button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
