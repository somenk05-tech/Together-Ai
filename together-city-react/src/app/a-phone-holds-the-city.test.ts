import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');

/**
 * ── FOUR MOBILE-LAUNCH FIXES, PINNED (18 Aug audit) ─────────────────────────
 *
 * Each of these shipped once, silently regressed nothing on a desk, and only
 * showed on a phone — which is exactly the failure class this suite reads
 * source as text to catch.
 */

describe('a phone holds the city', () => {
  /**
   * THE SEARCH PILL IS RETIRED, AND MUST STAY RETIRED (23 Aug, evening).
   *
   * This test used to hold the draggable pill's second clamp — the fix for it
   * hanging 88px off-screen on every phone. The pill itself is gone now: a
   * remembered position meant it sat on top of posters, photos and form rows
   * on nine of the fifteen surfaces the whole-site walk covered, on desks as
   * well as phones. Search lives in the header's action row with the other
   * doors of the citizen's own, so it can never sit on content again — and a
   * phone reaches it through the same header it already holds. The clamp
   * lesson stays written above; if a floating control ever returns, so must
   * both layout passes.
   */
  it('search lives in the header, not floating over the page', () => {
    const header = read('layouts/Header.tsx');
    expect(header).not.toMatch(/FloatingSearch/);
    expect(header, 'the action row renders the search pill with the other doors').toMatch(/<QuickActions show="all" \/>/);
  });

  /**
   * THE HOME LOOP IS 9–15 MB. SignIn already decided a phone gets the still
   * poster (its comment carries the argument); Home mounts the same loop and
   * must make the same decision, or page one of the app downloads a feature
   * film's trailer over mobile data. Same 900px line in both files.
   */
  it('a phone gets the still city, not the 15 MB loop — on Home AND SignIn', () => {
    for (const page of ['pages/Home.tsx', 'features/auth/pages/SignIn.tsx']) {
      const src = read(page);
      expect(src, `${page} gates the loop at 900px`).toMatch(/matchMedia\('\(min-width: 900px\)'\)/);
    }
  });

  /**
   * stop() RAN vibrate(0) ON EVERY MOUNT'S CLEANUP, and Chrome logs a console
   * error for any vibrate before the first tap — three red lines per page, on
   * every page, before any call existed. The buzz is asked for only after real
   * user activation, and cancelled only if it was started.
   */
  it('the ringer only touches the vibration motor it actually started', () => {
    const src = read('features/calls/ring.ts');
    expect(src).toMatch(/userActivation\?\.hasBeenActive/);
    expect(src).toMatch(/if \(this\.vibrating\)/);
  });
});
