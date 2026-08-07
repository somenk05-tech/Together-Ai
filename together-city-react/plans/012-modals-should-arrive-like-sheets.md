# 012 — Modals teleport while sheets animate

- **Status**: TODO
- **Commit**: 30675c9
- **Severity**: MEDIUM
- **Category**: Missed opportunities (8)
- **Estimated scope**: 2 CSS rules + 1 reduced-motion gate

## Problem

Two overlay primitives sit at the same z-layer doing the same job, and only one of them animates.

```css
/* src/styles/relief.css:959 — current, the SHEET */
  animation: sheetIn .28s var(--ease) both;
```

```css
/* src/index.css:241-242 — current, the MODAL */
.modal-ov { position: fixed; inset: 0; background: rgba(255,255,255,.72); z-index: 200; display: flex; align-items: center; justify-content: center; padding: 20px; }
.modal { background: var(--card); border-radius: 16px; max-width: 460px; width: 100%; padding: 22px 24px; max-height: 84vh; overflow: auto; }
```

Neither `.modal` nor `.modal-ov` carries an `animation` in either stylesheet — `relief.css:249-250`
only restyles their shadow, radius and frost. Meanwhile `.sheet`, immediately below in the same
file, gets a 280ms `sheetIn`. The modal's `backdrop-filter: blur(6px)` (`relief.css:250`) also
snaps on in a single frame, which is the most visible part of the jump.

A modal is a rare-to-occasional surface, so it is squarely in the band where the playbook allows a
standard animation — and the inconsistency with its sibling is the actual defect.

## Target

Reuse the existing `sheetIn` keyframe rather than writing a second one. It is already the house
entrance for a centred overlay:

```css
/* src/styles/relief.css — the existing keyframe, unchanged */
@keyframes sheetIn { from { opacity: 0; transform: translateY(10px) scale(.985); } to { opacity: 1; transform: none; } }
```

```css
/* target — added to src/index.css beside the .modal rules */
@keyframes modalOvIn { from { opacity: 0 } to { opacity: 1 } }
.modal-ov { animation: modalOvIn var(--dur-fast) var(--ease-out) both; }
.modal { animation: sheetIn var(--dur-base) var(--ease-out) both; }
@media (prefers-reduced-motion: reduce) {
  .modal-ov, .modal { animation: none; }
}
```

The overlay fades in 130ms and the modal arrives over 220ms — the scrim leads, so the page dims
before the panel lands rather than both appearing at once. Both are inside the playbook's
200–500ms modal band.

`transform-origin` stays at its default `center`. **Modals are exempt from trigger-anchoring** —
they appear centred, and centre origin is correct here. Do not add one.

## Repo conventions to follow

- Exemplar to imitate exactly: `src/styles/relief.css:959-962` — the `.sheet` rule followed
  immediately by `@media (prefers-reduced-motion: reduce) { .sheet { animation: none; } }`. Every
  keyframe entrance in this repo is gated on the next line; match that.
- `.modal` and `.modal-ov` are declared in `src/index.css`; add the animation there, not in
  `relief.css`, so the rule sits with its selector.
- `--dur-fast` (130ms) and `--dur-base` (220ms) exist. `--ease-out` comes from plan 002.

## Steps

1. `src/index.css` — add the `modalOvIn` keyframe and the two animation rules immediately after the
   existing `.modal-ov` / `.modal` declarations at lines 241-242.
2. Add the reduced-motion gate on the following line, matching the `.sheet` exemplar.
3. Confirm `sheetIn` is defined in `src/styles/relief.css` and that `index.css` and `relief.css`
   are both loaded on every page — read `src/main.tsx` or `src/App.tsx` to verify the import order.
   If `index.css` loads *before* `relief.css`, referencing `sheetIn` from `index.css` still works
   (keyframe resolution is document-wide, not order-dependent), but confirm both files are actually
   imported.
4. Do NOT animate the `backdrop-filter` value itself. Let it appear with the overlay's opacity
   fade — animating a backdrop-filter is expensive and the fade already masks the transition.

## Boundaries

- Do NOT add an exit animation in this plan. Modal dismissal in this repo unmounts immediately and
  giving it an exit means touching every call site's state — a separate, larger job. Note it in
  your report.
- Do NOT change the modal's size, radius, padding, `max-height` or the `.modal-ov` background.
- Do NOT touch `.sheet` or `sheetIn`.
- Do NOT add a `transform-origin`.
- Do NOT add dependencies.
- **Depends on plan 002** for `--ease-out`.

## Verification

- **Mechanical**: `npx vitest run src/app/relief.spec.ts` → 26 passed; `npx tsc --noEmit` clean.
- **Feel check**: find a screen that opens a `.modal` (grep `className="modal"` for a live call
  site) and open it.
  - The scrim must dim before the panel is fully there — not both at once.
  - The panel must arrive from 10px below at 98.5% scale, matching how a `.sheet` arrives. Open
    a sheet and a modal back to back; they should feel like the same family.
  - The 6px backdrop blur must no longer snap on in one frame.
  - DevTools → Rendering → reduced motion: both appear instantly, no fade, no slide.
- **Done when**: a modal and a sheet are visually indistinguishable in how they arrive, and both
  are gated for reduced motion.
