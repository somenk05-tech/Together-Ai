import type { ReactNode } from 'react';

/**
 * "SAVED" — SAID ONCE, THE SAME WAY, AND SAID OUT LOUD.
 *
 * The 8 Sep Save/Edit audit found sixty-odd save controls and four of them
 * confirmed anything. The rest went from "Saving…" back to "Save" and moved no
 * other pixel — which is exactly the failure the dating hub already had
 * written down: "a save that failed looked exactly like a save nobody made",
 * and a save that WORKED looked like the same thing.
 *
 * `role="status"` is the whole reason this is a component rather than a span
 * somebody copies. It is an ARIA live region: when the mark appears, a screen
 * reader says it without stealing focus. A `<span>` with a tick in it is
 * silent, and silence after a save is indistinguishable from a save that never
 * happened — for the people who cannot see the tick, which is who this is for.
 *
 * IT DOES NOT DISAPPEAR ON A TIMER of its own. Whether the confirmation goes
 * with the next edit, the next mutation or not at all belongs to the page —
 * MasterProfile clears it after 2.2 seconds because it saves field by field,
 * and a form saved once should keep saying so until something changes.
 */
export function SavedMark({ children = 'Saved' }: { children?: ReactNode }) {
  return (
    <span className="saved-mark" role="status">
      <span aria-hidden>✓</span>{children}
    </span>
  );
}
