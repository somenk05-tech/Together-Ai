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
   * THE SEARCH PILL WAS 88px OFF-SCREEN ON EVERY PHONE. FloatingSearch renders
   * a hidden EMPTY button first to measure, and the empty button is ~6px wide;
   * positioned from that measurement, the real 112px pill hung past the right
   * edge with a sliver showing. The fix is a second clamp against the pill
   * that actually painted. Remove it and the audit's first P0 walks back in.
   */
  it('the search pill clamps itself against its REAL width, not the placeholder', () => {
    const src = read('components/FloatingSearch.tsx');
    const clamps = src.match(/useLayoutEffect\(/g) ?? [];
    expect(clamps.length, 'both layout passes: measure, then re-clamp the painted pill').toBeGreaterThanOrEqual(2);
    expect(src).toMatch(/clamp\(pos\.x, pos\.y\)/);
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
