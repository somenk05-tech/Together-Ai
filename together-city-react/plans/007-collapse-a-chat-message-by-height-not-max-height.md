# 007 — Collapse a deleted chat message in visible time

- **Status**: TODO
- **Commit**: 30675c9
- **Severity**: MEDIUM
- **Category**: Interruptibility (4) / Performance (5)
- **Estimated scope**: 1 inline `<style>` string + the component that toggles the class

## Problem

```css
/* src/features/chat/components/MessageThread.tsx:25-26 — current */
.tc-msg-collapse{overflow:visible;max-height:2000px;transition:max-height .25s ease,opacity .25s ease,margin .25s ease}
.tc-msg-collapsing{max-height:0!important;opacity:0;margin:0!important;overflow:hidden}
```

A chat message is roughly 60px tall. `max-height` has to fall from 2000 to below 60 before it clips
anything — that is **97% of the 250ms spent with the row at full height**, and then the visible
collapse happens in the final ~7ms. What the user sees is: the message sits there, fades, and then
snaps out of the list.

This is the classic `max-height`-as-`height` stand-in, and it is the only one in the repo.
`max-height` is also a layout property: every frame of the transition triggers layout, paint and
composite for the thread below it.

## Target

Measure the element and animate its real height, or — simpler and preferred here — animate only
`transform` and `opacity` and remove the row from flow at the end. The second is what the audit
playbook wants (`transform` and `opacity` only) and needs no measurement:

```css
/* target — src/features/chat/components/MessageThread.tsx, replacing lines 25-26 */
/* Was max-height: 2000px -> 0 over 250ms. A message is ~60px, so 97% of the
   duration passed with nothing visible and the collapse happened in the last
   7ms. transform+opacity are the only two properties that do not cost layout,
   and `grid-template-rows: 1fr -> 0fr` gives real height collapse for free. */
.tc-msg-collapse{display:grid;grid-template-rows:1fr;transition:grid-template-rows var(--dur-base) var(--ease-out),opacity var(--dur-fast) var(--ease-out)}
.tc-msg-collapse > *{overflow:hidden;min-height:0}
.tc-msg-collapsing{grid-template-rows:0fr;opacity:0}
```

`grid-template-rows: 1fr → 0fr` is the modern height-collapse idiom: it animates to the element's
*actual* height with no magic number and no measurement. Baseline support is Chrome 107+,
Safari 16+, Firefox 66+ — acceptable for this app.

If the executor finds that the message markup cannot take an extra wrapper element (the
`> *` selector needs exactly one child), fall back to:

```css
.tc-msg-collapse{transition:transform var(--dur-base) var(--ease-out),opacity var(--dur-fast) var(--ease-out);transform-origin:top}
.tc-msg-collapsing{transform:scaleY(0);opacity:0}
```
…and remove the node from the array once the transition ends, so the gap closes.

## Repo conventions to follow

- `MessageThread.tsx` holds its CSS as a template-literal `<style>` string. Edit in place.
- Durations are tokens: `--dur-fast` (130ms) and `--dur-base` (220ms) from `src/styles/tokens.css`.
  `--ease-out` comes from plan 002.
- The opacity leg should finish **before** the height leg so the message is gone before the gap
  closes — that is why the target uses `--dur-fast` for opacity and `--dur-base` for height.

## Steps

1. Read `src/features/chat/components/MessageThread.tsx` around lines 20-30 and find the JSX that
   receives `tc-msg-collapse` / `tc-msg-collapsing`.
2. If the collapsing element has exactly one element child, apply the **grid** target. If it has
   text or multiple children directly inside, wrap them in a single `<div>` — this is the one
   markup change this plan permits — or use the `scaleY` fallback.
3. Replace lines 25-26 with the targeted CSS.
4. Find where `tc-msg-collapsing` is added and confirm the element is removed from state after the
   transition (look for a `setTimeout` or `onTransitionEnd`). If the removal delay is a hard-coded
   number, make it match 220ms.
5. Leave `opacity` and `margin` behaviour otherwise unchanged.

## Boundaries

- Do NOT keep any `max-height` transition in this file.
- Do NOT change the delete/undo logic, only the motion.
- Do NOT add dependencies (no measurement library, no Framer Motion).
- Do NOT touch other components in `src/features/chat/`.
- **Depends on plan 002** for `--ease-out`.

## Verification

- **Mechanical**: `npx tsc --noEmit` clean; `npx vitest run` → 356 passed.
- **Feel check**: open a chat thread with several messages and delete one.
  - The collapse must be visible for its whole duration — the row should shrink smoothly, not
    hold-then-snap.
  - Messages below must slide up continuously, not jump.
  - DevTools → Performance, record the delete: confirm no long "Layout" bars per frame (the grid
    approach still costs layout, but on one row rather than a 2000px range — compare before/after
    if in doubt).
  - Delete two messages in rapid succession: the second must not restart the first.
- **Done when**: `max-height` appears nowhere in `MessageThread.tsx`, and a deleted message's
  collapse is visible across the full 220ms.
