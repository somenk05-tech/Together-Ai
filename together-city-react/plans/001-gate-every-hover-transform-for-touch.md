# 001 — Gate every hover transform behind `@media (hover: hover)`

- **Status**: TODO
- **Commit**: 30675c9
- **Severity**: HIGH
- **Category**: Accessibility (6) / Purpose & frequency (1)
- **Estimated scope**: 3 CSS files + 3 inline `<style>` strings in .tsx; ~30 rules, mechanical

## Problem

`@media (hover: hover)` appears **zero times** in `src/`. Every `:hover` transform in the
application therefore fires on touch as a sticky false hover: a tap lifts the element and it
**stays lifted** until the user taps somewhere else. Together City is a dense daily-use product
consumed largely on phones, so this fires on essentially every tap — it is the highest-frequency
motion defect in the codebase.

Representative current code:

```css
/* src/styles/relief.css:242-245 — current */
.card.lift:hover, .row:hover, .pcard:hover, .stat.lift:hover {
  transform: translateY(-3px); box-shadow: var(--e2);
}
```

```css
/* src/styles/relief.css:374 — current */
.pill:hover, .chip:hover { transform: translateY(-1.5px); box-shadow: var(--e2); border-color: transparent; }
```

The full set of rules that apply a `transform` on `:hover` and are therefore in scope:

| File:line | Selector |
|---|---|
| `src/index.css:47` | `.btn:hover` |
| `src/index.css:66` | `.card.lift:hover` |
| `src/index.css:99` | `.pcard:hover` |
| `src/index.css:102` | `.pcard:hover .ph img` |
| `src/index.css:177` | `.row:hover` |
| `src/styles/relief.css:177` | `.case:hover` (verify selector at line) |
| `src/styles/relief.css:242-245` | `.card.lift:hover, .row:hover, .pcard:hover, .stat.lift:hover` |
| `src/styles/relief.css:279` | `.btn:not(:disabled):hover` |
| `src/styles/relief.css:334` | (verify selector at line) |
| `src/styles/relief.css:358` | `.btn-discuss:hover` |
| `src/styles/relief.css:374` | `.pill:hover, .chip:hover` |
| `src/styles/relief.css:531` | `.modal .opt:hover` |
| `src/styles/relief.css:617` | `.side-menu a:hover` |
| `src/styles/relief.css:674` | `.mode-tab:hover` |
| `src/styles/relief.css:856` | `.hub-plate-cta:hover` |
| `src/styles/relief.css:897` | (verify selector at line) |
| `src/styles/relief.css:934` | `.social-tile:hover` |
| `src/styles/relief.css:1017` | `.g-key:not(:disabled):hover` |
| `src/styles/relief.css:1344` | `.poster:hover` |
| `src/styles/layout.css:216` | `.ask-chip:hover` |
| `src/styles/layout.css:242` | `.ask-cta:hover` |
| `src/styles/layout.css:256` | `.ask-past:hover` |
| `src/styles/layout.css:278` | `.tarot-back:hover .tarot-back-face` |
| `src/features/entertainment/pages/movieKit.tsx:36` | `.mvk-card:hover` |
| `src/features/entertainment/pages/movieKit.tsx:67` | `.mvk-bm:hover` |
| `src/features/auth/pages/SignIn.tsx:107` | `.signin-gold:hover` |

## Target

Every rule above that sets `transform` on `:hover` moves inside a hover-capability query. The
exact query, from the audit playbook:

```css
/* target — the shape every one of these takes */
@media (hover: hover) and (pointer: fine) {
  .card.lift:hover, .row:hover, .pcard:hover, .stat.lift:hover {
    transform: translateY(-3px); box-shadow: var(--e2);
  }
}
```

**Non-transform hover properties stay outside the query.** A colour or shadow change on hover is
harmless on touch — it is the sticky *movement* that is the defect. Where a rule sets both, split
it:

```css
/* target — a rule that sets both */
.pill:hover, .chip:hover { box-shadow: var(--e2); border-color: transparent; }
@media (hover: hover) and (pointer: fine) {
  .pill:hover, .chip:hover { transform: translateY(-1.5px); }
}
```

## Repo conventions to follow

- Media queries in this repo are written inline next to the rule they modify, not collected at the
  bottom of the file. Exemplar: `src/styles/relief.css:969-975`, which wraps a list of hover
  selectors in `@media (prefers-reduced-motion: reduce)` immediately after the rules themselves.
- `src/features/entertainment/pages/movieKit.tsx` and `src/features/auth/pages/SignIn.tsx` hold
  their CSS as a template-literal `<style>` string. Edit the string in place; do not extract it to
  a `.css` file.
- Shadow values must remain one of the five named depths (`--e1`…`--e3`, `--e1-key`, `--e2-key`).
  Do not invent a shadow while you are in here.

## Steps

1. `src/index.css` — for each of lines 47, 66, 99, 102, 177, split the `transform` declaration out
   of the `:hover` rule into a new `@media (hover: hover) and (pointer: fine)` block placed
   immediately after the original rule. Leave every non-transform property where it is.
2. `src/styles/relief.css` — same treatment for lines 177, 242-245, 279, 334, 358, 374, 531, 617,
   674, 856, 897, 934, 1017, 1344. **Before editing each, read the line and confirm it actually
   sets a `transform`** — three entries in the table above are marked "verify selector at line".
   If a line does not set a transform on hover, skip it and note it in your report.
3. `src/styles/layout.css` — same for lines 216, 242, 256, 278.
4. `src/features/entertainment/pages/movieKit.tsx` — same for the `.mvk-card:hover` and
   `.mvk-bm:hover` rules inside the `<style>` string. (`.mvk-bm:active` is out of scope here; plan
   005 owns it.)
5. `src/features/auth/pages/SignIn.tsx` — same for `.signin-gold:hover`.
6. Leave `src/styles/relief.css:969-975` (the reduced-motion allowlist) exactly as it is. Plan 006
   owns that block, and editing it here will conflict.

## Boundaries

- Do NOT touch `src/styles/tokens.css`. No new tokens are needed for this plan.
- Do NOT change any duration, easing, or transform *value* — only where the rule applies. Value
  changes belong to plans 002 and 003.
- Do NOT change markup, class names, or component structure.
- Do NOT add dependencies.
- Do NOT touch `src/app/relief.spec.ts`.
- If a cited line does not contain what this plan says it contains, STOP and report. The repo moved.

## Verification

- **Mechanical**: from `together-city-react/`, run `npx tsc --noEmit` (expect clean) and
  `npx vitest run src/app/relief.spec.ts` (expect 26 passed). Then
  `grep -rc "hover: hover" src/ | awk -F: '{s+=$2}END{print s}'` — expect a number ≥ 20, where it
  was 0.
- **Feel check**: run the app, open DevTools → Toggle device toolbar → pick a touch device so
  `pointer: coarse` is reported. Then:
  - Tap a `.pcard` in any hub grid. It must NOT lift, and must not remain lifted after the tap.
  - Tap a `.chip` in the mobile hub nav (`nav.hub-chips`, visible below 1100px). No lift.
  - Scroll a list with `.row` items by dragging over them. No row should lift or stay lifted.
  - Switch back to a desktop viewport with a mouse: every hover lift must still work exactly as before.
- **Done when**: on a touch viewport, no element in the app changes `transform` on tap-and-hold;
  on a pointer viewport, every hover lift is unchanged; `relief.spec.ts` still passes.
