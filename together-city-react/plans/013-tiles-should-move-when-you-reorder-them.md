# 013 — Give drag-to-reorder some account of where the tiles went

- **Status**: TODO
- **Commit**: 30675c9
- **Severity**: MEDIUM
- **Category**: Missed opportunities (8)
- **Estimated scope**: 1 component, FLIP transition on a grid

## Problem

```tsx
/* src/features/social/pages/Profile.tsx:238-246 — current */
const move = (from: number, to: number) => {
  if (from === to) return;
  setArranged((cur) => {
    const next = [...cur];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    return next;
  });
};
```

The reordered array renders into `src/features/social/pages/Profile.tsx:287-291`
(`<div className="rise d1 social-grid">` … `key={p.id}`). Keys are stable, so React moves the same
DOM nodes into new grid cells — and **every tile between `from` and `to` jumps a full cell width in
a single frame, mid-drag, with no transition.**

`.social-tile` (`src/styles/relief.css:928-934`) does have a `transform` transition, but it is on
the `translateY` hover lift, not on the grid position that actually changed.

This is the one place in the entire application where a user is deliberately moving objects, and
the objects give no account of where they went. It is also the clearest earned use of motion in the
audit: preventing a jarring change is the first item on the playbook's list of valid purposes.

## Target

A FLIP transition — measure First position, let React render Last, Invert with a transform, then
Play. No library; ~25 lines.

```tsx
/* target — added to Profile.tsx, above the grid */
const gridRef = useRef<HTMLDivElement>(null);
const firstRects = useRef<Map<string, DOMRect>>(new Map());

/* Read positions BEFORE the state change. Call this at the top of `move`. */
const captureFirst = () => {
  firstRects.current.clear();
  gridRef.current?.querySelectorAll<HTMLElement>('[data-tile]').forEach((el) => {
    firstRects.current.set(el.dataset.tile!, el.getBoundingClientRect());
  });
};

/* After React commits the new order, invert and play. */
useLayoutEffect(() => {
  if (!firstRects.current.size) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  gridRef.current?.querySelectorAll<HTMLElement>('[data-tile]').forEach((el) => {
    const first = firstRects.current.get(el.dataset.tile!);
    if (!first) return;
    const last = el.getBoundingClientRect();
    const dx = first.left - last.left;
    const dy = first.top - last.top;
    if (!dx && !dy) return;
    if (reduce) return;                       /* no movement under reduced motion */
    el.style.transition = 'none';
    el.style.transform = `translate(${dx}px, ${dy}px)`;
    requestAnimationFrame(() => {
      el.style.transition = 'transform var(--dur-base) var(--ease-out)';
      el.style.transform = '';
    });
  });
  firstRects.current.clear();
}, [arranged]);
```

220ms is the right band: long enough to read as travel, short enough not to lag a drag.

## Repo conventions to follow

- No animation library is installed and none should be added. FLIP with `useLayoutEffect` is the
  hand-rolled idiom that matches this codebase.
- `--dur-base` (220ms) is at `src/styles/tokens.css:382`; `--ease-out` comes from plan 002.
- Reduced-motion branching in JS already exists in this repo — exemplar:
  `src/components/share/UniversalShareSheet.tsx:343-344` reads `matchMedia` and branches. Imitate it.
- The tiles need a stable identifier on the DOM node for the map. Add `data-tile={p.id}` to the
  tile element; that is the one markup change this plan permits.

## Steps

1. `src/features/social/pages/Profile.tsx` — add `gridRef` to the `.social-grid` container at
   line 287 and `data-tile={p.id}` to each tile.
2. Add `captureFirst()` and call it as the **first statement** inside `move` (before `setArranged`).
   Reading positions after the state change measures the wrong frame.
3. Add the `useLayoutEffect` shown under **Target**, keyed on `arranged`. It must be
   `useLayoutEffect`, not `useEffect` — `useEffect` runs after paint and the user sees the jump.
4. Clear inline `transition`/`transform` on the element after the animation ends so the hover lift
   still works. The simplest correct way: an `ontransitionend` handler that sets
   `el.style.transition = ''` and `el.style.transform = ''`.
5. Verify the hover lift (`.social-tile:hover { transform: translateY(-3px) }`) still fires after a
   reorder. If the inline transform shadows it, that is the bug to fix in step 4.

## Boundaries

- Do NOT change the reorder logic, the persistence, or the drag handles.
- Do NOT add a drag-and-drop or animation dependency.
- Do NOT apply FLIP to any other grid in the app in this plan.
- Do NOT change `.social-tile`'s CSS.
- **Depends on plan 002** for `--ease-out`.

## Verification

- **Mechanical**: `npx tsc --noEmit` clean; `npx vitest run` → 356 passed.
- **Feel check**: open the social profile, enter arrange mode, and drag a tile from the end of the
  grid to the beginning.
  - Every displaced tile must **travel** to its new cell, not jump.
  - The dragged tile must land in its slot without a double-move.
  - Do two reorders in quick succession: the second must retarget from wherever the tiles currently
    are, not restart from the original layout. (Transitions retarget; this is why the plan uses a
    transition and not a keyframe.)
  - Hover a tile after reordering — the 3px lift must still work.
  - DevTools → Rendering → reduced motion: tiles must arrive in their new positions instantly, with
    no travel.
- **Done when**: no tile changes grid cell in a single frame during a reorder, and hover still works
  afterwards.
