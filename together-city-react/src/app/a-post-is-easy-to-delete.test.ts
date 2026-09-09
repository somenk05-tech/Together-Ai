import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
const code = (p: string) => read(p).replace(/(^[ \t]*|\{)\/\*[\s\S]*?\*\//gm, '$1 ').replace(/^\s*\/\/.*$/gm, ' ');

/**
 * ── A POST IS EASY TO DELETE (owner, 8 Sep) ─────────────────────────────────
 *
 * "also make it easy to delete posts."
 *
 * Delete existed, in one place: the ••• menu inside an opened card. So getting
 * rid of a post meant opening it, finding the menu, and answering the
 * question — and clearing out ten of them was ten round trips through a
 * reader nobody wanted to read.
 *
 * It is on the tile now as well, in the corner, on the citizen's own wall.
 *
 * EASY TO DELETE IS NOT THE SAME SENTENCE AS EASY TO DELETE BY ACCIDENT, which
 * is why the tile asks the same question the card asks, in the city's own
 * dialog, and why the answer is spelled "Delete post" rather than "OK". A
 * single-press delete on a grid of thumbnails, with photographs leaving the
 * bucket behind it, is a scroll away from a mistake nobody can undo.
 */
describe('deleting a post', () => {
  const grid = code('features/social/pages/Profile.tsx');
  const card = code('features/social/PostCard.tsx');

  it('is offered on the tile itself, not only inside an opened post', () => {
    expect(grid).toMatch(/aria-label="Delete this post"/);
    expect(grid).toMatch(/const del = useDeletePost\(\);/);
  });

  it('asks first, in the city’s own dialog, from both places', () => {
    for (const src of [grid, card]) {
      expect(src).toMatch(/<Confirm open=/);
      expect(src).toMatch(/title="Delete this post\?"/);
      expect(src).toMatch(/confirmLabel=\{del\.isPending \? 'Deleting…' : 'Delete post'\} danger/);
    }
    // Never the browser's own box, which the 4 Sep audit took off this hub.
    expect(grid).not.toMatch(/window\.confirm/);
    expect(card).not.toMatch(/window\.confirm/);
  });

  it('is a thumb-sized target, and does not sit on any other corner’s mark', () => {
    /* The tile's other three corners are taken: the cover/sort door at top
       left, the outdoor pin and the category badge at the top, the date at
       bottom left. The geometry is in the stylesheet rather than inline —
       three new screens of furniture would have been twenty inline style
       objects the size ratchet counts one by one. */
    expect(grid).toMatch(/aria-label="Delete this post" className="sl-tile-del"/);
    const css = readFileSync(join(SRC, 'styles/social.css'), 'utf8');
    const rule = css.slice(css.indexOf('.sl-tile-del {'), css.indexOf('}', css.indexOf('.sl-tile-del {')));
    expect(rule).toMatch(/bottom: 0; right: 0; width: 44px; height: 44px/);
  });

  it('says so when the delete failed, rather than leaving the tile there in silence', () => {
    expect(grid).toMatch(/That post wasn’t deleted — it is still here\. Try again\./);
    expect(grid).toMatch(/role="alert"/);
  });

  it('takes the post off every list that was showing it', () => {
    // The mutation's own cache work — the feed, the bookmarks and the profile
    // grid — is what makes a delete from either place look like one delete.
    const api = code('features/social/api.ts');
    expect(api).toMatch(/queryKey: \['profile', 'posts'\]/);
  });
});
