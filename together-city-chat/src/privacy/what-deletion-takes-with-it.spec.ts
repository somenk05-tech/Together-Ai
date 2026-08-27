import { PURGE_RULES, whereFor } from './purge-plan';
import { readFileSync } from 'fs';
import { join } from 'path';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1 ');

/**
 * ── WHAT DELETION TAKES WITH IT (audit findings 12 & 13) ────────────────────
 *
 * Presence was handled by the third pass; this file is about STORAGE. Three
 * defects, one theme — the rows were deleted and what the rows pointed at was
 * not:
 *
 *   1. The VERIFICATION SELFIE — the most sensitive image in the product,
 *      collected on the promise it was only ever for verification — survived
 *      the purge, because the rule named `photos` and the selfie's key sits in
 *      the same blob under `selfieKey`.
 *   2. Deleting a dating PROFILE deleted three sets of rows and not one stored
 *      file — and the keys live inside the deleted row, so the photos became
 *      unrecoverable orphans: a face in a bucket with nothing pointing at it.
 *      a column the classification scanner did not know — so the "every model
 *      must be classified" guard never fired and the invites outlived the
 *      purge entirely.
 */
describe('what deletion takes with it', () => {
  it('the purge names the selfie, not just the photos', () => {
    const rule = PURGE_RULES.find((r) => r.model === 'DatingProfile');
    expect(rule?.storageKeysJson?.fields).toEqual(['photos', 'selfieKey']);
  });

  it('the purge reads one key or an array of them, from every named field', () => {
    const svc = code(read('privacy/account-purge.service.ts'));
    expect(svc).toMatch(/for \(const field of rule\.storageKeysJson\.fields\)/);
    expect(svc).toMatch(/Array\.isArray\(raw\) \? raw : raw \? \[raw\] : \[\]/);
  });

  it('deleting the profile deletes the objects, and reads the keys first', () => {
    const svc = code(read('dating/dating.service.ts'));
    const body = svc.slice(svc.indexOf('async deleteProfile'), svc.indexOf('private noticeFor'));
    // The read happens while the row still exists…
    expect(body).toMatch(/findUnique\(\{ where: \{ userId \}, select: \{ extras: true \} \}/);
    // …the photos AND the selfie go…
    expect(body).toMatch(/\[\.\.\.photoKeys, dx\.selfieKey\]/);
    expect(body).toMatch(/deleteHealthObject\(k\)/);
    // …the review rows go with their keys…
    expect(body).toMatch(/datingPhotoReview[\s\S]{0,80}?deleteMany\(\{ where: \{ userId \} \}/);
    // …and the ORDER is the proof: keys are read before the row is deleted.
    expect(body.indexOf('select: { extras: true }')).toBeLessThan(body.indexOf('datingProfile.delete'));
  });

  it('never hands the delete a key that is not ours to delete', () => {
    const svc = code(read('dating/dating.service.ts'));
    // Legacy base64 blobs, account-photo URLs, and inline entries are not
    // vault objects. The purge path has the same guard; this is the immediate
    // path keeping the same rule.
    expect(svc).toMatch(/!k\.startsWith\('data:'\) && !k\.startsWith\('http'\) && !k\.startsWith\('inline\/'\)/);
  });
});
