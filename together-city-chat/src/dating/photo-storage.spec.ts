import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatingService } from './dating.service';
import { StorageProvider } from '../media/storage.provider';

/**
 * Dating photos are private objects, signed per viewer. (M3.)
 *
 * They were base64 data URLs inlined into every list payload — slow, capped by
 * the 2 MB extras blob, and duplicated to every candidate card. Moving them to
 * storage is the obvious fix and the obvious fix has a trap in it: a PUBLIC
 * bucket would be faster and permanently readable by anyone who ever saw a URL,
 * which trades a performance problem for a privacy one and falsifies the
 * sentence the Dating Terms now carry — that photos are shown only to people
 * the profile allows. Private bucket, short signed GETs, gate intact.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

function build() {
  const s: any = Object.create(DatingService.prototype);
  const signed: string[] = [];
  s.storage = {
    presignPrivateDownload: async (key: string) => {
      signed.push(key);
      return key.includes('unsignable') ? null : `https://signed.example/${key}?exp=300`;
    },
  };
  // Every entry here has passed review; the fail-closed case is its own test.
  s.photoMod = { approvedOf: async (keys: string[]) => new Set(keys.filter((k) => !k.includes('unreviewed'))) };
  return { s, signed };
}

describe('what a stored entry becomes', () => {
  it('a key is signed, briefly, per viewer', async () => {
    const { s, signed } = build();
    const out = await s.photoUrls(['dating/u1/abc.jpg']);
    expect(out[0]).toContain('https://signed.example/dating/u1/abc.jpg');
    expect(signed).toEqual(['dating/u1/abc.jpg']);
  });

  it('a legacy base64 photo still renders — there is no migration', async () => {
    const { s, signed } = build();
    const data = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
    expect(await s.photoUrls([data])).toEqual([data]);
    expect(signed).toEqual([]);          // nothing was asked of storage
  });

  it('an http entry is DROPPED, never emitted (blocker 04, 27 Aug)', async () => {
    // The account-photo URL used to pass through here. It is an unreviewed
    // remote image and an IP tracker; it is dropped now, at read and at write.
    const { s } = build();
    expect(await s.photoUrls(['https://cdn.example/me.jpg'])).toEqual([]);
  });

  it('a key that will not sign is DROPPED, not emitted raw', async () => {
    // A key is not a URL. Passing it through puts a broken image on a profile
    // card, which is worse than one photo fewer.
    const { s } = build();
    const out = await s.photoUrls(['dating/u1/unsignable.jpg', 'dating/u1/ok.jpg']);
    expect(out).toHaveLength(1);
    expect(out[0]).toContain('ok.jpg');
  });

  it('an entry nobody has approved is not shown, and is not even signed', async () => {
    // Fail-closed (26 Aug): no verdict reads as "not yet", for a vault key and
    // a legacy inline photo alike. The storage layer is never asked.
    const { s, signed } = build();
    const out = await s.photoUrls(['dating/u1/unreviewed.jpg', 'data:image/png;base64,unreviewed', 'dating/u1/ok.jpg']);
    expect(out).toHaveLength(1);
    expect(signed).toEqual(['dating/u1/ok.jpg']);
  });

  it('a key and a legacy blob show; an http entry does not', async () => {
    // Two shapes now, not three: an approved vault key (signed) and a legacy
    // data: blob. The http shape is gone — see the drop above.
    const { s } = build();
    const out = await s.photoUrls(['dating/u1/a.jpg', 'data:image/png;base64,AAA', 'https://cdn.example/b.jpg']);
    expect(out).toHaveLength(2);
    expect(out.some((u: string) => u.startsWith('http') && u.includes('cdn.example'))).toBe(false);
  });
});

describe('whose photo you may file against your own profile', () => {
  const own = (entries: unknown) => {
    const s: any = Object.create(DatingService.prototype);
    return s.ownPhotosOnly('u1', entries);
  };

  it("refuses somebody else's key", () => {
    // Without this, pasting another citizen's key into extras would have put
    // their face on this profile and the read path would have signed it.
    expect(own(['dating/u2/theirs.jpg'])).toEqual([]);
    expect(own(['dating/u1/mine.jpg'])).toEqual(['dating/u1/mine.jpg']);
  });

  it('refuses a key shaped to look like a prefix match', () => {
    expect(StorageProvider.isOwnDatingKey('u1', 'dating/u12/nope.jpg')).toBe(false);
    expect(StorageProvider.isOwnDatingKey('u1', 'health/u1/nope.jpg')).toBe(false);
    expect(StorageProvider.isOwnDatingKey('u1', 'dating/u1/yes.jpg')).toBe(true);
  });

  it('lets a legacy blob through but NOT an http URL (blocker 04)', () => {
    // data: is a legacy inline photo the citizen already has; an http URL is an
    // arbitrary remote image and is refused at the write, not just the read.
    expect(own(['data:image/png;base64,AAA', 'https://cdn.example/x.jpg'])).toEqual(['data:image/png;base64,AAA']);
  });

  it('caps the gallery and survives rubbish', () => {
    expect(own(Array.from({ length: 30 }, (_, i) => `dating/u1/${i}.jpg`))).toHaveLength(10);
    expect(own(['', null, 7, {}, 'dating/u1/ok.jpg'])).toEqual(['dating/u1/ok.jpg']);
    expect(own('not an array')).toEqual([]);
    expect(own(undefined)).toEqual([]);
  });
});

/**
 * ── THE SELFIE IS NOT ONE OF THE PICTURES ───────────────────────────────────
 *
 * Owner, 27 Aug: "the selfie should not become the part of the profile
 * pictures displayed, that should be only for verification."
 *
 * It shipped under `dating/<userId>/` — the same namespace as the photos
 * people choose to show. Nothing displayed it, but nothing could have STOPPED
 * it being displayed: `ownPhotosOnly` admits any key in that namespace, so one
 * line putting the selfie into `extras.photos` would have put an unchosen
 * frame on a profile, and afterwards no check anywhere could have told the two
 * apart. The fix is a prefix, because a prefix is a fact about the string
 * rather than a promise about the code around it.
 *
 * These four are the ways it comes back: the photo gate widening, the selfie
 * gate widening, the two prefixes colliding, and the display path learning to
 * read the mark.
 */
describe('the selfie is not one of the pictures', () => {
  const SELFIE = 'dating-selfie/u1/face.jpg';
  const PHOTO = 'dating/u1/beach.jpg';

  it('a photo list will not accept a selfie key', () => {
    const s: any = Object.create(DatingService.prototype);
    // Not "is dropped later" — never admitted. The filter is the same one that
    // keeps somebody else's face off your profile.
    expect(s.ownPhotosOnly('u1', [PHOTO, SELFIE])).toEqual([PHOTO]);
    expect(StorageProvider.isOwnDatingKey('u1', SELFIE)).toBe(false);
  });

  it('and the selfie gate will not accept a photo key', () => {
    // The inverse matters just as much: if a profile photo satisfied this, the
    // camera-only capture could be bypassed by filing a picture already on the
    // profile, which is the forgeable badge again wearing the new endpoint.
    expect(StorageProvider.isOwnDatingSelfieKey('u1', PHOTO)).toBe(false);
    expect(StorageProvider.isOwnDatingSelfieKey('u1', SELFIE)).toBe(true);
    expect(StorageProvider.isOwnDatingSelfieKey('u2', SELFIE)).toBe(false);
  });

  it('keeps the two prefixes from being prefixes of each other', () => {
    // `dating-selfie/` must not start with `dating/`, or every selfie would be
    // a filable photo again by accident, which is exactly today's bug.
    expect(SELFIE.startsWith('dating/')).toBe(false);
    expect(PHOTO.startsWith('dating-selfie/')).toBe(false);
  });

  it('never signs the selfie for anybody, because nothing ever draws it', async () => {
    // The mark travels as a BOOLEAN. The day this returns a URL is the day the
    // selfie becomes a picture somebody can be shown.
    const src = readFileSync(join(__dirname, 'dating.service.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
    expect(src).not.toMatch(/presignPrivateDownload\([^)]*[sS]elfie/);
    expect(src).toMatch(/selfieOnFile: selfieOnFile\(/);
    expect(src).not.toMatch(/selfieUrl/);
  });
});
