/**
 * ── THE DISTRICT ASKS FOR ITS CHILDREN ONCE ─────────────────────────────────
 *
 * A pathless layout route around every room, so the fetch happens whatever door
 * a citizen came in by — a bookmark on /babycare/shop, a link to a product, the
 * rail. The Pet District's arrangement and its argument, held to here.
 *
 * IT DOES NOT HOLD THE ROOMS BACK. That is the one place this differs from
 * Pets, and it is deliberate: three of the four rooms here are the shop, the
 * product page and the law, and none of them needs a child to be worth reading.
 * A parent following a link to a car seat should not wait on a request about
 * their family. The rooms that DO read a child each say "reading no child yet"
 * until one arrives, which is honest at every moment rather than blank and then
 * suddenly right.
 *
 * THE FAILURE BANNER SITS HERE because a save can fail on any screen, and the
 * child form is not the only place a write happens.
 */

import { useEffect, useRef } from 'react';
import { Outlet } from 'react-router-dom';
import { useBabyCare } from '../store';

export function BabyCareBoot() {
  const load = useBabyCare((s) => s.load);
  const loaded = useBabyCare((s) => s.loaded);
  const error = useBabyCare((s) => s.error);
  const clearError = useBabyCare((s) => s.clearError);
  const banner = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);

  /* A BANNER NOBODY SCROLLS TO IS A BANNER NOBODY READS — the Pet District's
     scar, and the child form is two screens long on a phone. */
  useEffect(() => {
    if (error) banner.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [error]);

  return (
    <div className="bc-stack">
      {error && (
        <div ref={banner} role="alert" className="card bc-row-split">
          <span className="bc-title">{error}</span>
          <button type="button" className="btn" onClick={clearError}>Dismiss</button>
        </div>
      )}
      <Outlet />
    </div>
  );
}
