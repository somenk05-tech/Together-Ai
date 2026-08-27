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

  it('ownPhotosOnly drops http and keeps data: and the citizen\'s own keys', () => {
    const s: any = Object.create(DatingService.prototype);
    const out = (s.ownPhotosOnly as any).call(s, 'U1', [
      'https://attacker.tld/x.jpg',
      'http://attacker.tld/y.png',
      'data:image/png;base64,AAAA',
      ownKey,
      StorageProvider.isOwnDatingKey('U1', ownKey) ? ownKey : 'dating/OTHER/z.jpg',
      'dating/OTHER/z.jpg',
    ]);
    expect(out).not.toContain('https://attacker.tld/x.jpg');
    expect(out).not.toContain('http://attacker.tld/y.png');
    expect(out).toContain('data:image/png;base64,AAAA');
    expect(out).toContain(ownKey);
    expect(out).not.toContain('dating/OTHER/z.jpg');   // ownPhotosOnly = the caller's own only
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
