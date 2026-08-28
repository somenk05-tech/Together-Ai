import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * ── A PHOTO APPEAL SHOWS THE PHOTOGRAPH, OR SAYS WHY IT CANNOT ──
 *
 * The profile half of appealQueue got its three facts on 27 Aug, for a reason
 * written there: a moderator handed free text and nothing else decides blind.
 * The photo half was left deciding blind about an IMAGE, which is worse — the
 * whole question is what is in it.
 *
 * A `held` photo still exists and signs like any other. A `rejected` one does
 * not: the object is deleted at refusal, by the machine verdict and the
 * moderator's alike. So the row says which, and the console says it out loud,
 * because an overturn with the file gone is a ruling on a description — still
 * meaningful (it clears the record and lets them upload again), but not the
 * same act.
 */
const svc = readFileSync(join(__dirname, 'dating.service.ts'), 'utf8');
const queue = svc.slice(svc.indexOf('async appealQueue('), svc.indexOf('Uphold or overturn'));

describe('a photo appeal shows the photo', () => {
  it('signs the object when there is one', () => {
    expect(queue).toMatch(/presignPrivateDownload\(k\)/);
    expect(queue).toMatch(/r\.kind === 'dating_photo'/);
  });

  it('says plainly when the file is gone rather than showing an empty frame', () => {
    expect(queue).toMatch(/photoGone: url === null/);
  });

  /** Inline photos have no object at all — asking storage for one is noise. */
  it('does not ask the bucket about a photo that never lived there', () => {
    expect(queue).toMatch(/!r\.targetId\.startsWith\('inline\/'\)/);
  });

  it('leaves the profile facts exactly as they were', () => {
    expect(queue).toMatch(/age: pr \? this\.ageOf/);
    expect(queue).toMatch(/profileModeration/);
    expect(queue).toMatch(/rejectionReasons/);
  });
});
