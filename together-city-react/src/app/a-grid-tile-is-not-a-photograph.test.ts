import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
const code = (p: string) =>
  read(p).replace(/(^[ \t]*|\{)\/\*[\s\S]*?\*\//gm, '$1 ').replace(/^\s*\/\/.*$/gm, ' ');

/**
 * ── A GRID TILE IS NOT A PHOTOGRAPH ─────────────────────────────────────────
 *
 * A video has carried a poster frame since the composer was written, and every
 * grid in the app renders that instead of the video. An image had no
 * equivalent: the profile grid, the desktop wall and the share tiles all
 * loaded the FULL 1600px photograph to fill a box a few hundred pixels wide —
 * eighteen of them on a profile, decoded on the main thread, for perhaps a
 * twentieth of the pixels each.
 *
 * Every photograph now uploads a 640px copy alongside it, in `thumbUrl` — the
 * same field a video's cover frame uses, so both kinds of media are read the
 * same way everywhere.
 *
 * The full image is still what the feed card and the opened post show. A
 * thumbnail there would be visibly soft, and the card is the one place where
 * the photograph IS the point. That distinction is the whole design and the
 * tests below hold both halves of it.
 */
describe('the composer makes a small copy of every photograph', () => {
  const composer = code('features/social/pages/CreatePost.tsx');

  it('encodes a grid-sized copy as well as the full one', () => {
    expect(composer).toMatch(/const THUMBDIM = 640;/);
    expect(composer).toMatch(/encodeAt\(img, MAXDIM,/);
    expect(composer).toMatch(/encodeAt\(img, THUMBDIM,/);
  });

  it('keeps the full image at 1600, because the card still shows it', () => {
    // If this ever becomes the thumbnail size, the feed card goes soft and
    // nobody would know why.
    expect(composer).toMatch(/const MAXDIM = 1600;/);
  });

  it('rides the poster field a video already uses, rather than a second path', () => {
    // `item.poster` is uploaded to `posterKey` and sent as `thumbUrl`. One
    // shape for two kinds of media means the retry and forget logic below it
    // needs no second case.
    expect(composer).toMatch(/type: 'image'[^}]*poster: thumb/);
  });
});

describe('the tiles read the small copy and the card reads the photograph', () => {
  it('the wall tile prefers a thumbnail and falls back to the full image', () => {
    // The fallback is not decoration: every post made before today has no
    // image thumbnail, and a wall of blank tiles would be a worse bug than the
    // one this fixes.
    const poster = code('features/social/Poster.tsx');
    expect(poster).toMatch(/m\.kind === 'image' \? \(m\.thumbUrl \?\? m\.url\) : m\.thumbUrl/);
    // Every picture on the post, not just the first — the same rule as before,
    // now reading the same field.
    expect(poster).toMatch(/post\.media\s*\.map\(small\)/);
  });

  it('the profile grid already preferred it, and now gets one', () => {
    const profile = code('features/social/pages/Profile.tsx');
    expect(profile).toMatch(/first\.thumbUrl \|\| first\.url/);
  });

  it('the feed card still shows the full photograph', () => {
    // ImgCell renders m.url. A thumbnail here would be the whole point lost.
    const card = code('features/social/PostCard.tsx');
    expect(card).toMatch(/<ImgCell url=\{images\[0\]\.url\}/);
  });
});
