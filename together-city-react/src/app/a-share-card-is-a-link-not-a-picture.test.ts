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
describe('the social share cards carry no media URL', () => {
  for (const file of ['features/social/PostCard.tsx', 'features/social/ReelsView.tsx']) {
    it(`${file} sends no picture on the card`, () => {
      const body = code(file);
      const card = body.slice(body.indexOf('const shareCard'), body.indexOf('};', body.indexOf('const shareCard')));
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
    const body = code('features/social/PostCard.tsx');
    const card = body.slice(body.indexOf('const shareCard'), body.indexOf('};', body.indexOf('const shareCard')));
    expect(card).toMatch(/kind:\s*'post'/);
    expect(card).toMatch(/title:/);
  });
});
