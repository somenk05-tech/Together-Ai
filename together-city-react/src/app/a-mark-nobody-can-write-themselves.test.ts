import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
/** Comments stripped: most of what follows is "this page does NOT do X", and
 *  the essays above these lines name the very things being forbidden.
 *
 *  A block comment is only recognised where one can actually START — at the
 *  head of a line, or just inside a JSX brace. The blunter version of this
 *  helper used elsewhere swallows this very page from `accept="image/*"`
 *  onward, taking the selfie call site with it, and an absence check that
 *  passes because its subject was deleted is not a check. */
const code = (p: string) =>
  read(p).replace(/(^[ \t]*|\{)\/\*[\s\S]*?\*\//gm, '$1 ').replace(/^\s*\/\/.*$/gm, ' ');

/**
 * ── A MARK NOBODY CAN WRITE THEMSELVES ──────────────────────────────────────
 *
 * The owner, 27 Aug: "fix self verification for getting that verified profile
 * tab." The page had offered a camera selfie since H5 and had never once kept
 * one. Both halves of that were correct on their own:
 *
 *   · the capture wrote `selfieVerified: true` into the profile's `extras`
 *     blob, because that is where the form's own answers go; and
 *   · `upsertProfile` deleted it on arrival, because a badge the browser can
 *     write is a badge anyone with curl can forge.
 *
 * What was missing was the third thing — a write site the SERVER owns. The
 * selfie now goes to the private bucket like every other dating photo and the
 * KEY is handed to POST /dating/selfie, which is the only code path that can
 * set the mark. `carrySelfie` re-applies it on every profile save, so an edit
 * can neither forge a selfie nor lose one (that half is pinned server-side, in
 * dating/selfie.spec.ts).
 *
 * These are the two ways the bug comes back:
 *
 *   1. THE CLIENT AUTHORS THE MARK AGAIN. Any `selfieVerified`/`selfiePhoto`
 *      written into `extras` is both forgeable and — since the server strips
 *      it — silently discarded. That combination is what made this a bug
 *      nobody could see: the page said "saved" and meant nothing.
 *   2. THE PAGE INFERS THE STATE INSTEAD OF READING IT. The button, the
 *      preview and the match's view have to be one fact from one place, or
 *      "No selfie yet" reappears beside a selfie.
 */
describe('a mark nobody can write themselves', () => {
  const profile = code('features/dating/pages/DatingProfile.tsx');
  const detail = code('features/dating/pages/DatingMatchDetail.tsx');
  const api = code('features/dating/api.ts');
  const api2 = code('api/media.api.ts');

  it('never writes the mark from the browser', () => {
    // Not into extras, not into the form state, not anywhere. The words may
    // still appear in the essays above the code — `code` strips those.
    for (const forged of ['selfieVerified', 'selfiePhoto', 'selfieVerifiedAt']) {
      expect({ forged, written: profile.includes(forged) }).toEqual({ forged, written: false });
    }
  });

  it('sends the bucket key to the endpoint that owns the mark', () => {
    // Presigned PUT to the private bucket, and only the key travels on. A data
    // URL here would be the old bug wearing the new endpoint's clothes.
    expect(profile).toMatch(/mediaApi\.uploadDatingSelfie\(new File\(\[blob\]/);
    expect(profile).toMatch(/onSaved=\{\(key\) => saveSelfie\.mutate\(key\)\}/);
    expect(api).toMatch(/saveSelfie: \(key: string\) => api\.post<[^>]*>\('\/dating\/selfie'/);
    expect(api).toMatch(/clearSelfie: \(\) => api\.delete<[^>]*>\('\/dating\/selfie'\)/);
  });

  it('reads the state back from the profile, and from nowhere else', () => {
    // Off the LIVE read, not off `data` — `data` prefers the save response,
    // which can predate a selfie taken after the form was submitted.
    expect(profile).toMatch(/const selfieOnFile = Boolean\(existing\.data\?\.selfieOnFile/);
    expect(profile).toMatch(/onFile=\{selfieOnFile\}/);
    expect(profile).toMatch(/const verified = selfieOnFile;/);
    // Both mutations refetch rather than guessing at the new state.
    expect(api).toMatch(/mutationFn: \(key: string\) => datingApi\.saveSelfie\(key\)[\s\S]{0,140}invalidateQueries\(\{ queryKey: \['dating', 'profile'\] \}\)/);
  });

  it('says the failure out loud, because a silent one is what this was', () => {
    expect(profile).toMatch(/failed: string \| null/);
    expect(profile).toMatch(/saveSelfie\.isError \?/);
  });

  /**
   * AND IT IS NOT ONE OF THEIR PICTURES (owner, 27 Aug: "the selfie should not
   * become the part of the profile pictures displayed, that should be only for
   * verification").
   *
   * The selfie shipped into the SAME storage namespace as the photos, so
   * nothing but convention kept it off a profile. It now writes to a namespace
   * of its own through a route of its own — `uploadDating` would put it back
   * among the pictures, and `ownPhotosOnly` would then happily show it. The
   * server half of this is pinned in dating/photo-storage.spec.ts.
   */
  it('uploads the selfie somewhere a photo list cannot reach', () => {
    expect(api2).toMatch(/uploadDatingSelfie[\s\S]{0,300}'\/dating\/selfie\/presign'/);
    // The photo route stays the photo route: one call each, neither borrowed.
    expect(api2).toMatch(/uploadDating\(file: File\)[\s\S]{0,300}'\/dating\/photos\/presign'/);
    // And the page still promises it in words, next to the button.
    expect(read('features/dating/pages/DatingProfile.tsx'))
      .toMatch(/It is never added to your photos\./);
  });

  /**
   * AND THE MATCH SEES IT — which is the "verified profile tab" the request
   * was actually about. It is drawn BESIDE the confirmed-email mark and never
   * folded into it: `verified` on a candidate means the email and only the
   * email, and one mark standing for two different checks is how a tick starts
   * meaning "we know who this is" again.
   */
  it('shows the mark to the person deciding whether to meet them', () => {
    expect(detail).toMatch(/<EmailConfirmed on=\{d\.verified\} \/>/);
    expect(detail).toMatch(/<SelfieOnFile on=\{Boolean\(d\.selfieOnFile\)\} \/>/);
    expect(detail).toMatch(/SELFIE_ON_FILE_NOTE/);
    // Two facts, two fields, all the way from the server.
    expect(api).toMatch(/selfieOnFile\?: boolean/);
  });
});
