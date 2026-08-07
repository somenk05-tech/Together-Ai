# 004 — Stop `tc-pop` scaling a full-width feed card from 0.4 to 1.15

- **Status**: TODO
- **Commit**: 30675c9
- **Severity**: HIGH
- **Category**: Physicality & origin (3)
- **Estimated scope**: 1 keyframe in 1 CSS file; 3 consumers verified, none edited

## Problem

```css
/* src/index.css:256 — current */
@keyframes tc-pop { 0%{transform:scale(.4);opacity:0} 60%{transform:scale(1.15)} 100%{transform:scale(1);opacity:1} }
```

```tsx
/* src/features/social/PostCard.tsx:233 — current */
<article className="card" style={{ marginBottom: 16, ...(isNew ? { boxShadow: '0 0 0 2px var(--accent)', animation: 'tc-pop .3s ease-out' } : {}) }}>
```

Two defects in one keyframe:

1. **`scale(.4)` is far below the 0.9–0.97 floor.** Nothing in the real world appears from nearly
   nothing. On a full-width `<article className="card">` in the social feed this reads as the post
   inflating rather than arriving.
2. **The `1.15` overshoot at 60% blows the card ~15% past its own container**, mid-animation,
   overlapping the posts above and below it.

It fires on every newly-arrived post in a scrolling feed — a frequent surface, not a rare one.

Two other consumers exist and are **not** broken by the current values because the elements are
tiny (a ✓ glyph and a handle-suggestion button): `src/features/auth/pages/RegisterForm.tsx:144`
and `:153`. The fix below is safe for those too — verify, do not edit them.

## Target

```css
/* target — src/index.css:256, replacing the keyframe */
/* 0.4 was below the physicality floor and 1.15 pushed a full-width card past
   its own container. 0.96 -> 1 with no overshoot: the card arrives, it does not
   inflate. */
@keyframes tc-pop { from { transform: scale(.96); opacity: 0 } to { transform: scale(1); opacity: 1 } }
```

```css
/* target — src/index.css:260, the class that uses it */
.tc-pop { animation: tc-pop var(--dur-base) var(--ease-out) both; }
```

```tsx
/* target — src/features/social/PostCard.tsx:233, duration + easing only */
animation: 'tc-pop var(--dur-base) var(--ease-out)'
```

220ms sits inside the playbook's band for an element arriving in place.

## Repo conventions to follow

- Keyframes live in `src/index.css` alongside their class. Exemplar of a correctly-scaled
  entrance already in the repo: `@keyframes sheetIn` at `src/styles/relief.css` —
  `from { opacity: 0; transform: translateY(10px) scale(.985); }`. `.985` is the house floor;
  `.96` here is deliberately a little lower because this element also has no travel.
- `--ease-out` comes from plan 002; `--dur-base` already exists (`tokens.css:382`, 220ms).
- Inline `animation:` strings in `.tsx` may reference custom properties — `PostCard.tsx` already
  reads `var(--accent)` on the same line.

## Steps

1. `src/index.css:256` — replace the `tc-pop` keyframe with the targeted two-stop version.
2. `src/index.css:260` — replace `.tc-pop { animation: tc-pop .28s ease-out both; }` with the
   targeted rule.
3. `src/features/social/PostCard.tsx:233` — change the inline string from `'tc-pop .3s ease-out'`
   to `'tc-pop var(--dur-base) var(--ease-out)'`. Change nothing else on that line; the
   `boxShadow` ring is the "new post" signal and stays.
4. Read `src/features/auth/pages/RegisterForm.tsx:144` and `:153` and confirm they use the
   `.tc-pop` class or the keyframe name. Do not edit them — just confirm the new values do not
   make those elements invisible (0.96 vs 0.4 is a smaller move, so they will be subtler; that is
   correct).
5. Add a reduced-motion gate beside the class if one does not already cover it:
   ```css
   @media (prefers-reduced-motion: reduce) { .tc-pop { animation: none; } }
   ```

## Boundaries

- Do NOT change the `boxShadow: '0 0 0 2px var(--accent)'` ring on the new post. That is the
  state signal, not the animation.
- Do NOT change the `isNew` logic or anything else in `PostCard.tsx`.
- Do NOT touch `tc-rise`, `tc-shake` or `tc-spin`.
- Do NOT add dependencies.
- **Depends on plan 002** for `--ease-out`.

## Verification

- **Mechanical**: `npx vitest run src/app/relief.spec.ts` → 26 passed; `npx tsc --noEmit` clean.
- **Feel check**: run the app, go to the social feed, and create a post so `isNew` is true.
  - The new card must NOT visibly shrink-then-grow. It should appear at very close to full size
    and settle.
  - Watch the posts directly above and below it: neither should be overlapped at any point.
  - DevTools → Animations at 10% playback: confirm the card never exceeds `scale(1)`.
  - DevTools → Rendering → reduced motion: the card appears instantly with its accent ring, no scale.
- **Done when**: the keyframe has two stops, no value exceeds 1, and a new post arrives without
  overlapping its neighbours.
