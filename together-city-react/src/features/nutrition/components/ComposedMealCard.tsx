import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  useRefreshMeal, useSkipMeal, useRefreshComponent, useSkipComponent,
  type ComposedMeal, type MealComponent,
} from '../composed.api';
import { VegMark, mealKind } from './VegMark';
import { ShareIconButton } from '@/components/share/ShareButton';
import { encodeMeal } from '../shareMeal';
import type { ShareCard } from '@/api';
import { NIc } from './NIcon';
import { skippedRolesFor } from '../skips';

/**
 * One composed meal, rendered as a card: banner, 16:9 photo, title, the dishes
 * that make up the plate, and per-dish refresh/skip on lunch and dinner.
 *
 * Lifted out of MealPlan.tsx so the family planner can render the SAME meal the
 * individual planner does. A composed meal is N components rather than one
 * recipe, which is why the older MealCard can't show it — that component reads
 * `meal.recipe`, and a ComposedMeal has no such field.
 */
/** Build a rich, shareable recipe card from a meal — its headline dish photo,
 *  the meal's name, calories and macros, deep-linked to the recipe page. Reused
 *  by the same UniversalShareSheet every hub uses. */
function mealShareCard(meal: ComposedMeal, master: MealComponent | null): ShareCard {
  const t = meal.totals;
  const macros = [
    `${Math.round(t.kcal)} kcal`,
    `P ${Math.round(t.protein)}g`,
    `C ${Math.round(t.carbs)}g`,
    `F ${Math.round(t.fat)}g`,
  ];
  // The whole meal, encoded into the deep link, so tapping the shared card opens a
  // full-page read-only view of the ENTIRE meal (photo, name, macros, every dish),
  // where each dish links to its detailed recipe — no server lookup needed.
  const token = encodeMeal({
    t: meal.title,
    l: meal.label,
    i: master?.imageUrl ?? null,
    k: Math.round(t.kcal),
    m: macros.slice(1), // P/C/F only — kcal is rendered separately from `k`
    d: meal.components.map((c) => [c.name, c.recipeId, Math.round(c.kcal)] as [string, string, number]),
  });
  return {
    kind: 'recipe',
    title: meal.title,
    subtitle: `${meal.label} · ${meal.components.length} ${meal.components.length === 1 ? 'dish' : 'dishes'}`,
    image: master?.imageUrl ?? null,
    meta: macros,
    items: meal.components.map((c) => `${c.name} · ${Math.round(c.kcal)} kcal`),
    deepLink: `/nutrition/shared-meal?d=${token}`,
  };
}

/** Deterministic warm food-toned gradient for a recipe without a photo (always a
 *  gradient — the real photo is layered on top via <img> so a missing/404 image
 *  reveals this instead of a blank box). */
function photoBg(c?: MealComponent): string {
  const key = `${c?.recipeId ?? ''}${c?.name ?? 'meal'}`;
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = h % 360;               // spread across the wheel
  const hue2 = (hue + 28) % 360;
  return `linear-gradient(135deg, hsl(${hue} 55% 62%), hsl(${hue2} 60% 45%))`;
}

const mainOf = (m: ComposedMeal) => m.components.find((c) => c.role === 'main') ?? m.components.find((c) => c.role === 'dal') ?? m.components.find((c) => c.role === 'breakfast') ?? m.components[0];
/** The card headline ("master") — always a real main/protein WITH a photo when
 *  possible: a photographed main → any photographed dish → the main (gradient). */
const photoOf = (m: ComposedMeal) =>
  m.components.find((c) => (c.role === 'main' || c.role === 'dal' || c.role === 'breakfast') && c.imageUrl)
  ?? m.components.find((c) => c.imageUrl)
  ?? mainOf(m);

/** A single meal column card (banner · 16:9 photo · title · dish links · prep/kcal). */
/**
 * Skip is a TOGGLE (p11, BE-9.2/FE-9.1).
 *
 * The API has always taken `skipped: boolean` and has always accepted false.
 * Both buttons on this card sent a hardcoded `true`, and the only way back was
 * a "Restore all" banner that undid every skip in the week at once. So saying
 * "not this one tonight" was a one-way door, and correcting a mis-tap cost you
 * every other choice you had made.
 *
 * The skipped keys already arrive with the plan — `skips: ['d0:l', 'd2:d:dal']`
 * — so the way back was one call away the whole time.
 *
 * A skipped DISH renders in place, dimmed and struck through, with the button
 * now reading "Add back". A skipped MEAL is not in `days[].meals` at all (the
 * composer builds the week without it), so the parent renders a placeholder in
 * its slot instead of leaving a hole. Rendering the real dish greyed out would
 * be better and needs the composer to return skipped items rather than omit
 * them — a service change, noted rather than faked.
 */
const SLOT_LABEL: Record<string, string> = { b: 'Breakfast', l: 'Lunch', s: 'Snack', d: 'Dinner' };


/** The placeholder that holds a skipped meal's place in the day. */
export function SkippedMealCard({ dayIndex, slot }: { dayIndex: number; slot: string }) {
  const skip = useSkipMeal();
  return (
    <div style={{
      background: 'var(--card)', border: '1px dashed var(--line)', borderRadius: 20,
      padding: '18px 16px', display: 'flex', flexDirection: 'column', gap: 10,
      alignItems: 'flex-start', justifyContent: 'center', minHeight: 140,
    }}>
      <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.09em', textTransform: 'uppercase', color: 'var(--muted)' }}>
        {SLOT_LABEL[slot] ?? slot}
      </span>
      <span className="muted" style={{ fontSize: 13 }}>Skipped — not counted in today&rsquo;s totals or your grocery list.</span>
      <button type="button" disabled={skip.isPending}
        onClick={() => skip.mutate({ day: dayIndex, slot, skipped: false })}
        style={{ minWidth: 44, minHeight: 44, padding: '0 14px', borderRadius: 10, border: '1px solid var(--accent)', background: 'none', color: 'var(--accent)', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
        {skip.isPending ? 'Adding back…' : 'Add back'}
      </button>
    </div>
  );
}

/** A single meal column card (banner · 16:9 photo · title · dish links · prep/kcal). */
export function ComposedMealCard({ meal, dayIndex, readOnly, people = 1, skips = [] }: {
  meal: ComposedMeal;
  dayIndex: number;
  readOnly?: boolean;
  /** Household headcount. >1 shows what the shared dish yields for the table. */
  people?: number;
  /** Skip keys for the whole week, as the plan returns them. */
  skips?: string[];
}) {
  const navigate = useNavigate(); const location = useLocation();
  const [err, setErr] = useState(false);
  const refresh = useRefreshMeal(); const skip = useSkipMeal();
  const refreshComp = useRefreshComponent(); const skipComp = useSkipComponent();
  const lineBusy = refreshComp.isPending || skipComp.isPending;
  const busy = refresh.isPending || skip.isPending || lineBusy;
  // Per-line Refresh/Skip only on the composite lunch & dinner plates.
  const lineControls = !readOnly && (meal.slot === 'l' || meal.slot === 'd');
  const skippedRoles = skippedRolesFor(skips, dayIndex, meal.slot);
  const photo = photoOf(meal);          // the "master" headline dish (a main with a photo when possible)
  const img = photo?.imageUrl && !err ? photo.imageUrl : null;
  const open = () => { const id = photo?.recipeId; if (id) navigate(`/nutrition/recipes/${id}`, { state: { from: location.pathname + location.search } }); };
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 20, overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow)', opacity: busy ? 0.55 : 1 }}>
      <div style={{ padding: '14px 14px 0' }}>
        <span style={{ display: 'inline-block', background: 'var(--ink)', color: '#fff', fontSize: 11, fontWeight: 800, letterSpacing: '.09em', textTransform: 'uppercase', padding: '5px 12px', borderRadius: 8 }}>{meal.label}</span>
      </div>
      <div style={{ position: 'relative', margin: '12px 14px 0', width: 'calc(100% - 28px)' }}>
        <button type="button" onClick={open} aria-label={`Open ${meal.title}`} style={{ border: 'none', padding: 0, background: 'none', cursor: 'pointer', fontFamily: 'inherit', display: 'block', width: '100%' }}>
          <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', borderRadius: 14, overflow: 'hidden', background: photoBg(photo) }}>
            {img && <img src={img} alt={meal.title} loading="lazy" onError={() => setErr(true)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
            {!img && (
              <span style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '22px 12px 10px', background: 'linear-gradient(transparent, rgba(0,0,0,.6))', color: '#fff', fontSize: 13.5, fontWeight: 700, lineHeight: 1.25, textAlign: 'left', textShadow: '0 1px 4px rgba(0,0,0,.35)' }}>
                {(photo?.name ?? meal.title)}
              </span>
            )}
          </div>
        </button>
        {/* Veg/non-veg mark + Send — siblings of the open-button so no button nests inside another. */}
        <span style={{ position: 'absolute', top: 8, left: 8, background: 'rgba(255,255,255,.92)', borderRadius: 5, padding: 2, lineHeight: 0, boxShadow: '0 1px 3px rgba(0,0,0,.22)', pointerEvents: 'none' }}>
          <VegMark diet={mealKind(meal.components.map((c) => c.diet))} size={16} />
        </span>
        <span style={{ position: 'absolute', top: 8, right: 8 }}>
          <ShareIconButton
            card={mealShareCard(meal, photo)}
            label={`Send ${photo?.name ?? meal.title}`}
            variant="overlay"
            size={32}
          />
        </span>
      </div>
      <div style={{ padding: '12px 16px 16px', display: 'flex', flexDirection: 'column', flex: 1 }}>
        <h3 style={{ fontSize: 15.5, margin: '0 0 8px', lineHeight: 1.3, letterSpacing: '-.01em' }}>{meal.title}</h3>
        {/* Every dish links to its own recipe page; on lunch/dinner each dish also
            carries a Refresh (swap like-for-like) and Skip (remove) control. */}
        <div style={{ display: 'flex', flexDirection: 'column', margin: '0 0 12px' }}>
          {meal.components.map((c, i) => {
            const off = skippedRoles.has(c.role);
            return (
            <div key={c.recipeId + c.role} style={{ display: 'flex', alignItems: 'center', gap: 2, borderTop: i ? '1px solid var(--line)' : 'none', opacity: off ? 0.5 : 1 }}>
              <button type="button"
                onClick={() => c.recipeId && navigate(`/nutrition/recipes/${c.recipeId}`, { state: { from: location.pathname + location.search } })}
                style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', padding: '7px 0', cursor: 'pointer', fontFamily: 'inherit' }}>
                <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: 'var(--ink)', fontWeight: 500, textDecoration: off ? 'line-through' : 'none' }}>{c.name}</span>
                <span style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap', textDecoration: off ? 'line-through' : 'none' }}>{c.kcal} kcal</span>
                {!lineControls && <NIc name="chevR" size={13} style={{ color: 'var(--accent)' }} />}
              </button>
              {lineControls && (
                <>
                  <button type="button" disabled={busy} aria-label={`Swap ${c.name} for another ${c.role}`} title="Swap for another (same type)"
                    onClick={() => refreshComp.mutate({ day: dayIndex, slot: meal.slot, role: c.role })}
                    style={{ minWidth: 44, minHeight: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 7, background: 'none', border: '1px solid var(--line)', color: 'var(--muted)', cursor: 'pointer', flex: '0 0 auto', padding: 0 }}>
                    <NIc name="refresh" size={13} />
                  </button>
                  <button type="button" disabled={busy}
                    aria-label={off ? `Add ${c.name} back` : `Skip ${c.name}`}
                    title={off ? 'Add this dish back' : 'Skip this dish'}
                    onClick={() => skipComp.mutate({ day: dayIndex, slot: meal.slot, role: c.role, skipped: !off })}
                    style={{ minWidth: 44, minHeight: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 7, background: 'none', border: `1px solid ${off ? 'var(--accent)' : 'var(--line)'}`, color: off ? 'var(--accent)' : 'var(--muted)', cursor: 'pointer', flex: '0 0 auto', padding: 0 }}>
                    <NIc name={off ? 'refresh' : 'skip'} size={13} />
                  </button>
                </>
              )}
            </div>
            );
          })}
        </div>
        <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, color: 'var(--muted)', borderTop: '1px solid var(--line)', paddingTop: 12 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><NIc name="clock" size={14} /> Prep: {meal.minutes} min</span>
          <span style={{ width: 1, height: 12, background: 'var(--line)' }} />
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><NIc name="flame" size={14} /> {Math.round(meal.totals.kcal)} kcal</span>
          {people > 1 && (
            <>
              <span style={{ width: 1, height: 12, background: 'var(--line)' }} />
              {/* Household view: the plan composes one plate, so what the table
                  needs is that plate multiplied. Per-member portions (who gets
                  how much, and any protein swap) live in the Portions card. */}
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                🍽 {Math.round(meal.totals.kcal * people)} kcal for {people}
              </span>
            </>
          )}
        </div>
        {/* This meal's own macros, not just its calories.
            `meal.totals` has carried protein, carbs, fat and fibre all along and
            the card printed only kcal — so a plate could be judged as a number
            of calories with no way to see what those calories were made of, on
            the one screen where swapping a single dish is a button away. The
            day's totals are in the rail; these are the section's. */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 11.5, color: 'var(--muted)', marginTop: 7 }}>
          <span>P <strong style={{ color: 'var(--ink-soft)' }}>{Math.round(meal.totals.protein)}g</strong></span>
          <span>C <strong style={{ color: 'var(--ink-soft)' }}>{Math.round(meal.totals.carbs)}g</strong></span>
          <span>F <strong style={{ color: 'var(--ink-soft)' }}>{Math.round(meal.totals.fat)}g</strong></span>
          <span>Fibre <strong style={{ color: 'var(--ink-soft)' }}>{Math.round(meal.totals.fiber)}g</strong></span>
        </div>
        {!readOnly && (
          <div style={{ display: 'flex', gap: 16, marginTop: 11 }}>
            <button type="button" disabled={busy} onClick={() => refresh.mutate({ day: dayIndex, slot: meal.slot })} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}><NIc name="refresh" size={13} /> {refresh.isPending ? '…' : 'Refresh'}</button>
            <button type="button" disabled={busy} onClick={() => skip.mutate({ day: dayIndex, slot: meal.slot, skipped: true })} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}><NIc name="skip" size={13} /> {skip.isPending ? '…' : 'Skip'}</button>
          </div>
        )}
      </div>
    </div>
  );
}
