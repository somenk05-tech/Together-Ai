import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p: string) => readFileSync(join(APP, p), 'utf8');
/** A file is allowed to name the thing it refuses to do. Comments are not code —
 *  the same rule relief.spec.ts applies to CSS, for the same reason: this file's
 *  own prose says "no touch-action: none", and a guard that cannot tell an
 *  explanation from an implementation fails on the sentence explaining itself. */
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1 ');

/**
 * THE ZOOM GUARD IS ONE LINE AWAY FROM BEING DECORATION, IN THREE DIRECTIONS.
 *
 * Every one of these has a plausible, well-meant edit that silently turns the
 * feature off or breaks something worse, and none of them shows up as a failing
 * screen — which is exactly the shape of thing that needs a test rather than a
 * comment.
 */
describe('zoom is locked, and scrolling is not', () => {
  const hook = read('src/hooks/useZoomLock.ts');

  /**
   * The one that actually works, and the one word that makes it work.
   * A passive listener may not call preventDefault, and every default-registered
   * wheel listener in a browser is passive. Drop `{ passive: false }` and the
   * pinch guard becomes a no-op that still reads correctly.
   */
  it('registers the wheel guard as non-passive, or it prevents nothing', () => {
    expect(hook).toMatch(/addEventListener\(\s*'wheel'[\s\S]{0,60}passive:\s*false/);
  });

  /**
   * SCROLLING IS NOT ZOOMING. The usual way this feature is implemented — and
   * the reason people hate it — is a blanket touch or wheel block, which takes
   * scrolling with it. Nothing may be prevented unless the modifier that means
   * "zoom" is held.
   */
  it('never prevents a wheel event that is not a zoom', () => {
    const body = hook.slice(hook.indexOf('const onWheel'), hook.indexOf('const onGesture'));
    expect(body).toMatch(/if\s*\([^)]*(ctrlKey|metaKey)[^)]*\)\s*e\.preventDefault\(\)/);
    // The two blunt instruments that break scrolling for everybody.
    expect(code(hook)).not.toMatch(/touch-action:\s*none/);
    expect(code(hook)).not.toMatch(/'touchmove'/);
  });

  /** Safari/macOS does not synthesise the ctrl-wheel; without these, its pinch
   *  is simply unguarded and nobody would notice on a Mac running Chrome. */
  it('covers the Safari pinch, which arrives as its own event family', () => {
    for (const e of ['gesturestart', 'gesturechange', 'gestureend']) {
      expect({ event: e, handled: hook.includes(`'${e}'`) }).toEqual({ event: e, handled: true });
    }
  });

  /** Registered above the router, because several route blocks are SIBLINGS of
   *  AppShell rather than children of it — the same trap that once left
   *  CallCenter unable to reach half the application. */
  it('is installed once, above the router, not page by page', () => {
    expect(read('src/app/App.tsx')).toMatch(/useZoomLock\(\)/);
  });

  /** The mobile half. Kept honest: if somebody restores pinch-to-zoom on
   *  phones this test is the thing that says the desktop guard is now doing
   *  the job alone, rather than the change passing unremarked. */
  it('carries the mobile scale lock in the viewport meta', () => {
    const html = read('index.html');
    expect(html).toMatch(/name="viewport"[^>]*maximum-scale=1\.0/);
    expect(html).toMatch(/name="viewport"[^>]*user-scalable=no/);
    // Responsiveness is NOT what was locked, and a width other than
    // device-width would be the one edit here that breaks every phone.
    expect(html).toMatch(/name="viewport"[^>]*width=device-width/);
  });
});
