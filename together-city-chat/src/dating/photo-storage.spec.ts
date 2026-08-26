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

  it('the account-photo fallback passes through untouched', async () => {
    const { s } = build();
    expect(await s.photoUrls(['https://cdn.example/me.jpg'])).toEqual(['https://cdn.example/me.jpg']);
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

  it('the three shapes mix, because for a long time they will', async () => {
    const { s } = build();
    const out = await s.photoUrls(['dating/u1/a.jpg', 'data:image/png;base64,AAA', 'https://cdn.example/b.jpg']);
    expect(out).toHaveLength(3);
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

  it('lets legacy blobs and account photos through — they are not keys', () => {
    expect(own(['data:image/png;base64,AAA', 'https://cdn.example/x.jpg'])).toHaveLength(2);
  });

  it('caps the gallery and survives rubbish', () => {
    expect(own(Array.from({ length: 30 }, (_, i) => `dating/u1/${i}.jpg`))).toHaveLength(10);
    expect(own(['', null, 7, {}, 'dating/u1/ok.jpg'])).toEqual(['dating/u1/ok.jpg']);
    expect(own('not an array')).toEqual([]);
    expect(own(undefined)).toEqual([]);
  });
});
