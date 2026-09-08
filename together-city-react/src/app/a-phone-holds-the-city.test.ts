import { readFileSync, statSync } from 'node:fs';
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
   * THE SIGN-IN LOOP IS 9–15 MB, and a phone gets the still poster instead —
   * or page one of the app downloads a feature film's trailer over mobile data
   * for a BACKDROP behind a form. The 900px line stays there.
   *
   * HOME IS NO LONGER THAT CASE (owner, 8 Sep). Its hero is the commercial,
   * which is the message rather than the wallpaper, and the owner asked for it
   * on every device. So the phone is served a smaller CUT rather than a still:
   * `<source media>` picks it before a byte is downloaded, which is the part
   * worth pinning — a phone must never be handed the desk file.
   */
  it('a phone gets the still city, not the 15 MB loop — on SignIn', () => {
    const src = read('features/auth/pages/SignIn.tsx');
    expect(src, 'SignIn gates the loop at 900px').toMatch(/matchMedia\('\(min-width: 900px\)'\)/);
  });

  it('a phone gets its own cut of the home commercial, chosen before the download', () => {
    const src = read('pages/Home.tsx');
    // The phone source comes FIRST: the browser takes the first <source> whose
    // media matches, so a desk-file-first list would hand every phone the desk
    // file and never reach the small one.
    const phone = src.indexOf('together-city-commercial-phone.mp4');
    const desk = src.indexOf('together-city-commercial.mp4');
    expect(phone).toBeGreaterThan(-1);
    expect(phone).toBeLessThan(desk);
    expect(src).toMatch(/media="\(max-width: 899px\)"/);
  });

  it('and that cut is actually smaller — a second name for the same bytes is not a fix', () => {
    const V = join(SRC, '..', 'public/assets/video');
    const desk = statSync(join(V, 'together-city-commercial.mp4')).size;
    const phone = statSync(join(V, 'together-city-commercial-phone.mp4')).size;
    expect(phone).toBeLessThan(desk / 2);
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
