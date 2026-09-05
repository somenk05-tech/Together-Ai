import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
/** Comments quote the old code as the thing they exist to correct. */
const code = (p: string) =>
  read(p).replace(/(^[ \t]*|\{)\/\*[\s\S]*?\*\//gm, '$1 ').replace(/^\s*\/\/.*$/gm, ' ');

/**
 * ── THE READER OPENS WHERE YOU TOUCHED, AND KEEPS GOING ─────────────────────
 *
 * Owner, 4 Sep, of the profile grid: "when clicked it should play at the same
 * place and then make a scroll." Two defects behind one sentence.
 *
 *   1 · THE COLUMN ARRIVED SOMEWHERE ELSE. You pressed a picture on the right
 *       of a nine-tile wall and the answer appeared centred, at full size, in
 *       the middle of the screen. Nothing was wrong with what it showed — the
 *       post you tapped was at the top — but nothing connected the thing you
 *       pressed to the thing that opened. The column now starts AT the tile's
 *       rectangle and travels to its resting place: one FLIP, measured after
 *       the instant scroll and released on the next paint.
 *
 *   2 · THE VIDEO ENDED AND THE SCREEN SAT STILL. Autoplay-in-view plays
 *       whatever is on screen; nothing ever moved the screen. So watching two
 *       videos meant watching one and then scrolling for the other by hand.
 *       The end of a clip now scrolls the column to the next post that HAS a
 *       video — the next VIDEO, not the next post, because skipping three
 *       photos to reach one is what "play my videos" means.
 *
 * THE SUBTLE HALF IS THE LOOP. `loop` was on for every autoplay-in-view video,
 * and a looping video never fires `ended` — so an auto-advance wired to
 * `ended` would have been dead code that typechecked. The loop is off exactly
 * where a listener is waiting, and stays on for the Videos feed.
 *
 * Asserted against the SOURCE: jsdom does not lay out, does not paint a
 * transform, and does not play a video to its end.
 */
describe('the reader opens where you touched', () => {
  const reader = code('features/social/pages/Profile.tsx');
  const card = code('features/social/PostCard.tsx');

  it('carries the touched tile’s rectangle into the reader', () => {
    expect(reader).toMatch(/originRect\?: DOMRect \| null/);
    expect(reader).toMatch(/openFrom\.current = e\.currentTarget\.getBoundingClientRect\(\)/);
    // Both walls — the citizen's own grid and another citizen's.
    expect(reader.match(/getBoundingClientRect\(\); setOpenId/g)?.length).toBe(2);
    expect(reader.match(/originRect=\{openFrom\.current\}/g)?.length).toBe(2);
  });

  it('inverts before it paints, not after', () => {
    // useEffect would show the column at rest for one frame and then snap
    // back to the tile to begin.
    expect(reader).toMatch(/useLayoutEffect\(\(\) => \{\s*startRef\.current\?\.scrollIntoView/);
    expect(reader).toMatch(/col\.style\.transform = `translate\(\$\{dx\}px, \$\{dy\}px\) scale\(\$\{sx\}, \$\{sy\}\)`/);
    // Read back between the two writes, or the browser animates nothing.
    expect(reader).toMatch(/void col\.offsetWidth;[\s\S]{0,200}col\.style\.transform = 'none'/);
  });

  it('leaves the travel out when the citizen asked for no motion', () => {
    expect(reader).toMatch(/prefers-reduced-motion: reduce[\s\S]{0,400}if \(!col \|\| !originRect \|\| reduce/);
  });

  it('advances to the next VIDEO, and never wraps', () => {
    expect(reader).toMatch(/post\.media\.some\(\(m\) => m\.kind === 'video'\)/);
    expect(reader).toMatch(/if \(i < 0 \|\| i \+ 1 >= videoIds\.length\) return;/);
    expect(reader).toMatch(/onVideoEnded=\{\(\) => advance\(post\.id\)\}/);
  });

  it('turns the loop off where something is waiting for the end', () => {
    expect(card).toMatch(/loop=\{!onEnded && \(isNew \|\| autoInView\)\}/);
    expect(card).toMatch(/onEnded=\{onEnded\}/);
    // Only the first video of a card reports its end — a carousel of clips
    // would otherwise advance the column three times.
    expect(card).toMatch(/onEnded=\{i === 0 \? onVideoEnded : undefined\}/);
  });
});
