# 015 — When a tab changes, the content should say so

- **Status**: TODO
- **Commit**: 30675c9
- **Severity**: LOW
- **Category**: Missed opportunities (8)
- **Estimated scope**: 1 component; a reusable pattern if it works

## Problem

```tsx
/* src/features/realestate/pages/Explore.tsx:35-41 — current */
<div className="tabrow" style={{ marginBottom: 16 }}>
  {KINDS.map((t) => (
    <a key={t.k} href="#re-grid" className={kind === t.k ? 'on' : undefined}
      onClick={(e) => { e.preventDefault(); setKind(t.k); }}>{t.l}</a>
  ))}
</div>
```

The tab pill is the only thing that transitions — `.tabrow a` at `src/styles/relief.css:479`
animates `box-shadow`, `color` and `background`. The content it governs, the property grid at
`Explore.tsx:58-60`, is an entirely different set of cards with entirely different keys, and it
replaces itself in a single frame.

**The control acknowledges the click; the thing the click was about does not.** A user changing
property type has no confirmation that the grid beneath is now a different grid rather than the
same one re-sorted.

This is the lowest-severity item in the audit and it is genuinely optional. It is included because
the same shape appears in `src/features/travel/shared.tsx:32` (`TabRow`, shared across Insurance /
Visa / Bookings) and if this pattern works it can be lifted there.

## Target

A short crossfade on the content region, keyed on the tab value so React remounts it. Nothing
moves — this is a **state-change signal**, not a spatial transition, and movement would be the
wrong vocabulary for content that has no origin.

```tsx
/* target — Explore.tsx, wrapping the grid at line 58 */
<div key={kind} id="re-grid" style={{
  animation: 'tabSwap var(--dur-fast) var(--ease-out) both',
}}>
  { /* the existing grid, unchanged */ }
</div>
```

```css
/* target — added to src/index.css beside the other keyframes */
@keyframes tabSwap { from { opacity: 0 } to { opacity: 1 } }
@media (prefers-reduced-motion: reduce) { [style*="tabSwap"] { animation: none } }
```

130ms, opacity only. It must be short: this is a frequently-used control and the playbook's rule
is that motion on a frequent surface is either brief or absent.

**If a crossfade at 130ms reads as a flicker rather than a signal in the feel check, delete it and
report that the finding was rejected.** That is a legitimate outcome — the audit playbook is
explicit that "no animation" is a valid answer, and this is the weakest finding on the list.

## Repo conventions to follow

- Keyframes live in `src/index.css` alongside the other `@keyframes` (`rise`, `tc-rise`, `tc-pop`,
  `tc-shake`). Add `tabSwap` there.
- Every keyframe entrance in this repo is reduced-motion gated on the line after it. Exemplar:
  `src/styles/relief.css:781-783`.
- The `key={kind}` remount is the idiom that makes this work with no state machine. React will
  unmount the old grid and mount the new one; only the new one animates.
- `--dur-fast` (130ms) is at `src/styles/tokens.css:382`; `--ease-out` comes from plan 002.

## Steps

1. `src/index.css` — add the `tabSwap` keyframe beside the existing ones.
2. Prefer a **class** over the attribute selector in the reduced-motion gate: add
   `.tab-swap { animation: tabSwap var(--dur-fast) var(--ease-out) both; }` and
   `@media (prefers-reduced-motion: reduce) { .tab-swap { animation: none } }`, then use
   `className="tab-swap"` in the component. The `[style*=…]` selector in the target block is a
   fallback only; do not ship it if a class works.
3. `src/features/realestate/pages/Explore.tsx` — wrap the grid at lines 58-60 with
   `<div key={kind} id="re-grid" className="tab-swap">`. Confirm the existing `#re-grid` anchor
   target (the tabs link to `#re-grid`) ends up on the wrapper, not on the inner grid, or the
   in-page anchor breaks.
4. Do NOT apply this to `src/features/travel/shared.tsx` in this plan. If the feel check passes,
   note it as a follow-up.

## Boundaries

- Do NOT add any movement — no translate, no scale. Opacity only.
- Do NOT exceed 130ms.
- Do NOT change the tab logic, the filtering, or the grid contents.
- Do NOT change `.tabrow a`'s own transition.
- Do NOT add dependencies.
- **Depends on plan 002** for `--ease-out`.
- **This plan may be rejected at the feel check.** If it flickers, remove the change and say so.

## Verification

- **Mechanical**: `npx tsc --noEmit` clean; `npx vitest run` → 356 passed. Confirm the `#re-grid`
  anchor still scrolls correctly when a tab is clicked.
- **Feel check**: open the real-estate explore page and switch property type repeatedly.
  - The grid should read as *replaced*, not as *the same grid re-sorted*.
  - Switching tabs rapidly (four times in two seconds) must not produce a strobe. If it does,
    reject the plan.
  - The tab pill's own transition should still feel unchanged.
  - DevTools → Rendering → reduced motion: content swaps instantly, no fade.
- **Done when**: either the crossfade ships and reads as a signal, or it is removed and the
  rejection is recorded in `plans/README.md` with the reason.
