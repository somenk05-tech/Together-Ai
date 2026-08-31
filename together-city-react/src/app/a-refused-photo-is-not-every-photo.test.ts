import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const code = (p: string) =>
  readFileSync(join(SRC, p), 'utf8')
    .replace(/(^[ \t]*|\{)\/\*[\s\S]*?\*\//gm, '$1 ')
    .replace(/^\s*\/\/.*$/gm, ' ');

/**
 * ── A REFUSED PHOTO IS NOT EVERY PHOTO ──────────────────────────────────────
 *
 * The composer memoises upload keys so pressing Share twice does not re-upload
 * sixty megabytes. Screening deletes what it refuses, so after a content
 * refusal those keys point at nothing and have to be forgotten — that much was
 * right, and it is why the rule exists.
 *
 * It decided from the STATUS CODE: any 403 meant forget every key. But 403 is
 * also what a block, an audience refusal, a failed ownership check and
 * "screening isn't configured" answer with, and none of those deleted
 * anything. So a citizen who hit one of them re-uploaded every photograph in
 * the post for nothing, on a phone, on mobile data. The number means five
 * things; only one of them is "the bytes are gone".
 *
 * The server says which, in the body. ABSENT MEANS KEEP: an older API sends no
 * flag, and keeping a key that turns out to be dead costs one honest error
 * message, where discarding a live one costs the upload again.
 */
describe('the composer forgets its upload keys only when the server says the bytes are gone', () => {
  const body = code('features/social/pages/CreatePost.tsx');
  const forget = body.slice(
    body.indexOf('mediaDiscarded'),
    body.indexOf('setErrMsg', body.indexOf('mediaDiscarded')),
  );

  it('reads the fact rather than inferring it from the status code', () => {
    expect(forget).not.toBe('');
    expect(forget).toMatch(/mediaDiscarded/);
    expect(forget).toMatch(/=== true/);
  });

  it('no longer keys the decision on 403', () => {
    // The exact line this replaces. If it comes back, so does the needless
    // re-upload on every non-screening refusal.
    expect(body).not.toMatch(/if\s*\(\s*status === 403\s*\)/);
  });

  it('still clears both keys when it does decide to forget', () => {
    // Forgetting `key` and leaving `posterKey` would retry a video with a
    // poster the bucket no longer has.
    expect(forget).toMatch(/m\.key = undefined/);
    expect(forget).toMatch(/m\.posterKey = undefined/);
  });

  it('still uses the status code for the thing a status code can say', () => {
    // 413 is about size and needs no server flag; this is not an argument
    // against status codes, only against overloading one.
    expect(body).toMatch(/status === 413/);
  });
});
