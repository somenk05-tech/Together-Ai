# 008 — Give toasts an exit, and stop the stack teleporting

- **Status**: TODO
- **Commit**: 30675c9
- **Severity**: MEDIUM
- **Category**: Interruptibility (4)
- **Estimated scope**: 1 component, ~30 lines

## Problem

```tsx
/* src/layouts/NotificationToaster.tsx:25 — current */
setToasts((prev) => [...prev.slice(-2), t]); // keep at most 3 stacked
```

```tsx
/* src/layouts/NotificationToaster.tsx:40-47 — current */
<div style={{ position: 'fixed', top: 16, right: 16, zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 340 }}>
  {toasts.map((t) => (
    <button key={t.id} type="button"
      onClick={() => { setToasts((prev) => prev.filter((x) => x.id !== t.id)); if (t.href) nav(t.href); }}
      style={{ …, animation: 'tc-rise .28s ease-out' }}>
```

Three defects in one stack:

1. **The entry is a keyframe**, so an arriving toast restarts from zero regardless of what the
   stack is doing. Keyframes cannot retarget; transitions can.
2. **There is no exit animation at all.** Both the 5000ms timer and the click handler `filter()`
   the toast out of state, so it vanishes in a single frame.
3. **`slice(-2)` evicts the oldest** when a fourth arrives, and the container is a plain
   `flex-direction: column` with `gap: 8` — so every surviving toast **teleports up** by its
   predecessor's height with no transition. This is an app-wide sync feed; a burst of
   notifications produces a jumping column.

## Target

Two-phase removal driven by a `leaving` flag, and a CSS transition (not a keyframe) so a rapidly
arriving toast retargets instead of restarting.

```tsx
/* target — state shape */
type Shown = Toast & { leaving?: boolean };

const dismiss = (id: string) => {
  setToasts((prev) => prev.map((x) => (x.id === id ? { ...x, leaving: true } : x)));
  window.setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 200);
};
```

```tsx
/* target — the item's style, replacing the `animation:` line */
opacity: t.leaving ? 0 : 1,
transform: t.leaving ? 'translateX(12px)' : 'translateX(0)',
transition: 'opacity var(--dur-fast) var(--ease-out), transform var(--dur-base) var(--ease-out)',
```

For the mount-in state, set the initial values on first paint via a `data-mounted` attribute set in
a `useEffect` — the repo has no `@starting-style` usage and this is the documented fallback:

```tsx
/* target — mount transition without a keyframe */
const [mounted, setMounted] = useState(false);
useEffect(() => { const r = requestAnimationFrame(() => setMounted(true)); return () => cancelAnimationFrame(r); }, []);
```

Eviction uses the same `dismiss` path so the departing toast animates out rather than disappearing:

```tsx
/* target — replacing slice(-2) */
setToasts((prev) => {
  const live = prev.filter((x) => !x.leaving);
  if (live.length >= 3) dismiss(live[0].id);
  return [...prev, t];
});
```

## Repo conventions to follow

- `--dur-fast` (130ms) and `--dur-base` (220ms) exist at `src/styles/tokens.css:382`. `--ease-out`
  comes from plan 002. Inline style objects in this repo already reference custom properties —
  exemplar on the same component, `color: 'var(--accent-ink)'` at line 48.
- Exemplar of a two-phase close already in this repo:
  `src/components/share/UniversalShareSheet.tsx:322-345` sets a `closing` flag, plays an exit, and
  calls `onClose()` after a constant. Imitate the shape; do NOT copy its 230ms constant (plan 009
  is fixing a bug in exactly that mechanism).
- Do not introduce a keyframe. Transitions retarget; that is the whole point of this plan.

## Steps

1. `src/layouts/NotificationToaster.tsx` — widen the toast type with an optional `leaving` flag.
2. Add the `dismiss(id)` helper shown under **Target**. Route the click handler through it,
   keeping the `nav(t.href)` navigation immediate (do not delay navigation by 200ms).
3. Route the 5000ms auto-expiry timer through `dismiss` as well.
4. Replace the `slice(-2)` eviction with the version that dismisses the oldest live toast.
5. Replace `animation: 'tc-rise .28s ease-out'` with the `opacity`/`transform`/`transition` triple.
6. Add the `mounted` effect so the first paint has `opacity: 0` and the second has `opacity: 1`.
7. Add a reduced-motion branch: if `window.matchMedia('(prefers-reduced-motion: reduce)').matches`,
   set the dismiss timeout to 0 and skip the transform leg (keep opacity). Exemplar:
   `src/components/share/UniversalShareSheet.tsx:343-344` does exactly this.

## Boundaries

- Do NOT change what triggers a toast, the 5000ms lifetime, the `maxWidth: 340`, or the visual
  design of the item.
- Do NOT change the "at most 3 stacked" behaviour — only how the fourth one displaces the first.
- Do NOT add an animation library.
- Do NOT touch `tc-rise` in `src/index.css`; other components use it.
- **Depends on plan 002** for `--ease-out`.

## Verification

- **Mechanical**: `npx tsc --noEmit` clean; `npx vitest run` → 356 passed.
- **Feel check**: trigger notifications (or temporarily call the toast helper from a button in
  dev).
  - A single toast must fade **and** slide out to the right when dismissed, not vanish.
  - Fire four toasts in quick succession: the oldest must animate away and the survivors must
    slide up smoothly, with no jump.
  - Click a toast: it should navigate immediately while the toast animates out behind the
    navigation.
  - DevTools → Animations at 10%: firing a new toast while another is entering must not restart
    the first one.
  - DevTools → Rendering → reduced motion: toasts appear and disappear with opacity only, no slide.
- **Done when**: no toast ever disappears in a single frame, and a burst of four produces no
  vertical jump.
