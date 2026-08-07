# 006 — Complete the reduced-motion allowlist

- **Status**: TODO
- **Commit**: 30675c9
- **Severity**: MEDIUM
- **Category**: Accessibility (6)
- **Estimated scope**: 1 CSS block extended; ~10 selectors added

## Problem

The global reduced-motion rule only zeroes **durations**:

```css
/* src/index.css:251 — current (abridged) */
@media (prefers-reduced-motion: reduce) {
  * { animation-duration: .01ms; transition-duration: .01ms; scroll-behavior: auto; }
}
```

A duration of `.01ms` does not remove a movement — it makes the movement *instant*. An ungated
hover transform therefore **jumps** under reduced motion rather than not happening, which is worse
than the original. `src/styles/relief.css:966-968` carries a comment documenting exactly this and
patches it with an allowlist:

```css
/* src/styles/relief.css:969-975 — current */
@media (prefers-reduced-motion: reduce) {
  .btn:not(:disabled):hover, .card.lift:hover, .row:hover, .pcard:hover, .case:hover,
  .pill:hover, .chip:hover, .tc-nav a:hover, .side-menu a:hover, .modal .opt:hover,
  .tc-actionbar a:hover, .tc-actionbar button:hover, .tc-actions a:hover, .tc-actions button:hover {
    transform: none;
  }
}
```

The design is documented and correct. What is not covered is the finding. **Ten hover transforms
sit outside the list** and therefore snap:

| File:line | Selector | Movement |
|---|---|---|
| `src/styles/layout.css:278` | `.tarot-back:hover .tarot-back-face` | `translateY(-6px) rotate(-1.2deg)` — the largest uncovered movement in the app, and the interactive centrepiece of the tarot draw |
| `src/styles/relief.css:934` | `.social-tile:hover` | `translateY(-3px)`, on a 3-across photo wall — a mouse crossing it fires a cascade of instant jumps |
| `src/index.css:102` | `.pcard:hover .ph img` | `scale(1.045)` — the allowlist covers `.pcard` but not the nested image, so the tile stops lifting while the photo inside it still snaps 4.5% larger |
| `src/styles/relief.css:674` | `.mode-tab:hover` | `translateY(-1.5px)` |
| `src/styles/relief.css:1344` | `.poster:hover` | transform |
| `src/styles/relief.css:358` | `.btn-discuss:hover` | transform — the allowlist's `.btn` does not match `.btn-discuss` |
| `src/styles/relief.css:856` | `.hub-plate-cta:hover` | `translateY(-2px)` |
| `src/styles/layout.css:216` | `.ask-chip:hover` | transform |
| `src/styles/layout.css:242` | `.ask-cta:hover` | transform |
| `src/styles/layout.css:256` | `.ask-past:hover` | transform |
| `src/features/entertainment/pages/movieKit.tsx:36, 67` | `.mvk-card:hover`, `.mvk-bm:hover` | scale |
| `src/features/auth/pages/SignIn.tsx:107` | `.signin-gold:hover` | transform |

## Target

Every selector above joins the existing allowlist block, keeping its structure and its comment.
Reduced motion means *fewer and gentler*, not zero — so only `transform` is neutralised; the
box-shadow and colour legs of these hovers stay, which is what preserves the feedback.

```css
/* target — src/styles/relief.css:969, the extended block */
@media (prefers-reduced-motion: reduce) {
  .btn:not(:disabled):hover, .card.lift:hover, .row:hover, .pcard:hover, .case:hover,
  .pill:hover, .chip:hover, .tc-nav a:hover, .side-menu a:hover, .modal .opt:hover,
  .tc-actionbar a:hover, .tc-actionbar button:hover, .tc-actions a:hover, .tc-actions button:hover,
  .pcard:hover .ph img, .social-tile:hover, .mode-tab:hover, .poster:hover,
  .btn-discuss:hover, .hub-plate-cta:hover {
    transform: none;
  }
}
```

`layout.css` and the two `.tsx` `<style>` strings get their own matching blocks, because a selector
must live in a file that actually defines it for the cascade to be legible:

```css
/* target — appended to src/styles/layout.css */
/* The transform-specific reduced-motion patch, same argument as relief.css:966-968:
   the global rule only zeroes durations, so an ungated hover transform jumps
   instead of not happening. */
@media (prefers-reduced-motion: reduce) {
  .tarot-back:hover .tarot-back-face, .ask-chip:hover, .ask-cta:hover, .ask-past:hover {
    transform: none;
  }
}
```

## Repo conventions to follow

- The existing allowlist at `src/styles/relief.css:969-975` is the exemplar. Match its shape: one
  `@media (prefers-reduced-motion: reduce)` block, a flat selector list, `transform: none` only.
- Do not use `animation: none` here — these are transitions, not keyframes. `animation: none` is
  the right tool for the keyframe entrances (`.hub-plate`, `.sheet`, `.letter-sky`) and those are
  already handled at `relief.css:783`, `relief.css:962`, `layout.css:183`.
- `movieKit.tsx` and `SignIn.tsx` hold CSS as template-literal `<style>` strings; add the media
  block inside the string.

## Steps

1. `src/styles/relief.css:969` — extend the existing selector list with `.pcard:hover .ph img`,
   `.social-tile:hover`, `.mode-tab:hover`, `.poster:hover`, `.btn-discuss:hover`,
   `.hub-plate-cta:hover`. Keep the comment above it intact.
2. `src/styles/layout.css` — append the new block shown under **Target**, covering
   `.tarot-back:hover .tarot-back-face`, `.ask-chip:hover`, `.ask-cta:hover`, `.ask-past:hover`.
   Place it at the end of the file with the comment.
3. `src/features/entertainment/pages/movieKit.tsx` — inside the `<style>` string, add
   `@media (prefers-reduced-motion: reduce){.mvk-card:hover,.mvk-bm:hover{transform:none}}`.
4. `src/features/auth/pages/SignIn.tsx` — same for `.signin-gold:hover`.
5. Verify `src/index.css:102`'s `.pcard:hover .ph img` is now matched. It is declared in
   `index.css` but neutralised from `relief.css`; both files load, so this works — confirm by
   inspection in the browser, not by reasoning.

## Boundaries

- Do NOT remove or weaken the global rule at `src/index.css:251`. It is doing a different job.
- Do NOT neutralise `box-shadow`, `background` or `color` on these hovers. Reduced motion removes
  movement, not feedback.
- Do NOT touch the three keyframe gates already in place (`relief.css:783`, `relief.css:962`,
  `layout.css:183`).
- Do NOT add dependencies.
- If plan 001 has landed, these hover rules now live inside `@media (hover: hover)` blocks —
  the reduced-motion blocks still work (they are separate queries and both apply), but **read the
  file** and confirm rather than assuming.

## Verification

- **Mechanical**: `npx vitest run src/app/relief.spec.ts` → 26 passed; `npx tsc --noEmit` clean.
- **Feel check**: DevTools → Rendering → "Emulate CSS media feature prefers-reduced-motion: reduce".
  With that on, on a desktop viewport with a mouse:
  - Hover a tarot card at `/astrology/tarot`. It must not move **at all** — no jump, no rotation.
    This is the one that is currently worst.
  - Sweep the pointer across the profile photo wall (`.social-tile`). No tiles should jump.
  - Hover a hub grid tile: the tile must not lift **and** the photo inside must not zoom.
  - In each case the shadow/colour change should still occur, so the element still acknowledges
    the pointer.
- **Done when**: with reduced motion emulated, no `transform` change is observable on hover
  anywhere in the app, while shadow and colour feedback remain.
