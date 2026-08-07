# 003 — Bring `.rise` under budget and make `d1`–`d4` real (or remove them)

- **Status**: TODO
- **Commit**: 30675c9
- **Severity**: HIGH
- **Category**: Purpose & frequency (1) / Cohesion & tokens (7)
- **Estimated scope**: 1 CSS file (2 rules added/changed). No .tsx changes.

## Problem

Two findings, one rule.

**(a) The duration is double the ceiling.**

```css
/* src/index.css:135-136 — current */
@keyframes rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
.rise { animation: rise .6s ease-out both; }
```

600ms against a 300ms ceiling for UI. `.rise` is the most-used motion in the application:
**95 occurrences across 22 files**, including pages a citizen opens daily —
`src/features/entertainment/pages/Ott.tsx` carries 17, `Movies.tsx` 11,
`src/features/social/pages/Profile.tsx` 11, `src/features/restaurants/pages/Explore.tsx` 7.

**(b) The stagger classes do not exist.**

`.d1`, `.d2`, `.d3` and `.d4` are used **49 times across 12 files** as if they were stagger
delays. They are defined **nowhere** — not in `index.css`, `styles/relief.css`, `styles/layout.css`,
`styles/tokens.css`, nor in any inline `<style>` string. Independently: `animation-delay` and
`animationDelay` appear **zero times** in `src/`.

So this:

```tsx
/* src/features/entertainment/pages/Movies.tsx:92-93 — current */
<div className="blk-head rise d2">…</div>
<div className="grid4 rise d2" style={{ marginBottom: 44 }}>
```

…is 17 elements on Ott, or 11 on Movies, all firing the same 600ms 14px slide at the same
instant. The author's intent was a cascade; what ships is a whole-page lurch, every day.

## Target

```css
/* target — src/index.css, replacing line 136 */
/* 280ms, not 600. This is the most-used motion in the application (95 sites)
   and it lands on pages a citizen opens daily; the UI budget is 300ms. */
.rise { animation: rise var(--dur-rise) var(--ease-out) both; }

/* d1-d4 were used in 49 places and defined in none. They are offsets now.
   30-80ms is the stagger band; 60ms reads as a cascade without delaying the
   last element past the point where the page feels ready. */
.rise.d1 { animation-delay:  60ms; }
.rise.d2 { animation-delay: 120ms; }
.rise.d3 { animation-delay: 180ms; }
.rise.d4 { animation-delay: 240ms; }
```

```css
/* target — src/styles/tokens.css, added beside the existing duration tokens at :root */
--dur-rise: 280ms;
```

`--ease-out` is the token plan 002 introduces. **This plan depends on 002 having landed.**

## Repo conventions to follow

- Durations and easings are tokens at `:root` in `src/styles/tokens.css` (currently `--dur-fast`,
  `--dur-base`, `--dur-slow`, `--ease`). `relief.spec.ts` fails on a custom property nobody
  defines, so `--dur-rise` must be declared there before `index.css` reads it.
- `.rise` and its keyframes live together at `src/index.css:135-136`. Keep the new rules adjacent.
- Exemplar of an existing correctly-scoped entrance in this repo:
  `src/styles/relief.css:781-783` — `.hub-plate` animates, and the very next line gates it with
  `@media (prefers-reduced-motion: reduce) { .hub-plate { animation: none; } }`.

## Steps

1. `src/styles/tokens.css` — add `--dur-rise: 280ms;` to the existing duration line at `:root`
   (currently line 382, `--dur-fast: 130ms; --dur-base: 220ms; --dur-slow: 420ms;`).
2. `src/index.css:136` — replace the `.rise` rule with the targeted one.
3. `src/index.css` — immediately after it, add the four `.rise.dN` delay rules exactly as written
   under **Target**. Scope them to `.rise.dN`, not bare `.dN`, so the class names cannot leak onto
   unrelated elements.
4. Add a reduced-motion gate immediately after, matching the `.hub-plate` exemplar:
   ```css
   @media (prefers-reduced-motion: reduce) { .rise, .rise.d1, .rise.d2, .rise.d3, .rise.d4 { animation: none; } }
   ```
5. Change **no** `.tsx` file. All 49 `dN` usages become correct the moment the CSS exists.

## Boundaries

- Do NOT alter the `@keyframes rise` definition — the 14px travel and the opacity ramp are fine;
  only the duration, easing and delays change.
- Do NOT remove `.rise` from any component. Whether an individual page should animate at all is a
  separate question and NOT this plan's job.
- Do NOT touch `.tc-rise`, `.tc-riser`, `.tc-pop` or `.tc-shake` — different rules, different plans.
- Do NOT add dependencies.
- **Depends on plan 002** for `--ease-out`. If `--ease-out` is not yet declared in `tokens.css`,
  STOP and run 002 first rather than inlining the curve.

## Verification

- **Mechanical**: `npx vitest run src/app/relief.spec.ts` → 26 passed (catches the undefined
  custom property if `--dur-rise` or `--ease-out` is missing). `npx tsc --noEmit` clean.
- **Feel check**: run the app and open `/entertainment/movies` — the page with 11 `.rise` elements
  across `d1`–`d4`.
  - The page should now enter as a cascade top-to-bottom, not as one block.
  - Nothing should still be moving ~500ms after navigation.
  - In DevTools → Animations, set playback to 10% and confirm the four delay groups are visibly
    offset from each other.
  - In DevTools → Rendering, enable "Emulate CSS prefers-reduced-motion: reduce" and reload: the
    page must appear with no slide and no delay at all.
- **Done when**: `grep -n "\.rise" src/index.css` shows a 280ms duration and four delay rules;
  `/entertainment/ott` enters as a cascade; reduced motion shows a static page.
