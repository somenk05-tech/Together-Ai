/**
 * ONE MEAL.
 *
 * The card carries the four things an owner acts on — what, how much, when, and
 * whether it has been given — and one thing they must not miss: whether this
 * meal is a COMPLETE diet or a COMPLEMENTARY one. That mark is not a footnote
 * on this card. A week of complementary meals is a deficient diet, and the only
 * place that becomes visible is here, one meal at a time.
 *
 * WHEN THE GRAMS ARE UNKNOWN the card says which pack to read instead. Most
 * Indian retail listings do not publish kcal/kg, and a portion invented to fill
 * the gap is the one number on this screen that could do real harm.
 */

import type { MealSlot } from '../types';

const SLOT_WORD: Record<MealSlot['slot'], string> = { breakfast: 'Breakfast', lunch: 'Lunch / snack', dinner: 'Dinner' };

interface Props {
  meal: MealSlot;
  onToggle: () => void;
  onRegenerate: () => void;
  onOpen?: () => void;
  favourite?: boolean;
  onFavourite?: () => void;
}

export function MealCard({ meal, onToggle, onRegenerate, onOpen, favourite, onFavourite }: Props) {
  return (
    <article
      className="card"
      style={{
        display: 'grid', gap: 10, padding: 16,
        opacity: meal.done ? 0.72 : 1,
        borderLeft: `3px solid ${meal.kind === 'complete' ? 'var(--ok-line)' : 'var(--warn-line)'}`,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
        <span className="muted" style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase' }}>
          {SLOT_WORD[meal.slot]}
        </span>
        <span className="muted" style={{ fontSize: 12.5, fontWeight: 600 }}>{meal.time}</span>
      </div>

      <div style={{ display: 'grid', gap: 4 }}>
        <button
          type="button"
          onClick={onOpen}
          disabled={!onOpen}
          style={{ border: 'none', background: 'none', padding: 0, textAlign: 'left', font: 'inherit', fontSize: 16, fontWeight: 600, lineHeight: 1.3, cursor: onOpen ? 'pointer' : 'default' }}
        >
          {meal.title}
        </button>
        <p className="muted" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5 }}>{meal.detail}</p>
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'baseline' }}>
        <Figure label="Portion" value={meal.grams ? `${meal.grams} g` : 'See pack guide'} muted={!meal.grams} />
        <Figure label="Energy" value={meal.kcal ? `${meal.kcal} kcal` : '—'} />
        <span
          style={{
            fontSize: 10, fontWeight: 800, letterSpacing: '.07em', textTransform: 'uppercase',
            padding: '3px 9px', borderRadius: 999,
            color: meal.kind === 'complete' ? 'var(--ok-ink)' : 'var(--warn-ink)',
            background: meal.kind === 'complete' ? 'var(--ok-soft)' : 'var(--warn-soft)',
            border: `1px solid ${meal.kind === 'complete' ? 'var(--ok-line)' : 'var(--warn-line)'}`,
          }}
        >
          {meal.kind === 'complete' ? 'Complete & balanced' : 'Complementary'}
        </span>
      </div>

      {!meal.grams && (
        <p className="muted" style={{ margin: 0, fontSize: 11.5, lineHeight: 1.5 }}>
          This listing doesn’t publish calories per kilogram, so we can’t convert the target into grams. Use the feeding chart on the pack for {meal.kcal} kcal.
        </p>
      )}

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={onToggle}
          className="btn btn-sm"
          style={{
            border: 'none',
            background: meal.done ? 'var(--ok-soft)' : 'var(--accent)',
            color: meal.done ? 'var(--ok-ink)' : 'var(--on-accent)',
          }}
        >
          {meal.done ? '✓ Fed' : 'Mark as fed'}
        </button>
        <button type="button" onClick={onRegenerate} className="btn btn-sm btn-line">Swap meal</button>
        {onFavourite && (
          <button type="button" onClick={onFavourite} className="btn btn-sm btn-line" aria-pressed={favourite}>
            {favourite ? '★ Saved' : '☆ Save'}
          </button>
        )}
      </div>
    </article>
  );
}

function Figure({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <span style={{ display: 'grid' }}>
      <span className="muted" style={{ fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase' }}>{label}</span>
      <strong style={{ fontSize: 14.5, fontWeight: 700, color: muted ? 'var(--muted)' : 'inherit' }}>{value}</strong>
    </span>
  );
}
