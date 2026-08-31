import { DatingService } from './dating.service';
import { StorageProvider } from '../media/storage.provider';

/**
 * Blocker 04, second dating audit: `photos` accepted any http(s) URL, which
 * bypassed the whole review pipeline and let the card load a remote image
 * (unmoderated, swappable, an IP tracker). These call the real filter/read
 * paths and assert an http entry cannot get in or out.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
describe('an arbitrary URL is never a dating photo (blocker 04)', () => {
  const ownKey = 'dating/U1/abc.jpg';

  it('ownPhotosOnly drops http and keeps the citizen\'s own keys', () => {
    const s: any = Object.create(DatingService.prototype);
    const out = (s.ownPhotosOnly as any).call(s, 'U1', [
      'https://attacker.tld/x.jpg',
      'http://attacker.tld/y.png',
      ownKey,
      StorageProvider.isOwnDatingKey('U1', ownKey) ? ownKey : 'dating/OTHER/z.jpg',
      'dating/OTHER/z.jpg',
    ]);
    expect(out).not.toContain('https://attacker.tld/x.jpg');
    expect(out).not.toContain('http://attacker.tld/y.png');
    expect(out).toContain(ownKey);
    expect(out).not.toContain('dating/OTHER/z.jpg');   // ownPhotosOnly = the caller's own only
  });

  /**
   * NO NEW INLINE PHOTOS (31 Aug, sixth pass). A data: entry's review id is a
   * digest of the string, so an approval belongs to the bytes and anyone
   * pasting the same string wears it — and inline blobs were the last thing
   * justifying a 2 MB extras ceiling. Only entries ALREADY STORED on this
   * profile round-trip, so a legacy gallery survives its owner editing a bio,
   * and the door lets an inline photo back in but never in.
   */
  it('a data: entry is kept only when this profile already stored it', () => {
    const s: any = Object.create(DatingService.prototype);
    const legacy = 'data:image/png;base64,AAAA';
    const fresh = 'data:image/png;base64,BBBB';
    const kept = (s.ownPhotosOnly as any).call(s, 'U1', [legacy, fresh, ownKey], [legacy]);
    expect(kept).toContain(legacy);
    expect(kept).not.toContain(fresh);
    expect(kept).toContain(ownKey);
    // And with no prior at all, no inline photo enters.
    expect((s.ownPhotosOnly as any).call(s, 'U1', [fresh])).toEqual([]);
  });

  it('photoUrls never emits an http entry, even one already stored', async () => {
    const s: any = Object.create(DatingService.prototype);
    s.photoMod = { approvedOf: async () => new Set<string>() };  // nothing approved
    s.storage = { datingPhotoUrl: async () => 'signed://never' };
    const out = await (s.photoUrls as any).call(s, 'viewer', ['https://attacker.tld/x.jpg', 'data:image/png;base64,AAAA']);
    expect(out).not.toContain('https://attacker.tld/x.jpg');
  });

  it('fillPhotos never serves an http entry', async () => {
    const s: any = Object.create(DatingService.prototype);
    s.photoMod = { approvedOf: async () => new Set<string>() };
    s.storage = { datingPhotoUrl: async () => 'signed://never' };
    const into: string[] = [];
    await (s.fillPhotos as any).call(s, 'viewer', [{ keys: ['https://attacker.tld/x.jpg'], into }]);
    expect(into).toHaveLength(0);
  });
});
