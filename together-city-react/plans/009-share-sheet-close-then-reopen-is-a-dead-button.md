# 009 — Close-then-reopen on the share sheet is a dead button for 230ms

- **Status**: TODO
- **Commit**: 30675c9
- **Severity**: MEDIUM
- **Category**: Interruptibility (4)
- **Estimated scope**: 1 component + verify 2 call sites

## Problem

```css
/* src/components/share/UniversalShareSheet.tsx:254 — current */
.uss-overlay.uss-closing{animation:uss-ov-out .2s ease both;pointer-events:none}
```

```tsx
/* src/components/share/UniversalShareSheet.tsx:338-345 — current */
const CLOSE_MS = 230;
…
closeTimer.current = window.setTimeout(() => onClose(), reduce ? 0 : CLOSE_MS);
```

`pointer-events: none` deliberately lets clicks pass through to the page during the 230ms exit, so
the trigger button underneath is live and clickable. But both call sites gate the sheet on
`{open && …}` with `open` still `true` for those 230ms —
`src/components/share/ShareButton.tsx:72` and
`src/features/entertainment/pages/movieKit.tsx:168`. So `setOpen(true)` is a no-op, the exit
animation keeps playing, and the sheet unmounts anyway.

The user closes the sheet, immediately taps share again, and **nothing happens**. Keyframes cannot
retarget, so the exit has to run to completion.

Two related latent bugs in the same file, not currently biting because both callers unmount the
component:

- `closingRef.current` (line 334) and `setClosing` (line 324) are never reset to `false`.
- `if (!open) return null` (line 448) implies the component supports staying mounted across a
  close/open cycle. Any caller that passes `open={state}` unconditionally gets a sheet stuck in
  `uss-closing` forever.

## Target

A re-open during the closing window **cancels the close** and returns the sheet to its open state,
rather than being swallowed.

```tsx
/* target — cancel the pending close when `open` goes true again */
useEffect(() => {
  if (open && closingRef.current) {
    if (closeTimer.current) { window.clearTimeout(closeTimer.current); closeTimer.current = null; }
    closingRef.current = false;
    setClosing(false);
  }
}, [open]);
```

```tsx
/* target — reset the flags whenever a close completes, so the component is reusable */
closeTimer.current = window.setTimeout(() => {
  closingRef.current = false;
  setClosing(false);
  closeTimer.current = null;
  onClose();
}, reduce ? 0 : CLOSE_MS);
```

And the sheet's own exit gets a symmetric curve, so cancelling it mid-flight is not visually
jarring. Today the enter uses `cubic-bezier(.16,1,.3,1)` and the exit falls back to bare `ease` —
asymmetric by accident:

```css
/* target — src/components/share/UniversalShareSheet.tsx:265 and :297 */
.uss-overlay.uss-closing .uss-sheet{animation:uss-sheet-out .2s var(--ease-out) both}
…
.uss-overlay.uss-closing .uss-sheet{animation:uss-sheet-down .24s var(--ease-out) both}
```

## Repo conventions to follow

- This component holds its CSS as a template-literal `<style>` string and its close mechanism as
  refs + a timeout. Keep both shapes; this plan fixes the mechanism, it does not replace it.
- `--ease-out` comes from plan 002 (`cubic-bezier(0.23, 1, 0.32, 1)` at `:root` in
  `src/styles/tokens.css`). The two `cubic-bezier(.16,1,.3,1)` literals at lines 264 and 296 are
  the only hand-written curves in the repo outside `tokens.css`; **also** replace those with
  `var(--ease-out)` so the file stops inventing its own easing.
- Exemplar of the reduced-motion escape already in this file: line 343-344.

## Steps

1. `src/components/share/UniversalShareSheet.tsx` — add the `useEffect` that cancels a pending
   close when `open` becomes true again.
2. Move the flag resets into the timeout callback as shown, so `closingRef` and `closing` return
   to `false` on every completed close.
3. Replace the bare `ease` on lines 254, 265 and 297 with `var(--ease-out)`.
4. Replace the `cubic-bezier(.16,1,.3,1)` literals on lines 264 and 296 with `var(--ease-out)`.
5. Read `src/components/share/ShareButton.tsx:72` and
   `src/features/entertainment/pages/movieKit.tsx:168` and confirm both still work. Do not change
   them unless the cancel effect requires the component to stay mounted — if it does, say so in
   your report rather than rewriting the callers.

## Boundaries

- Do NOT change `CLOSE_MS` (230ms) — it is inside the modal/drawer band and matches the exit
  animations.
- Do NOT remove `pointer-events: none` from `.uss-closing`. It is deliberate and correct.
- Do NOT change the sheet's layout, its content, or the mobile bottom-sheet breakpoint.
- Do NOT change the 24px `backdrop-filter` here — plan 010 owns that.
- Do NOT add dependencies.
- **Depends on plan 002** for `--ease-out`.

## Verification

- **Mechanical**: `npx tsc --noEmit` clean; `npx vitest run` → 356 passed.
- **Feel check**: open any entertainment poster and use the share button.
  - Open the sheet, close it, and **immediately** tap share again. The sheet must reopen. This is
    the whole plan; check it first.
  - Do the same but click the trigger while the exit is still visibly playing — the sheet should
    return without a flicker or a restart from the bottom.
  - Confirm the exit still plays normally when you close and do not re-open.
  - DevTools → Rendering → reduced motion: close should be instant and re-open should still work.
- **Done when**: close-then-immediately-reopen shows the sheet every time, and
  `grep -n "cubic-bezier" src/components/share/UniversalShareSheet.tsx` returns nothing.
