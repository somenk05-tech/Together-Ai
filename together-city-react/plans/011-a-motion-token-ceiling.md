# 011 — Put a ceiling on motion-token drift, then lower it

- **Status**: TODO
- **Commit**: 30675c9
- **Severity**: LOW (individually) / HIGH (cumulatively)
- **Category**: Cohesion & tokens (7) / Easing & duration (2)
- **Estimated scope**: 1 new script + 1 package script + a first consolidation pass

## Problem

**Three duration tokens are declared. Thirty-six distinct duration literals ship.**

```css
/* src/styles/tokens.css:382 — current */
--dur-fast: 130ms; --dur-base: 220ms; --dur-slow: 420ms;
```

Not one of the ~105 hand-typed sites resolves to a token value. `.2s` (21 uses) is 20ms off
`--dur-base`. `.12s` (7 uses) is 10ms off `--dur-fast`. `.4s` is 20ms off `--dur-slow`. Three
clusters straddle each token without hitting it:

- `.12s` / `.14s` / `.15s` / `.16s` — four values within 40ms of each other and of `--dur-fast`
- `.18s` / `.2s` / `.24s` / `.25s` / `.26s` / `.28s` — six values straddling `--dur-base`
- `.6s` / `.7s` / `.72s` — three spinner periods that should be one

**Eight distinct easings ship** where the repo declares one token: bare `ease` (35 uses),
`var(--ease)` (25), `linear` (16), `var(--spring)` (13 — plan 002 removes it), `ease-out` (9),
`cubic-bezier(.16,1,.3,1)` (2, in `UniversalShareSheet.tsx` — plan 009 removes them),
`ease-in-out` (1), `step-end` (1). Plus **33 declarations with no timing function at all**, which
silently take the browser's weak built-in `ease`.

Two specific easing errors worth fixing in the same pass:

`linear` on discrete colour/background hover changes — the playbook says hover/colour → `ease`:
`src/styles/relief.css:277` (`.btn`), `:479` (`.tabrow a`), `:574` (`.tc-nav a`), `:615`
(`.side-menu a`), `:661` (`.tc-bottomnav`), `src/styles/layout.css:214` (`.ask-chip`), `:240`
(`.ask-cta`).

`transition: all` at `src/index.css:77` (`.pill`) and
`src/features/entertainment/pages/movieKit.tsx:69` (`.mvk-bm svg`) — always a finding; it animates
unintended properties off the GPU.

This is the same disease as the 39 font sizes and 737 raw radii recorded in `CLAUDE.md`: token
drift, the failure mode of a design system that is working. A sweep of 105 sites in one commit is
unreviewable. **A ratchet is the right instrument, and this repo already invented it.**

## Target

A new audit script in the shape of the two the repo already runs in its gates:

```
$ node scripts/motion-ceiling.mjs
  duration literals   36   ceiling 36   ok
  easing values        8   ceiling  8   ok
  no-easing decls     33   ceiling 33   ok
  transition: all      2   ceiling  2   ok
  Motion drift at the ceiling. No worse than before.
```

Exit 1 if any count exceeds its ceiling. Ceilings are constants at the top of the file, lowered by
hand as work lands.

Then a **first consolidation pass** that lowers three of the four numbers immediately, chosen
because each is mechanical and low-risk:

1. `transition: all` → the two properties actually intended. `src/index.css:77` becomes
   `transition: box-shadow var(--dur-base) var(--ease), color var(--dur-fast) var(--ease);`
   (read the rule and confirm which properties change on hover before writing this).
   `movieKit.tsx:69` becomes `transition: transform .18s ease` — that `svg` only ever transforms.
   **Ceiling: 2 → 0.**
2. The seven `linear`-on-colour uses → `var(--ease)`. **Easing values: 8 → 7** once `--spring` and
   the two invented curves are gone via plans 002 and 009.
3. The three spinner periods (`.6s`, `.7s`, `.72s` at `src/index.css:259`,
   `src/components/ui/Spinner.tsx:4`, `src/components/share/UniversalShareSheet.tsx:589` and
   `:627`, `src/styles/relief.css:346`) → one new token `--dur-spin: 700ms`.
   **Duration literals: 36 → 34.**

## Repo conventions to follow

- Exemplar: `together-city-react/scripts/lint-ceiling.mjs` and
  `together-city-react/scripts/dead-export-audit.mjs`. Both print
  `<name>: N, at the ceiling. No worse than before.` and exit non-zero when the number grows. Read
  `lint-ceiling.mjs` first and copy its structure, its output format and its exit-code behaviour
  exactly. Do not invent a new reporting style.
- The gate scripts are run by the land scripts and by `RELEASE-GATE.md`. Adding the new script to
  `package.json` scripts is in scope; wiring it into a land script is **not** — say so in your
  report and leave it.
- New tokens go at `:root` in `src/styles/tokens.css` beside the existing duration line.
  `relief.spec.ts` fails on a custom property nobody defines.

## Steps

1. Read `together-city-react/scripts/lint-ceiling.mjs` end to end.
2. Write `together-city-react/scripts/motion-ceiling.mjs` in the same shape. It should walk
   `src/**/*.{css,tsx,ts}` and count:
   - distinct duration literals matching `/\b\d*\.?\d+m?s\b/` inside `transition`/`animation`
     declarations (exclude `steps()` and `step-end`);
   - distinct timing functions (keywords + `cubic-bezier(...)` + `var(--…)`);
   - `transition`/`animation` declarations with a duration and **no** timing function;
   - occurrences of `transition: all` / `transition:all`.
   Set the four ceilings to the numbers the script itself reports on first run — do not hard-code
   36/8/33/2 without verifying.
3. Add `"motion-ceiling": "node scripts/motion-ceiling.mjs"` to `package.json` scripts.
4. Consolidation pass item 1: fix both `transition: all` sites. Lower that ceiling to 0.
5. Consolidation pass item 2: replace `linear` with `var(--ease)` at the seven colour/background
   sites listed under **Problem**. Do NOT touch the seven correct `linear` uses (six infinite
   spinners and `CookMode.tsx:215`'s progress bar — constant motion is correctly linear).
6. Consolidation pass item 3: add `--dur-spin: 700ms;` to `tokens.css` and point the five spinner
   declarations at it. Lower the duration ceiling accordingly.
7. Re-run the script and hard-code the new, lower ceilings.

## Boundaries

- Do NOT attempt to consolidate the remaining ~100 duration literals in this plan. That is the
  ratchet's job over time, and a 100-site sweep is unreviewable.
- Do NOT change `--dur-fast`, `--dur-base` or `--dur-slow` values.
- Do NOT delete `--dur-slow` even though plan 002 leaves it with zero readers — decide that with
  the owner, not in a mechanical pass.
- Do NOT wire the new script into `land-*.sh` or CI.
- Do NOT add dependencies. `lint-ceiling.mjs` uses only Node built-ins; match it.
- **Depends on plans 002 and 009** having landed, or the easing count will be wrong.

## Verification

- **Mechanical**: `node scripts/motion-ceiling.mjs` exits 0 and prints all four counts at their
  ceiling. Then deliberately add `transition: all .2s` to a scratch rule and confirm the script
  exits 1 and names the offender; remove it. `npx vitest run src/app/relief.spec.ts` → 26 passed.
  `npx tsc --noEmit` clean.
- **Feel check**: this plan is mostly mechanical, but two things need eyes:
  - Hover a `.pill` — the colour and shadow change should be unchanged in feel now that
    `transition: all` is gone. Confirm nothing that used to animate has stopped.
  - Watch all three spinner sites (`Spinner`, the share sheet's two, the `.tc-spin` glyph). At
    700ms they should all rotate at the same rate; before, three different rates.
- **Done when**: `scripts/motion-ceiling.mjs` exists, runs in the same idiom as `lint-ceiling.mjs`,
  reports 0 for `transition: all`, and the ceilings are recorded as constants.
