/* eslint-disable @typescript-eslint/no-explicit-any */
import { DatingService } from './dating.service';
import { StorageProvider } from '../media/storage.provider';
import { mintPhotoToken, readPhotoToken } from './photo-link';

/**
 * ── A PHOTO LINK IS CHECKED AGAIN, EVERY TIME IT IS FETCHED ──
 *
 * A presigned S3 URL is a bearer link. S3 checks the signature and nothing
 * else, so the question "may this person see this photograph" was answered once
 * — inside the authenticated card request that minted the URL — and never
 * again. Block the person whose card you were looking at, have their profile
 * taken down, have the photo rejected in review: every link already handed out
 * kept working. Shortening the window from 300 seconds to 60 made that smaller
 * without making it different.
 *
 * `GET /dating/photo/:token` is the different shape. The token names a viewer
 * and a key, so the API can be asked again on every fetch, from live rows.
 *
 * WHAT THIS IS NOT: proof of who is holding the string. A copied link still
 * works for whoever has it while the named viewer's permission lasts. The rest
 * needs images fetched through the session itself, which is a change on both
 * sides of the wire. This is the half that removes the un-revokable part.
 */
const SECRET = 'a-secret-of-at-least-thirty-two-characters';
const NOW = 1_800_000_000_000;

describe('the token', () => {
  it('round-trips the viewer and the key it was minted for', () => {
    const t = mintPhotoToken(SECRET, 'viewer', 'dating/owner/a.jpg', 60, NOW);
    expect(readPhotoToken(SECRET, t, NOW)).toEqual({ viewerId: 'viewer', key: 'dating/owner/a.jpg' });
  });

  it('is refused once it has expired', () => {
    const t = mintPhotoToken(SECRET, 'viewer', 'dating/owner/a.jpg', 60, NOW);
    expect(readPhotoToken(SECRET, t, NOW + 61_000)).toBeNull();
  });

  it('is refused when the body is edited to name another photograph', () => {
    const t = mintPhotoToken(SECRET, 'viewer', 'dating/owner/a.jpg', 60, NOW);
    const [, sig] = t.split('.');
    const forged = `${Buffer.from(JSON.stringify({ v: 'viewer', k: 'dating/someone-else/b.jpg', e: NOW / 1000 + 60 })).toString('base64url')}.${sig}`;
    expect(readPhotoToken(SECRET, forged, NOW)).toBeNull();
  });

  it('is refused under a different secret — the link does not survive a rotation', () => {
    const t = mintPhotoToken(SECRET, 'viewer', 'dating/owner/a.jpg', 60, NOW);
    expect(readPhotoToken('another-secret-of-at-least-32-chars!!', t, NOW)).toBeNull();
  });

  it('is refused when it is nonsense', () => {
    for (const junk of ['', '.', 'x', 'a.b', 'not-a-token-at-all']) {
      expect(readPhotoToken(SECRET, junk, NOW)).toBeNull();
    }
  });
});

describe('the key names its owner', () => {
  it('reads the citizen out of a photo key', () => {
    expect(StorageProvider.datingKeyOwner('dating/u1/abc.jpg')).toBe('u1');
  });

  it('refuses every other shape, including a verification selfie', () => {
    for (const k of ['dating-selfie/u1/abc.jpg', 'health/u1/x.pdf', 'dating/u1/a/b.jpg', 'dating/u1', '', 'x']) {
      expect(StorageProvider.datingKeyOwner(k)).toBeNull();
    }
  });
});

function build(over: Partial<{ approved: boolean; viewerOk: boolean; ownerOk: boolean; blocked: string[] }> = {}) {
  const o = { approved: true, viewerOk: true, ownerOk: true, blocked: [] as string[], ...over };
  const read = jest.fn(async () => ({ body: {} as any, contentType: 'image/jpeg' }));
  const s: any = Object.create(DatingService.prototype);
  s.storage = {
    readDatingPhotoToken: (t: string) => readPhotoToken(SECRET, t, NOW),
    readPrivateObject: read,
  };
  s.photoMod = {
    approvedOf: async (keys: string[]) => new Set(o.approved ? keys : []),
    // The verdict is about the bytes as well as the key (28 Aug). This suite is
    // about the PERMISSION question, so the bytes always match here; the
    // comparison itself has its own suite, a-verdict-about-the-bytes.
    bytesStillReviewed: async () => true,
  };
  s.blocking = { blockedWith: async () => new Set(o.blocked) };
  s.prisma = {
    datingProfile: {
      findFirst: jest.fn(async ({ where }: any) => {
        if (where.userId === 'viewer') return o.viewerOk ? { userId: 'viewer' } : null;
        return o.ownerOk ? { userId: 'owner' } : null;
      }),
    },
  };
  return { s, read };
}

const link = (viewer = 'viewer', key = 'dating/owner/a.jpg') => mintPhotoToken(SECRET, viewer, key, 60, NOW);

describe('fetching a photograph', () => {
  const realNow = Date.now;
  beforeAll(() => { Date.now = () => NOW; });
  afterAll(() => { Date.now = realNow; });

  it('serves it when everything still holds', async () => {
    const { s, read } = build();
    expect(await s.openPhoto(link())).not.toBeNull();
    expect(read).toHaveBeenCalledWith('dating/owner/a.jpg');
  });

  it('refuses it the moment the viewer blocks the owner — the link was already minted', async () => {
    const { s, read } = build({ blocked: ['owner'] });
    expect(await s.openPhoto(link())).toBeNull();
    expect(read).not.toHaveBeenCalled();
  });

  it('refuses it when the photo has been taken out of review', async () => {
    const { s } = build({ approved: false });
    expect(await s.openPhoto(link())).toBeNull();
  });

  it('refuses it when the owner has been hidden or taken down', async () => {
    const { s } = build({ ownerOk: false });
    expect(await s.openPhoto(link())).toBeNull();
  });

  it('refuses it when the viewer no longer has an approved profile of their own', async () => {
    const { s } = build({ viewerOk: false });
    expect(await s.openPhoto(link())).toBeNull();
  });

  it('shows you your own photograph even while it is still in review', async () => {
    const { s, read } = build({ approved: false, viewerOk: false, ownerOk: false });
    expect(await s.openPhoto(link('owner'))).not.toBeNull();
    expect(read).toHaveBeenCalledWith('dating/owner/a.jpg');
  });

  it('refuses a selfie key, whatever the token says', async () => {
    const { s } = build();
    expect(await s.openPhoto(mintPhotoToken(SECRET, 'viewer', 'dating-selfie/owner/a.jpg', 60, NOW))).toBeNull();
  });
});
