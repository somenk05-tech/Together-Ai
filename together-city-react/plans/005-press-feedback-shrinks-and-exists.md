# 005 — Press feedback must shrink, and the touch primitives must have it

- **Status**: TODO
- **Commit**: 30675c9
- **Severity**: HIGH (the inversion) / LOW (the missing states)
- **Category**: Physicality & origin (3)
- **Estimated scope**: 1 inline `<style>` string + 3 CSS files; ~8 rules added, 1 corrected

## Problem

**(a) One press state is inverted and 28%.**

```css
/* src/features/entertainment/pages/movieKit.tsx:66-68 — current */
.mvk-bm{ … transition:transform .18s ease,background .18s ease}
.mvk-bm:hover{transform:scale(1.12);background:rgba(0,0,0,.65)}
.mvk-bm:active{transform:scale(1.28)}
```

The playbook's press target is `scale(0.97)` — a shrink, in the 0.95–0.98 band. This grows by 28%,
so the bookmark button leaps out from under the finger at the exact moment it is pressed. On touch
there is no hover stage, so the 1.12 → 1.28 progression is not even visible as a progression: the
first thing a finger does is make the button jump.

**(b) The primary touch targets have a hover lift and no press state at all.**

Only **10** `:active` rules exist repo-wide (`src/index.css:49`; `src/styles/relief.css:280, 303,
593, 652, 663, 857`; `src/styles/layout.css:243`; `src/features/auth/pages/SignIn.tsx:108`;
`src/features/entertainment/pages/movieKit.tsx:68`). All are buttons or nav.

Not among them, though every one is a tap target:

| File:line | Selector | What it is |
|---|---|---|
| `src/index.css:99` | `.pcard` | the signature hub grid tile |
| `src/styles/relief.css:177` | `.case` | the photo case |
| `src/styles/relief.css:934` | `.social-tile` | the profile photo wall |
| `src/index.css:177` | `.row` | the list-row primitive |
| `src/styles/relief.css:374` | `.pill`, `.chip` | filter pills **and the mobile hub nav** |
| `src/styles/relief.css:674` | `.mode-tab` | mode tabs |
| `src/styles/relief.css:1344` | `.poster` | entertainment posters |

On touch there is no hover, so tapping any of these produces literally zero feedback before the
navigation happens. Combined with plan 001 (which removes the false-hover lift these currently
get on tap), they would have *nothing* — which is why 001 and 005 should land together.

## Target

```css
/* target — src/features/entertainment/pages/movieKit.tsx, replacing the :active rule */
.mvk-bm:active{transform:scale(.97)}
```

```css
/* target — the shape every added press state takes */
.pcard:active { transform: scale(.985); }
```

Press feedback on a **large** surface (a card, a tile, a row) uses `scale(.985)`, not `.97`: a 3%
shrink on a 400px-wide tile is a 12px move and reads as a glitch. `.97` is for small controls
(buttons, chips, the bookmark disc). Both sit inside the playbook's 0.95–0.98 band at the scale
they are applied to.

The transition already exists on all of these elements from the `--dur-base` / `--ease-out` rules;
the playbook's press timing is 100–160ms, so give the `:active` leg its own faster transform
timing where the element does not already have one:

```css
/* target — where the element's existing transition is slower than 160ms */
.pcard { transition: transform var(--dur-fast) var(--ease-out), box-shadow var(--dur-base) var(--ease); }
```

`--dur-fast` is 130ms, inside the band.

## Repo conventions to follow

- Exemplar of a correct press state already in this repo: `src/styles/relief.css:280` —
  `.btn:not(:disabled):active { transform: translateY(1px); background: var(--well); box-shadow: var(--press); }`.
  Note it pairs the transform with the `--press` depth. Use `--press` on the added rules too where
  the element already carries a depth; it is one of the five named depths and inventing a sixth
  fails `relief.spec.ts`.
- `:active` rules go immediately after the matching `:hover` rule in the same file.
- `movieKit.tsx` holds its CSS as a template-literal `<style>` string — edit in place.

## Steps

1. `src/features/entertainment/pages/movieKit.tsx:68` — change `scale(1.28)` to `scale(.97)`.
2. `src/index.css` — add `.pcard:active { transform: scale(.985); box-shadow: var(--press); }` and
   `.row:active { transform: scale(.995); }` after their respective `:hover` rules.
   (`.row` is full-width; `.995` is the right magnitude there.)
3. `src/styles/relief.css` — add `:active` rules after the `:hover` rules at lines 177 (`.case`),
   374 (`.pill, .chip`), 674 (`.mode-tab`), 934 (`.social-tile`), 1344 (`.poster`). Use
   `scale(.97)` for `.pill`/`.chip`/`.mode-tab` (small controls) and `scale(.985)` for `.case`,
   `.social-tile`, `.poster` (large surfaces).
4. For each element edited, check its existing `transition` declaration. If the transform leg is
   slower than 160ms (most read `var(--dur-base)`, 220ms), leave it — a 220ms release is
   acceptable — but do NOT introduce a slower one.
5. Do NOT wrap `:active` in `@media (hover: hover)`. Press feedback is exactly what touch needs;
   that is the point of this plan.

## Boundaries

- Do NOT change any `:hover` rule. Plan 001 owns those and the two plans will conflict.
- Do NOT change background or colour on `:active` except where the exemplar's `var(--well)` /
  `var(--press)` pattern already applies. No new colours — `relief.spec.ts` forbids colour outside
  `tokens.css`.
- Do NOT invent a shadow. Use `--press` or nothing.
- Do NOT add dependencies.
- **Depends on plan 002** for `--ease-out` if you touch any transition line.

## Verification

- **Mechanical**: `npx vitest run src/app/relief.spec.ts` → 26 passed (this catches an invented
  sixth depth and any stray colour literal); `npx tsc --noEmit` clean;
  `grep -rc ":active" src/ | awk -F: '{s+=$2}END{print s}'` should be ≥ 17, up from 10.
- **Feel check**: DevTools → device toolbar → a touch device.
  - Press and hold a `.pcard`. It must shrink slightly and hold, then return on release.
  - Press and hold the bookmark disc on an entertainment poster (`.mvk-bm`). It must **shrink**,
    not grow. This is the one to check first.
  - Press a `.chip` in the mobile hub nav. Visible feedback before the route changes.
  - Confirm no element's press moves it more than a few pixels — at 10% playback in the Animations
    panel, the shrink should be barely perceptible in distance but clearly present in timing.
- **Done when**: `scale(1.28)` appears nowhere; all seven primitives listed above have a `:active`
  transform; nothing grows on press.
