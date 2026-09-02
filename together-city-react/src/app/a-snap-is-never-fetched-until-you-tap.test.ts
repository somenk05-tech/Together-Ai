import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
/** Comments out, because half of this file's rules are ABOUT the things it
 *  must not do — `capture=`, `visibilitychange`, a screenshot heuristic — and
 *  the docblocks that explain why say every one of those words. A guard that
 *  fails on its own subject's name is a guard that punishes writing the
 *  reasoning down. */
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

/**
 * ── A SNAP IS NEVER FETCHED UNTIL SOMEBODY TAPS ─────────────────────────────
 *
 * Temporary media as a chat primitive (2 Sep). On the server the promise is
 * enforced by a view counter; on the client it is enforced by the ABSENCE of
 * something — there must be no way for the browser to fetch the photograph on
 * its own, because the fetch IS the view.
 *
 * That is a hard thing to keep, because everything else in this application
 * works the other way: an attachment is an `<img src>` and the browser decides
 * when. One `src` in the wrong branch, one thumbnail, one preload, and a View
 * Once is spent by a scroll.
 *
 * The other half of the file is the honesty rule. The web cannot detect a
 * screenshot — no browser exposes one, and every heuristic available misses
 * the real tools and fires on tab switches. A notice nobody believes is worse
 * than no notice, so the web client must not call the report route and must
 * not claim the capability.
 */
describe('a snap is never fetched until you tap', () => {
  const body = read('features/chat/components/MessageBody.tsx');
  const bubble = read('features/chat/components/SnapBubble.tsx');
  const composer = read('features/chat/components/SnapComposer.tsx');
  const schemas = read('api/schemas.ts');
  const api = read('api/chat.api.ts');

  it('checks for a snap BEFORE it reaches the component that renders an <img>', () => {
    // `Attachment`'s image branch is an eager `<img src={a.thumbUrl || a.url}>`.
    // A snap's url arrives empty by design, so reaching that branch is both a
    // broken frame and — if a url were ever restored — a spent view.
    expect(body).toMatch(/a\.kind === 'snap' && a\.snap\s*\n?\s*\? <SnapBubble/);
    expect(body.indexOf("a.kind === 'snap'")).toBeLessThan(body.indexOf('<Attachment a={a}'));
  });

  it('never gives an <img> a snap address', () => {
    // The ONLY src in the bubble is an object URL made from a blob this tab
    // fetched on purpose. No a.url, no thumbUrl, no preload.
    const srcs = [...bubble.matchAll(/<img[^>]*src=\{([^}]*)\}/g)].map((m) => m[1].trim());
    expect(srcs).toEqual(['open']);
    expect(bubble).toMatch(/URL\.createObjectURL/);
    expect(bubble).toMatch(/URL\.revokeObjectURL/);
  });

  it('fetches only from a handler, never from a render', () => {
    // If `openSnap` were ever reached from an effect the photograph would be
    // spent by the tile MOUNTING — which is what scrolling past it does. So
    // there is exactly one call, and it is inside the click handler.
    const src = code('features/chat/components/SnapBubble.tsx');
    expect(src.match(/openSnap\(/g)).toHaveLength(1);
    const view = src.slice(src.indexOf('const view = async'), src.indexOf('const keep = async'));
    expect(view).toMatch(/chatApi\.openSnap\(messageId\)/);
    expect(src).toMatch(/onClick=\{\(\) => void view\(\)\}/);
  });

  it('carries no address and no thumbnail on the wire', () => {
    // Asserted on the schema rather than on a component, because the schema is
    // what would let one back in: zod strips what is not declared.
    const snapBlock = schemas.slice(schemas.indexOf('export const SnapSchema'), schemas.indexOf('export type Snap'));
    expect(snapBlock).not.toMatch(/url|thumb/i);
  });

  it('does not claim a screenshot it cannot detect', () => {
    // The API method exists for the Capacitor shells. Nothing in the web app
    // may call it, and nothing may reach for the heuristics that would fake it.
    expect(api).toMatch(/reportSnapScreenshot/);
    const src = code('features/chat/components/SnapBubble.tsx');
    expect(src).not.toMatch(/reportSnapScreenshot/);
    expect(src).not.toMatch(/visibilitychange|PrintScreen|onBlur/);
  });

  it('opens a Live Snap with the camera and not with a file picker', () => {
    // `capture` is a HINT: desktops ignore it and several mobile browsers
    // still offer the photo library beside the camera. A control that opens a
    // gallery on half its platforms cannot stand behind "taken now".
    const src = code('features/chat/components/SnapComposer.tsx');
    expect(src).toMatch(/getUserMedia\(\{ video: /);
    expect(src).not.toMatch(/capture=/);
    // And the gallery button is drawn only when this is NOT a Live Snap.
    expect(src).toMatch(/\{!live && \(/);
  });

  it('stops the camera on every way out', () => {
    // A camera left running behind a closed sheet is the worst bug this file
    // could ship, so the stop lives somewhere every exit reads.
    expect(composer).toMatch(/const stopCamera = useCallback\(/);
    for (const exit of ['const close = ', 'const send = ']) {
      const after = composer.slice(composer.indexOf(exit));
      expect(after.slice(0, 200)).toMatch(/stopCamera\(\)/);
    }
    expect(composer).toMatch(/return \(\) => \{ cancelled = true; stopCamera\(\); \};/);
  });
});
