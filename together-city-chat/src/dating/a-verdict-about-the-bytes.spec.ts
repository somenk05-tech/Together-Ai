import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PhotoModerationService } from './photo-moderation.service';

/**
 * ── AN APPROVAL IS ABOUT A PHOTOGRAPH, NOT ABOUT A NAME ──
 *
 * A presigned PUT is reusable until it expires, and a key is reviewed ONCE:
 * `queue` skips anything whose row is not `pending` and `retryPending` selects
 * only `pending`. The verdict was recorded against the key. So: presign, PUT
 * something ordinary, save the profile, let Rekognition approve it, then PUT
 * whatever you like to the same URL before it expires. approvedOf still says
 * approved, fillPhotos still signs it, mayViewPhoto still passes it, and the
 * new image goes to the whole pool. It also defeats the size and MIME ceilings,
 * which are checked at presign against a client-declared number and at review
 * against the object that was there then.
 *
 * The verdict now carries the object's ETag, and the serve path compares it —
 * free, because the GET that streams the bytes already returns it. A mismatch
 * sends the row back to `pending`, which takes it off every card at once (only
 * `approved` is shown) and puts it in front of the machine again.
 *
 * A NULL recorded etag is allowed through on purpose: those rows were reviewed
 * before the column existed and their upload windows are long gone, so there is
 * nothing left to swap, and refusing them would take every photograph in the
 * hub off the screen to close a door that is already shut.
 */
const svc = readFileSync(join(__dirname, 'photo-moderation.service.ts'), 'utf8');
const dating = readFileSync(join(__dirname, 'dating.service.ts'), 'utf8');
const storage = readFileSync(join(__dirname, '..', 'media', 'storage.provider.ts'), 'utf8');

type Row = { etag: string | null } | null;
function build(row: Row) {
  const updates: Array<Record<string, unknown>> = [];
  const prisma = {
    datingPhotoReview: {
      findUnique: async () => row,
      update: async (a: { data: Record<string, unknown> }) => { updates.push(a.data); return {}; },
    },
  };
  const s = new PhotoModerationService(
    prisma as never, { healthObjectETag: async () => null } as never,
    { get: () => undefined } as never, { track: () => undefined } as never,
  );
  return { s, updates };
}

describe('a verdict about the bytes', () => {
  it('serves the photograph the machine actually looked at', async () => {
    const { s, updates } = build({ etag: '"abc"' });
    await expect(s.bytesStillReviewed('dating/u1/a.jpg', '"abc"')).resolves.toBe(true);
    expect(updates).toEqual([]);
  });

  it('refuses one that was swapped after approval, and sends it back for review', async () => {
    const { s, updates } = build({ etag: '"abc"' });
    await expect(s.bytesStillReviewed('dating/u1/a.jpg', '"different"')).resolves.toBe(false);
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ status: 'pending', etag: null });
  });

  it('grandfathers a row reviewed before the column existed', async () => {
    const { s, updates } = build({ etag: null });
    await expect(s.bytesStillReviewed('dating/u1/a.jpg', '"anything"')).resolves.toBe(true);
    expect(updates).toEqual([]);
  });

  it('lets an inline photo through — there is no object to swap', async () => {
    const { s } = build(null);
    await expect(s.bytesStillReviewed('inline/deadbeef', null)).resolves.toBe(true);
  });

  it('asks the question on the serve path, after the permission question', () => {
    const open = dating.slice(dating.indexOf('async openPhoto('), dating.indexOf('async openPhoto(') + 1600);
    expect(open.indexOf('mayViewPhoto')).toBeLessThan(open.indexOf('bytesStillReviewed'));
    expect(open).toMatch(/bytesStillReviewed\(claim\.key, found\.etag\)/);
  });

  it('records the etag with every verdict, and shrinks the window it defends', () => {
    // From the SAME GET that read the bytes (fifth audit, 31 Aug, medium 4) —
    // a later HEAD could record the identity of a swapped object, and a
    // failed HEAD recorded null, disabling the serve-path check for ever.
    expect(svc).toMatch(/etag: obj\.etag \?\? null/);
    expect(svc).toMatch(/if \(!entry\.startsWith\('data:'\) && !etag\) return 'pending';/);
    expect(svc).toMatch(/etag\?: string \| null/);
    expect(storage).toMatch(/datingUploadExpiresInSec = 120;/);
    expect(storage).toMatch(/etag: out\.ETag \?\? null/);
    // The health vault keeps its own, longer window — a lab report is read by
    // its owner, not screened for strangers.
    expect(storage).toMatch(/expiresInSec = 900;/);
  });
});
