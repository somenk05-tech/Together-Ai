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
 * ── THE READER IS A PAGE (owner, 8 Sep) ─────────────────────────────────────
 *
 * "fix the scroll feel that start on the edge, make it a completely new page."
 *
 * THIS FILE USED TO ASSERT THE OPPOSITE, AND BOTH READINGS ARE THE SAME ASK.
 * On 4 Sep the ask was "when clicked it should play at the same place and then
 * make a scroll", and the answer was a dialog that expanded out of the tile's
 * rectangle and then scrolled ITSELF to the tapped post. The half that worked
 * — read on from here, videos advancing to the next video — is kept. The half
 * that produced "starts on the edge" is what a scroll-to-the-post always
 * produces: the column arrives part-way down a card, the picture cut off at
 * the top before anybody has touched it.
 *
 * The fix is not a better scroll, it is an ORDER. The post you tapped is the
 * FIRST item on the page and the wall follows it, so there is nothing to
 * scroll to on arrival — the only way a page opens at its top reliably.
 *
 * Asserted against the SOURCE: jsdom does not lay out, does not paint, and
 * does not play a video to its end.
 */
describe('the reader is a page, and it opens at the top', () => {
  const grid = code('features/social/pages/Profile.tsx');
  const page = code('features/social/pages/ReaderPage.tsx');
  const helpers = code('features/social/reader.ts');
  const card = code('features/social/PostCard.tsx');
  const router = code('app/router.tsx');

  it('has an address, so Back and reload are the browser’s again', () => {
    expect(router).toMatch(/path: '\/social\/read\/:id'/);
    expect(helpers).toMatch(/\/social\/read\/\$\{encodeURIComponent\(postId\)\}/);
  });

  it('left the grid entirely — no dialog, no rectangle, no scroll-to-the-post', () => {
    /* The three moving parts of the overlay, each of which is how the old
       version arrived mid-card. If any comes back, so does the defect. */
    expect(grid).not.toMatch(/PostReader/);
    expect(grid).not.toMatch(/originRect/);
    expect(grid).not.toMatch(/getBoundingClientRect\(\); setOpenId/);
    expect(grid).not.toMatch(/aria-modal="true" aria-label="Posts"/);
  });

  it('opens on the post you tapped by putting it FIRST, not by scrolling to it', () => {
    // items.slice(at) — the tapped post, then the wall after it. No
    // scrollIntoView runs on arrival, which is the whole point.
    expect(page).toMatch(/const column = at >= 0 \? items\.slice\(at\) : \[\]/);
    expect(page).not.toMatch(/startRef|scrollIntoView\(\{ block: 'start' \}\)/);
  });

  it('keeps asking for pages until the post is found, and only then says it is not there', () => {
    // A wall is paged; a reload of this address has none of the grid's pages.
    expect(page).toMatch(/if \(at >= 0 \|\| !hasNextPage \|\| isFetchingNextPage\) return;\s*void fetchNextPage\(\);/);
  });

  it('still advances to the next VIDEO, and still never wraps', () => {
    expect(page).toMatch(/p\.media\.some\(\(m\) => m\.kind === 'video'\)/);
    expect(page).toMatch(/if \(i < 0 \|\| i \+ 1 >= videoIds\.length\) return;/);
    expect(page).toMatch(/onVideoEnded=\{\(\) => advance\(p\.id\)\}/);
  });

  it('turns the loop off where something is waiting for the end', () => {
    // Unchanged, and load-bearing for the line above: a looping video never
    // fires `ended`, so an auto-advance wired to it would be dead code that
    // typechecked.
    expect(card).toMatch(/loop=\{!onEnded && \(isNew \|\| autoInView\)\}/);
    expect(card).toMatch(/onEnded=\{onEnded\}/);
    // Only the first video of a card reports its end — a carousel of clips
    // would otherwise advance the column three times.
    expect(card).toMatch(/onEnded=\{i === 0 \? onVideoEnded : undefined\}/);
  });

  it('puts the citizen back on the tile they were reading', () => {
    /* Back to a grid of ninety tiles lands at the top of it, three screens
       above the post just closed. The id is left on the way out and TAKEN
       (once) on the way back, and only cleared when the tile is actually
       found — so a grid still loading its first page does not swallow it. */
    expect(grid).toMatch(/rememberTile\(p\.id\); navigate\(/);
    expect(grid).toMatch(/returnTo\.current = takeRememberedTile\(\)/);
    expect(grid).toMatch(/returnTo\.current = null;\s*el\.scrollIntoView\(\{ block: 'center' \}\)/);
    expect(helpers).toMatch(/sessionStorage\.removeItem\(RETURN_KEY\)/);
  });

  it('reads someone else’s wall through the same page, not a second one', () => {
    expect(helpers).toMatch(/return handle \? `\$\{base\}\?of=\$\{encodeURIComponent\(handle\)\}` : base;/);
    expect(page).toMatch(/const of = params\.get\('of'\)/);
    // …and the author's own tools are the author's: no cover, no sorting, on
    // a wall that is not yours.
    expect(page).toMatch(/const mine = !of;/);
    expect(page).toMatch(/manage=\{mine\}/);
  });
});
