# 002 — Retire `--spring`; the component library should not bounce

- **Status**: TODO
- **Commit**: 30675c9
- **Severity**: HIGH
- **Category**: Cohesion & tokens (7)
- **Estimated scope**: 1 token file + 13 rules across 2 CSS files

## Problem

```css
/* src/styles/tokens.css:384 — current */
--spring: cubic-bezier(.34,1.42,.5,1);
```

The y control point is **1.42**: the animated value overshoots its target by up to ~42% and settles
back. That is a visible bounce.

It is not scoped to a playful surface. All 13 readers are flat, unscoped, global rules that define
the base component library:

| File:line | Selector | What it drives |
|---|---|---|
| `src/styles/relief.css:155` | `.case` | photo case hover |
| `src/styles/relief.css:241` | `.card, .stat, .row, .console, .mincal, .modal, table.tc, .blk > .card, .pcard` | **every card and list row in the app** |
| `src/styles/relief.css:373` | `.pill, .chip` | every filter pill and the mobile hub nav |
| `src/styles/relief.css:529` | `.modal .opt` | modal options |
| `src/styles/relief.css:615` | `.side-menu a` | the hub rail — the most-traversed element in the app |
| `src/styles/relief.css:672` | `.mode-tab` | mode tabs |
| `src/styles/relief.css:854` | `.hub-plate-cta` | hub landing CTA |
| `src/styles/relief.css:932` | `.social-tile` | the profile photo wall |
| `src/styles/relief.css:1013` | `.g-key` | Social Life glass keys |
| `src/styles/layout.css:174` | `.letter-past .letter-link` | astrology letter list |
| `src/styles/layout.css:214` | `.ask-chip` | astrology question chips |
| `src/styles/layout.css:255` | `.ask-past` | astrology consultation cards |
| `src/styles/layout.css:276` | `.tarot-back-face` | tarot card hover (also 420ms — see step 4) |

Every one of these drives a **hover** transform of 1.5–6px. Together City is a dense daily-use
product/dashboard, not a playful consumer toy; the audit playbook reserves visible bounce for
drag-to-dismiss and deliberate delight moments. No comment in `tokens.css`, `relief.css` or
`layout.css` argues for the overshoot.

## Target

`--spring` is deleted from `tokens.css` and every reader switches to a strong ease-out. Add the
playbook's ease-out curve as a token — the repo's only easing token today is `--ease`, which is
`cubic-bezier(.22,.61,.36,1)`, a weaker curve intended as the general default.

```css
/* target — src/styles/tokens.css, replacing line 384 */
/* THE COMPONENT LIBRARY DOES NOT BOUNCE. --spring was cubic-bezier(.34,1.42,.5,1):
   a 42% overshoot, applied to the hover lift on every card, row, pill, chip and
   rail key in a dense daily-use product. Visible bounce is reserved for
   drag-to-dismiss and deliberate delight, neither of which exists here. */
--ease-out: cubic-bezier(0.23, 1, 0.32, 1);
```

Every `var(--spring)` becomes `var(--ease-out)`:

```css
/* target — src/styles/relief.css:241 */
transition: transform var(--dur-base) var(--ease-out), box-shadow var(--dur-base) var(--ease);
```

## Repo conventions to follow

- All tokens live at `:root` in `src/styles/tokens.css`. `relief.spec.ts` asserts that no CSS
  references a custom property nobody defines — so `--ease-out` **must** be declared before any
  rule uses it, and `--spring` must have zero readers before it is deleted.
- Token declarations in this file carry a comment explaining the decision when the decision is not
  obvious. Exemplar: `src/styles/tokens.css:352-357`, the `--sky-image` block.
- `relief.spec.ts` also has a dead-token check. A token nobody reads is a finding in this codebase
  — `--accent-lit` and `--btn-line-bg` were both deleted for exactly this. So delete `--spring`;
  do not leave it declared "just in case".

## Steps

1. `src/styles/tokens.css:384` — replace the `--spring` declaration with the `--ease-out`
   declaration and comment shown under **Target**.
2. `src/styles/relief.css` — replace `var(--spring)` with `var(--ease-out)` at lines 155, 241, 373,
   529, 615, 672, 854, 932, 1013.
3. `src/styles/layout.css` — replace `var(--spring)` with `var(--ease-out)` at lines 174, 214, 255,
   276.
4. At `src/styles/layout.css:276` **also** change both `var(--dur-slow)` occurrences to
   `var(--dur-base)`. `--dur-slow` is 420ms and this is a hover lift; the playbook's ceiling for UI
   is 300ms and its hover band is far below that. After this edit `--dur-slow` has zero readers —
   leave the token declared for now; plan 011 decides its fate.
5. Confirm `grep -rn "var(--spring)" src/` returns nothing before running the tests.

## Boundaries

- Do NOT change any `transform` value, distance, or the `box-shadow` legs of these transitions.
  Only the easing function (and, at layout.css:276 only, the duration) changes.
- Do NOT touch the `--ease` token or its 25 readers.
- Do NOT delete `--dur-slow` in this plan.
- Do NOT touch `src/app/relief.spec.ts`.
- Do NOT add dependencies.
- If any cited line does not read `var(--spring)`, STOP and report.

## Verification

- **Mechanical**: `npx tsc --noEmit` clean; `npx vitest run src/app/relief.spec.ts` 26 passed
  (this is the one that catches an undefined custom property, so it is the real gate);
  `grep -rc "spring" src/styles/` returns 0.
- **Feel check**: run the app on a desktop viewport with a mouse.
  - Hover a card in any hub grid. In DevTools → Animations panel, set playback speed to 10% and
    watch the lift: it must rise and **stop**, with no settle-back past the target.
  - Sweep the pointer down the hub sidebar rail. The keys should feel crisp, not springy.
  - Hover a tarot card on `/astrology/tarot`. It should now settle in 220ms, not 420ms.
- **Done when**: `var(--spring)` appears nowhere in `src/`; every hover lift resolves without
  overshoot at 10% playback speed; `relief.spec.ts` passes.
