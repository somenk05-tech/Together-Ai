/* eslint-disable @typescript-eslint/no-explicit-any */
import { AuthService } from '../auth/auth.service';

/**
 * ── A DELETED ACCOUNT THAT LEAVES ITS PICTURES IN A BUCKET ──────────────────
 *
 * That sentence is already in purge-plan.ts. It was written for pet
 * photographs, three hundred lines from the rule that missed it for social
 * posts — whose reason read "Already deleted at soft-delete time, so nothing is
 * left."
 *
 * Every word of that was true about the DATABASE. `deleteAccount` deletes the
 * posts and `PostMedia` cascades. It was silent about the bucket, and the
 * bucket is where the photographs are: nothing anywhere removed the objects, so
 * every photograph and video a citizen had ever posted to Social Life outlived
 * their account, permanently.
 *
 * THE ASYMMETRY THAT SHOULD HAVE GIVEN IT AWAY: `SocialService.deletePost` has
 * cleaned the bucket since 30 Aug. Deleting ONE post removed its files.
 * Deleting the WHOLE ACCOUNT did not.
 *
 * AND WHY THE THIRTY-DAY PURGE COULD NEVER HAVE CAUGHT IT. The purge is the
 * repo's answer to "the rows outlived the request", and it has a whole
 * vocabulary for storage-bearing models. It was no use here, because deleting
 * the post rows DESTROYS THE ONLY RECORD OF WHICH OBJECTS TO DELETE. By the
 * time the purge runs there is nothing left to ask. That is why the fix is at
 * soft-delete time and cannot be anywhere else, and it is what the first test
 * below is really asserting.
 */

const ME = 'me-0000';
const PW = 'correct horse';

function svc(over: { media?: Array<{ id: string; url: string; thumbUrl: string | null }>; failOn?: string } = {}) {
  const order: string[] = [];
  const deleted: string[] = [];
  const media = over.media ?? [
    { id: 'm1', url: `social/${ME}/a.jpg`, thumbUrl: null },
    { id: 'm2', url: `social/${ME}/v.mp4`, thumbUrl: `social/${ME}/v.jpg` },
  ];

  const prisma = {
    user: {
      findUnique: async () => ({ id: ME, passwordHash: 'hash', deletedAt: null }),
      update: async () => { order.push('user.update'); return {}; },
    },
    post: { deleteMany: async () => { order.push('post.deleteMany'); return { count: 1 }; } },
    postMedia: {
      findMany: async (a: any) => {
        order.push('postMedia.findMany');
        // The rows are gone once the posts are deleted — modelled, because the
        // whole point is that this read has to happen first.
        if (order.includes('post.deleteMany')) return [];
        return a?.cursor ? [] : media;
      },
    },
    follow: { deleteMany: async () => ({ count: 0 }) },
    connection: { deleteMany: async () => ({ count: 0 }) },
  } as any;

  const storage = {
    isPostKey: (k: string) => /^social\/[^/]+\/[A-Za-z0-9._-]+$/.test(k),
    deletePrivateObject: async (k: string) => {
      if (over.failOn && k === over.failOn) throw new Error('bucket refused');
      order.push(`delete:${k}`);
      deleted.push(k);
    },
  } as any;

  const tokens = { revokeAll: async () => undefined } as any;
  const s = new AuthService(prisma, tokens, {} as never, {} as never, storage);
  // argon2.verify against a fake hash would reject; the password check is not
  // this file's subject, so it is stubbed at the boundary.
  (s as any).constructor;
  return { s, order, deleted, prisma, storage };
}

/** argon2 is a native module and this file is not about passwords. */
jest.mock('argon2', () => ({
  verify: async () => true,
  hash: async () => 'new-hash',
}));

describe('deleting an account takes the photographs with it', () => {
  it('removes every post object from the bucket', async () => {
    const { s, deleted } = svc();
    await s.deleteAccount(ME, PW);
    expect(deleted.sort()).toEqual([
      `social/${ME}/a.jpg`,
      `social/${ME}/v.jpg`,
      `social/${ME}/v.mp4`,
    ]);
  });

  it('takes the video POSTER as well as the video', async () => {
    // Two keys per row, and the thumbnail is the one a partial fix forgets —
    // it is also the frame that shows a face.
    const { s, deleted } = svc();
    await s.deleteAccount(ME, PW);
    expect(deleted).toContain(`social/${ME}/v.jpg`);
  });

  /**
   * THE ORDERING ASSERTION, WHICH IS THE WHOLE FIX.
   *
   * Deleting the rows first is not a slower version of this — it is a
   * PERMANENT loss of the keys, and no later job can recover them. If somebody
   * ever moves this call below the deleteMany for tidiness, everything above
   * still passes and the bug comes back in full.
   */
  it('reads the keys BEFORE deleting the rows that name them', async () => {
    const { s, order } = svc();
    await s.deleteAccount(ME, PW);

    /* THE STEPS ARE ASSERTED TO EXIST BEFORE THEY ARE ASSERTED TO BE IN ORDER.
       Written as `indexOf(a) < indexOf(b)` alone, this passes when step `a`
       never happened at all — `-1 < 0` — which is precisely the state the fix
       exists to leave behind. A test that goes green on the bug it guards is
       worse than no test, because it is also a claim that somebody checked. */
    const read = order.indexOf('postMedia.findMany');
    const rowsGone = order.indexOf('post.deleteMany');
    expect(read).toBeGreaterThanOrEqual(0);
    expect(rowsGone).toBeGreaterThanOrEqual(0);
    expect(read).toBeLessThan(rowsGone);

    for (const k of ['a.jpg', 'v.mp4', 'v.jpg']) {
      const at = order.indexOf(`delete:social/${ME}/${k}`);
      expect(at).toBeGreaterThanOrEqual(0);
      expect(at).toBeLessThan(rowsGone);
    }
  });

  it('still deletes the account when the bucket refuses', async () => {
    // Best-effort by necessity: a bucket having a bad day must not leave a
    // citizen unable to leave. The log is the record — see purgePostObjects.
    const { s, order } = svc({ failOn: `social/${ME}/a.jpg` });
    await expect(s.deleteAccount(ME, PW)).resolves.toEqual({ ok: true });
    expect(order).toContain('post.deleteMany');
    expect(order).toContain('user.update');
  });

  it('ignores values that are not ours to delete', async () => {
    // Legacy inline `data:` photos and old public https URLs are not keys and
    // have nothing in the private bucket behind them.
    const { s, deleted } = svc({
      media: [
        { id: 'm1', url: 'data:image/jpeg;base64,AAAA', thumbUrl: null },
        { id: 'm2', url: 'https://cdn.example.com/old.jpg', thumbUrl: null },
        { id: 'm3', url: `social/${ME}/real.jpg`, thumbUrl: null },
      ],
    });
    await s.deleteAccount(ME, PW);
    expect(deleted).toEqual([`social/${ME}/real.jpg`]);
  });

  it('is idempotent on an account that is already deleted', async () => {
    const prisma = {
      user: { findUnique: async () => ({ id: ME, passwordHash: 'h', deletedAt: new Date() }) },
    } as any;
    const s = new AuthService(prisma, {} as never, {} as never, {} as never, {} as never);
    await expect(s.deleteAccount(ME, PW)).resolves.toEqual({ ok: true });
  });
});
