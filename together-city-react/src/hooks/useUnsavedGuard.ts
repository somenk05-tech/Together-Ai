import { useCallback, useEffect, useState } from 'react';
import { useBlocker } from 'react-router-dom';

/**
 * NOTHING TYPED IS LOST WITHOUT BEING ASKED (8 Sep Save/Edit audit).
 *
 * The audit read sixty-odd save controls and found three files that even knew
 * whether their form had been touched, and none that did anything with it. So
 * every editor in the city had the same hole: fill in eighteen dating
 * questions, press the city's own back arrow by accident, and the answers are
 * gone with no question asked. `realestate/Sell.tsx` had the only guard —
 * one `window.confirm` on one kind-switch — which is how the hole stayed
 * invisible: somebody had clearly thought about it once.
 *
 * THREE WAYS OUT OF A FORM, and a guard that misses one is a guard people stop
 * trusting:
 *  · Closing or reloading the TAB — `beforeunload`, the only one of the three
 *    the browser will let us speak in our own words on (it will not; the
 *    browser prints its own sentence, and refuses entirely unless the person
 *    has interacted with the page).
 *  · Navigating INSIDE the app — a link, a back button, a hub tab. This is the
 *    common one and the one nothing caught. `useBlocker` needs a data router
 *    and this app has had `createBrowserRouter` since it was built.
 *  · Pressing the form's own CANCEL. `tryDiscard` — the caller hands over what
 *    it was going to do, and it happens either straight away or after a yes.
 *
 * IT ASKS IN THE CITY'S OWN VOICE. `window.confirm` is already refused here by
 * name (features/social/Confirm.tsx, 4 Sep audit): it cannot be styled, it
 * ignores the focus trap and the visual-viewport work, and it speaks in the
 * browser's voice. So the hook holds the QUESTION and the caller renders
 * `<UnsavedGuard guard={guard} />`, which is the shared branded dialog.
 *
 * A guard on a form that is not dirty must be invisible — no blocker, no
 * dialog, no confirm — or every editor in the city grows a question nobody
 * needs to answer.
 */
export interface UnsavedGuard {
  /** True while the question is on screen. */
  asking: boolean;
  /** The person chose to lose the changes. */
  discard: () => void;
  /** The person chose to stay. */
  keep: () => void;
  /**
   * Do `next`, or ask first if there is anything to lose. For a Cancel key,
   * a tab switch, or anything else the page itself drives.
   */
  tryDiscard: (next: () => void) => void;
}

export function useUnsavedGuard(dirty: boolean): UnsavedGuard {
  // What we were about to do when we stopped to ask. Held in a box because a
  // function in state is otherwise called by the setter.
  const [pending, setPending] = useState<{ run: () => void } | null>(null);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  // A hash or a query change is not leaving the form — the beauty page glides
  // between its own sections that way, and asking there would be nonsense.
  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    dirty && currentLocation.pathname !== nextLocation.pathname);

  const asking = pending !== null || blocker.state === 'blocked';

  const discard = useCallback(() => {
    if (pending) { const { run } = pending; setPending(null); run(); return; }
    if (blocker.state === 'blocked') blocker.proceed();
  }, [pending, blocker]);

  const keep = useCallback(() => {
    setPending(null);
    if (blocker.state === 'blocked') blocker.reset();
  }, [blocker]);

  const tryDiscard = useCallback((next: () => void) => {
    if (!dirty) { next(); return; }
    setPending({ run: next });
  }, [dirty]);

  return { asking, discard, keep, tryDiscard };
}
