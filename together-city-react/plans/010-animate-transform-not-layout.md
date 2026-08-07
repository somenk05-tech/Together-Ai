# 010 — Animate `transform`, not layout, on the two thrashing surfaces

- **Status**: TODO
- **Commit**: 30675c9
- **Severity**: MEDIUM
- **Category**: Performance (5)
- **Estimated scope**: 2 components; also lowers one over-budget blur

## Problem

**(a) A per-second timer bar transitions `width`.**

```tsx
/* src/features/nutrition/components/CookMode.tsx:215 — current */
width: `${step.durationSec ? Math.round((1 - s.remain / step.durationSec) * 100) : 0}%`, transition: 'width .4s linear'
```

This is a cooking countdown, so the value changes **every second** and the `width` transition is
therefore continuously in flight for the entire duration of a cooking step. `width` triggers
layout + paint + composite on every frame — indefinitely, on a screen the user leaves open while
cooking. The 400ms duration also means the bar is always ~400ms behind the number beside it.

The same `transition: width` pattern exists at `src/features/nutrition/components/CookMode.tsx:232`,
`src/features/beauty/pages/Profile.tsx:544`, `src/features/financial/pages/Budgets.tsx:32`,
`src/features/financial/pages/Spending.tsx:48` and
`src/features/nutrition/components/GroceryPlanner.tsx:345` — those are one-shot, so they are lower
priority, but the same fix applies.

**(b) A button transitions `flex` and a non-interpolable `width`.**

```tsx
/* src/features/social/pages/CreatePost.tsx:779, 785 — current */
flex: busy ? 'none' : 2, width: busy ? 150 : undefined,
…
transition: 'flex .35s ease, width .35s ease, background .25s ease',
```

Animating `flex` re-runs flex layout for the whole row on every frame. Worse, `width: undefined`
is `auto`, and `auto → 150px` is **not interpolable** — so the width leg snaps while the flex leg
tweens, and the neighbouring buttons in the row are dragged along for the full 350ms.

**(c) A 24px backdrop-filter animates over the full viewport.**

```css
/* src/components/share/UniversalShareSheet.tsx:260 — current */
-webkit-backdrop-filter:blur(24px) saturate(160%);backdrop-filter:blur(24px) saturate(160%);
```

24px exceeds the 20px transition-time ceiling, and it is a *backdrop* filter — the blurred region
is re-sampled from the page behind on every frame while the sheet translates and scales, on top of
the overlay's own 10px blur fading in simultaneously. Two stacked live blurs over the whole
viewport for 260ms.

## Target

**(a)** Drive the bar with `transform: scaleX()` on a full-width element, which is composited:

```tsx
/* target — CookMode.tsx:215 */
/* Was `width: N%` with `transition: width .4s linear`, re-triggered every second:
   layout+paint+composite on every frame for the whole cooking step. scaleX is
   composited and costs nothing per frame. */
<div style={{ transformOrigin: 'left', width: '100%',
  transform: `scaleX(${step.durationSec ? (1 - s.remain / step.durationSec) : 0})`,
  transition: 'transform 1s linear' }} />
```

`1s linear` matches the tick interval exactly, so the bar moves continuously instead of
catching up in 400ms bursts.

**(b)** Fix the width to a stable pair of values so the leg is interpolable, and drop the `flex`
transition:

```tsx
/* target — CreatePost.tsx:779, 785 */
flex: busy ? 'none' : 2, width: busy ? 150 : 'auto', minWidth: 150,
…
transition: 'background var(--dur-base) var(--ease-out)',
```

If a size change is still wanted, animate `transform: scaleX()` on an inner span rather than the
button's own box.

**(c)** Lower the sheet blur to 18px:

```css
/* target — UniversalShareSheet.tsx:260 */
-webkit-backdrop-filter:blur(18px) saturate(160%);backdrop-filter:blur(18px) saturate(160%);
```

## Repo conventions to follow

- Inline style objects are the norm in `.tsx` here; keep them. Do not extract to CSS files.
- `--dur-base` (220ms) is at `src/styles/tokens.css:382`; `--ease-out` comes from plan 002.
- Exemplar of a correctly composited progress indicator already in the repo:
  `src/index.css:206` drives a ring with `stroke-dashoffset` — that is also not composited, but it
  is one-shot, so it is out of scope here. Do not "fix" it in this plan.

## Steps

1. `src/features/nutrition/components/CookMode.tsx:215` — replace the `width`/`transition: width`
   pair with the `transform: scaleX()` version. The parent must have a fixed width and
   `overflow: hidden`; read the surrounding JSX and confirm before editing.
2. `src/features/nutrition/components/CookMode.tsx:232` — same treatment for the second bar.
3. `src/features/social/pages/CreatePost.tsx:779, 785` — apply the target. Verify the button does
   not visibly resize on submit in a way that breaks the row; if it does, keep `flex` static and
   change nothing else.
4. `src/components/share/UniversalShareSheet.tsx:260` — 24px → 18px.
5. Leave `Budgets.tsx:32`, `Spending.tsx:48`, `beauty/Profile.tsx:544` and `GroceryPlanner.tsx:345`
   alone in this plan. They are one-shot and lower priority; note them in your report as follow-up.

## Boundaries

- Do NOT change any timer logic, cooking-step logic, or post-submit logic. Motion and layout
  properties only.
- Do NOT change the visual size, colour or radius of the bars.
- Do NOT add dependencies.
- **Depends on plan 002** for `--ease-out`.

## Verification

- **Mechanical**: `npx tsc --noEmit` clean; `npx vitest run` → 356 passed.
- **Feel check**:
  - Start a guided cook step with a timer. Open DevTools → Performance and record 5 seconds. In
    the flame chart there should be **no per-frame Layout bar** for the progress bar. Before this
    change there is one every frame.
  - Watch the bar itself: it should advance continuously and stay level with the numeric countdown,
    not lag ~400ms behind it.
  - Submit a post from CreatePost: the buttons either side of the share button must not shift
    during the 350ms.
  - Open the share sheet and watch the background: the blur should still read as frosted, and the
    open should feel smoother on a mid-range phone.
- **Done when**: `transition: 'width` appears in neither `CookMode.tsx` line, `transition: 'flex`
  appears nowhere in `CreatePost.tsx`, and no blur above 20px is animated.
