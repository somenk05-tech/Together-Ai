# 014 — Disclosures should open, not shove the page

- **Status**: TODO
- **Commit**: 30675c9
- **Severity**: MEDIUM
- **Category**: Missed opportunities (8)
- **Estimated scope**: 3 components, same pattern

## Problem

Three expand/collapse surfaces mount their content instantly and displace everything below them in
a single frame. Two of them spend a 220ms spring on their own **hover** while giving their actual
job no motion at all.

```tsx
/* src/features/nutrition/components/TargetsDisclosure.tsx:38-42 — current */
        {open ? '▾' : '▸'} How we calculated this
      </button>

      {open && (
        <div style={{ marginTop: 8, padding: '12px 14px', border: '1px solid var(--line)', borderRadius: 12, background: 'var(--paper)' }}>
```

This is the app's answer to "where did this number come from" — a multi-row calculation table at
lines 47-58. It appears with no transition, and the caret is a **glyph swap** (`▾`/`▸`) rather than
a rotation, so there is no signal that a thing opened rather than that the page changed.

```tsx
/* src/features/astrology/pages/AstroAsk.tsx:250-253 — current */
                    <span className="ask-past-mark" aria-hidden>{openId === q.id ? '−' : '+'}</span>
                  </button>
                  {openId === q.id && (
                    <div className="ask-past-body">
```

`.ask-past` at `src/styles/layout.css:254-256` spends `var(--dur-base) var(--spring)` on a 2px
hover lift — and then, when the card actually opens and injects a full multi-paragraph answer, it
grows instantly and pushes every consultation beneath it down the page.

```tsx
/* src/features/connections/pages/Connections.tsx:47-50 — current */
  transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform .15s'
```

This one is **half-solved** — the caret rotates correctly. The `<ModuleChips>` it reveals still
appear with no motion. Use this file's caret as the exemplar for the other two.

## Target

The same three-part treatment on all three, so a disclosure reads as one behaviour across the app:

**1. The caret rotates instead of swapping glyph.**

```tsx
/* target — TargetsDisclosure.tsx, replacing the glyph swap */
<span aria-hidden style={{ display: 'inline-block',
  transform: open ? 'rotate(90deg)' : 'none',
  transition: 'transform var(--dur-fast) var(--ease-out)' }}>▸</span>
```

**2. The body animates its real height** using the `grid-template-rows` idiom — no magic number,
no measurement:

```tsx
/* target — the wrapper stays mounted; only its height animates */
<div style={{ display: 'grid', gridTemplateRows: open ? '1fr' : '0fr',
  transition: 'grid-template-rows var(--dur-base) var(--ease-out), opacity var(--dur-fast) var(--ease-out)',
  opacity: open ? 1 : 0 }}>
  <div style={{ overflow: 'hidden', minHeight: 0 }}>
    { /* the existing panel content, unchanged */ }
  </div>
</div>
```

Note the `{open && …}` guard is **removed** — the wrapper must stay mounted for the height to
animate. If the panel is expensive to render, keep a `hasOpened` flag and render the children only
after the first open, but keep the wrapper.

**3. Reduced motion drops the height animation, keeps the opacity.**

```tsx
/* target — the branch */
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
…
transition: reduce ? 'opacity var(--dur-fast) linear' : 'grid-template-rows var(--dur-base) var(--ease-out), opacity var(--dur-fast) var(--ease-out)',
```

## Repo conventions to follow

- Exemplar for the caret: `src/features/connections/pages/Connections.tsx:47-50`, which already
  does the rotation correctly. Match it (but use tokens for the duration rather than `.15s`).
- Exemplar for reduced-motion branching in JS:
  `src/components/share/UniversalShareSheet.tsx:343-344`.
- `--dur-fast` (130ms) and `--dur-base` (220ms) are at `src/styles/tokens.css:382`; `--ease-out`
  comes from plan 002.
- Inline style objects are the house style in these files; keep them.
- `grid-template-rows: 1fr → 0fr` is the same idiom plan 007 uses for the chat collapse. If 007 has
  landed, read it and match.

## Steps

1. `src/features/nutrition/components/TargetsDisclosure.tsx` — apply all three parts. Remove the
   `{open && …}` guard around the panel and wrap the panel content per the target.
2. `src/features/astrology/pages/AstroAsk.tsx:250-253` — apply all three parts to `.ask-past-body`.
   The `+`/`−` glyph should become a single `+` that rotates 45° to make an `×`, or keep the glyph
   swap and add only the body animation — the executor should pick the first and note it.
3. `src/features/connections/pages/Connections.tsx` — leave the caret as is except for swapping
   `.15s` to `var(--dur-fast) var(--ease-out)`; add the body animation to whatever wraps
   `<ModuleChips>`.
4. In each case verify the panel's existing padding/border/background move onto the **inner**
   `overflow: hidden` div, not the grid wrapper — a border on the wrapper will be visible when
   collapsed.

## Boundaries

- Do NOT change any of the three components' content, data, or open/close logic beyond removing
  the `{open && …}` render guard.
- Do NOT touch `.ask-past`'s hover rule — plans 001, 002 and 006 all touch it and will conflict.
- Do NOT add a height-measurement or animation dependency.
- Do NOT apply this to any other disclosure in the app in this plan.
- **Depends on plan 002** for `--ease-out`.

## Verification

- **Mechanical**: `npx tsc --noEmit` clean; `npx vitest run` → 356 passed.
- **Feel check**:
  - Open "How we calculated this" on a nutrition targets screen. The caret must rotate, the table
    must grow to its real height, and the content below must slide rather than jump.
  - Collapse it: the reverse, with nothing left behind (no residual border or padding).
  - Open a past consultation on `/astrology/ask` with a long answer. Confirm the cards below travel
    smoothly and the page does not scroll-jump.
  - Open and close rapidly: because these are transitions, the second toggle must retarget from the
    current height rather than restarting. Confirm at 10% playback in the Animations panel.
  - DevTools → Rendering → reduced motion: content appears and disappears with opacity only, no
    height animation.
- **Done when**: all three disclosures animate their real height, all three carets rotate, and none
  of them shoves the page.
