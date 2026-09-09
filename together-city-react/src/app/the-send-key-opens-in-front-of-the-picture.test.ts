import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
/** Comments quote the old line as the thing they exist to correct, so only
 *  what actually runs is read. Same trick as a-share-card-is-a-link. */
const code = (p: string) =>
  read(p).replace(/(^[ \t]*|\{)\/\*[\s\S]*?\*\//gm, '$1 ').replace(/^\s*\/\/.*$/gm, ' ');

/**
 * ── THE SEND KEY OPENS IN FRONT OF THE PICTURE ──────────────────────────────
 *
 * Owner, 9 Sep, on the television: "the send button needs to send it to chat
 * at Together City."
 *
 * It always did. `ShareModal` has posted into a Together City conversation
 * through `chatApi.sendShare` since the day it was written, and the television
 * has opened that exact sheet since the Send key was added. What the key could
 * not do was be SEEN:
 *
 *   .tv-room  { position: fixed; z-index: 1000 }     the television
 *   ShareModal{ position: fixed; z-index: 100   }     the sheet
 *
 * Two fixed siblings on the body, and the sheet lost. The citizen pressed a
 * key that appeared to do nothing, which is indistinguishable from a key that
 * is not wired up — and so it got reported as one.
 *
 * The lesson is not "use a bigger number". It is that a number nobody owns
 * drifts the moment a new full-screen room is built, and the next room will
 * lose the same argument. So the layer has ONE name, `--z-dialog`, and both
 * the city's Modal and the share sheet read it.
 *
 * ── AND FULL SCREEN IS THE SAME BUG BY A SECOND ROUTE ───────────────────────
 *
 * A browser in full screen paints only the fullscreen element's subtree. A
 * sheet portalled to document.body is mounted, correct, and invisible. The
 * television steps back out of full screen before it opens.
 */
describe('the share sheet opens above every room that can hold it', () => {
  it('the sheet sits on the named dialog layer, not on a literal of its own', () => {
    const share = code('features/chat/share.tsx');
    expect(share).toMatch(/zIndex:\s*'var\(--z-dialog\)'/);
    /* The line this file exists for. 100 was under the television, and any
       literal here is the same class of mistake wearing a different digit. */
    expect(share).not.toMatch(/zIndex:\s*\d+/);
  });

  it('the city Modal reads the same name, so there is one layer and not two', () => {
    const modal = code('components/ui/Modal.tsx');
    expect(modal).toMatch(/zIndex:\s*'var\(--z-dialog\)'/);
    expect(modal).not.toMatch(/zIndex:\s*1300/);
  });

  it('the layer is declared once, and above the television', () => {
    const tokens = read('styles/tokens.css');
    const decl = /--z-dialog:\s*(\d+)/.exec(tokens);
    expect(decl).not.toBeNull();
    const dialog = Number(decl![1]);

    const social = read('styles/social.css');
    const room = /\.tv-room\s*\{[^}]*z-index:\s*(\d+)/.exec(social);
    expect(room).not.toBeNull();
    /* Not "1300 > 1000" written out — the television's own number is read, so
       a set that climbs later fails HERE rather than in somebody's hands. */
    expect(dialog).toBeGreaterThan(Number(room![1]));
  });

  it('the television leaves full screen to send', () => {
    const tv = code('features/social/CityTV.tsx');
    expect(tv).toMatch(/const openSend = useCallback\(/);
    expect(tv).toMatch(/document\.fullscreenElement\) void document\.exitFullscreen\(\);\s*setSendOpen\(true\)/);
    expect(tv).toMatch(/onClick=\{openSend\}/);
    /* The key must not go back to setting the flag straight from the handler,
       which is the version that opened an invisible sheet in full screen. */
    expect(tv).not.toMatch(/onClick=\{\(\) => setSendOpen\(true\)\}/);
  });

  it('the sheet still posts into a Together City conversation', () => {
    /* The half of the owner's sentence that was never broken, asserted so a
       future tidy-up of this file cannot quietly remove the send itself. */
    const share = code('features/chat/share.tsx');
    expect(share).toMatch(/chatApi\.sendShare\(convId, note\.trim\(\), item\)/);
    expect(share).toMatch(/chatApi\.startDirect\(target\.handle as string\)/);
  });
});
