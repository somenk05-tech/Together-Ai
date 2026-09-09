import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
/** Comments quote the old line as the thing they exist to correct, so only
 *  what actually runs is read. Same trick as what-you-are-told-when-you-leave. */
const code = (p: string) =>
  read(p).replace(/(^[ \t]*|\{)\/\*[\s\S]*?\*\//gm, '$1 ').replace(/^\s*\/\/.*$/gm, ' ');

/**
 * ── A SHARE CARD IS A LINK, NOT A PICTURE ───────────────────────────────────
 *
 * Social post media is a private-bucket key signed on read, so `media[].url`
 * and `media[].thumbUrl` in this app are presigned GETs. Both social share
 * cards put one into `ShareCard.image`, which the API persists on the message
 * row and the recipient's client renders.
 *
 * The API drops a presigned card picture now, which closes it for every
 * client. This asserts the other end, because the two halves deploy
 * separately and the web app should not be sending a credential it expects the
 * server to take off its hands.
 *
 * The deep link is what carries the share: it goes to the permalink, and the
 * permalink asks whether the recipient may see the post.
 */
/**
 * WHERE THE CARD IS BUILT MOVED (9 Sep). PostCard's literal became
 * `postShareCard(post)` when the television grew a Send key of its own — two
 * copies of a share card is two answers to "what does a shared post look
 * like" the first time either is corrected, and this file IS that correction.
 * So the slice starts at whichever of the two markers a file has.
 */
const cardOf = (body: string): string => {
  const at = body.indexOf('postShareCard(post: Post): ShareCard {');
  const from = at >= 0 ? at : body.indexOf('const shareCard');
  return from < 0 ? '' : body.slice(from, body.indexOf('};', from));
};

describe('the social share cards carry no media URL', () => {
  for (const file of ['features/social/PostCard.tsx', 'features/social/ReelsView.tsx']) {
    it(`${file} sends no picture on the card`, () => {
      const card = cardOf(code(file));
      expect(card).not.toBe('');
      // The one line this file exists for.
      expect(card).toMatch(/image:\s*null/);
      expect(card).not.toMatch(/image:.*\b(url|thumbUrl)\b/);
      // …and the link that replaces it is still there and still the permalink.
      expect(card).toMatch(/deepLink:\s*`\/social\/p\/\$\{post\.id\}`/);
    });
  }

  it('reads a card that is really there', () => {
    // A slice that came back empty would satisfy `not.toMatch` for the wrong
    // reason, so the shape of a real card is asserted too.
    const card = cardOf(code('features/social/PostCard.tsx'));
    expect(card).toMatch(/kind:\s*'post'/);
    expect(card).toMatch(/title:/);
  });

  it('the television sends through the same builder, and writes no card of its own', () => {
    /* Owner, 9 Sep: "add a send button on the videos too." Every photograph in
       the city could be sent from its card; the one place a video actually
       PLAYS could not. The key opens the same sheet with the same card — and
       a literal here would be exactly the second copy this file guards. */
    const tv = code('features/social/CityTV.tsx');
    expect(tv).toMatch(/postShareCard\(post\)/);
    expect(tv).toMatch(/<ShareModal item=\{postShareCard\(post\)\}/);
    expect(tv).not.toMatch(/kind: 'post'/);
    expect(tv).not.toMatch(/image:/);
  });
});
