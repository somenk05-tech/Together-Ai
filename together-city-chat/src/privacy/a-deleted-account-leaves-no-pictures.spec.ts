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

/** Moved by the storage stub so a "slow bucket" costs no real time. */
let clockSkew = 0;
const REAL_NOW = Date.now;
beforeEach(() => { clockSkew = 0; Date.now = () => REAL_NOW.call(Date) + clockSkew; });
afterEach(() => { Date.now = REAL_NOW; });

const ME = 'me-0000';
const PW = 'correct horse';

function svc(over: {
  media?: Array<{ id: string; url: string; thumbUrl: string | null }>;
  failOn?: string;
  /** Pages of 500 to hand back before the reader runs dry — for the budget. */
  pages?: number;
  /** Milliseconds each bucket call appears to take, for the budget. */
  slowMs?: number;
} = {}) {
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
        if (over.pages) {
          // A prolific account: full pages, so the loop keeps asking for more.
          const seen = order.filter((o) => o === 'postMedia.findMany').length;
          if (seen > over.pages) return [];
          return Array.from({ length: 500 }, (_, i) => ({
            id: `p${seen}-${i}`, url: `social/${ME}/${seen}-${i}.jpg`, thumbUrl: null,
          }));
        }
        return a?.cursor ? [] : media;
      },
    },
    follow: { deleteMany: async () => ({ count: 0 }) },
    connection: { deleteMany: async () => ({ count: 0 }) },
    // Console roles are revoked with the account (2 Sep); this harness is
    // about pictures, so the call only has to succeed.
    adminGrant: { updateMany: async () => ({ count: 0 }) },
  } as any;

  const storage = {
    isPostKey: (k: string) => /^social\/[^/]+\/[A-Za-z0-9._-]+$/.test(k),
    /**
     * IT REPORTS, IT DOES NOT THROW — BECAUSE THE REAL ONE CANNOT THROW.
     *
     * This stub used to `throw` on `failOn`, and the test below proved the
     * orphan path against something the provider could not do:
     * `StorageProvider.deleteObject` caught its own error and returned void.
     * So the refusal branch was green against a fiction while the real
     * `purgePostObjects` counted every failure as a success. A mock may only
     * do what the thing it stands for can do; the provider now answers
     * `false`, and so does this.
     */
    deletePrivateObject: async (k: string) => {
      if (over.failOn && k === over.failOn) { order.push(`refused:${k}`); return false; }
      order.push(`delete:${k}`);
      deleted.push(k);
      return true;
    },
    /**
     * THE PLURAL, BECAUSE A PAGE IS NOW ONE CALL (31 Aug).
     *
     * purgePostObjects deleted one object per round trip, up to a hundred
     * thousand of them, inside the delete-account request — so a proxy timeout
     * landed in the middle and left a LIVE account with an arbitrary prefix of
     * its photographs gone. S3 takes a thousand keys per call; the stub answers
     * in the same shape, key by key, so the assertions below still read as a
     * list of individual deletions.
     */
    deletePrivateObjects: async (keys: string[]) => {
      // A slow bucket, without a slow test: the clock is moved rather than
      // waited on, so the budget can be crossed in a millisecond.
      if (over.slowMs) clockSkew += over.slowMs;
      const failed: string[] = [];
      for (const k of keys) {
        if (over.failOn && k === over.failOn) { order.push(`refused:${k}`); failed.push(k); continue; }
        order.push(`delete:${k}`);
        deleted.push(k);
      }
      return { failed };
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
    const { s, order, deleted } = svc({ failOn: `social/${ME}/a.jpg` });
    await expect(s.deleteAccount(ME, PW)).resolves.toEqual({ ok: true });
    expect(order).toContain('post.deleteMany');
    expect(order).toContain('user.update');
    // The refusal was SEEN — the key is not in `deleted`, and the run carried
    // on to the other two objects rather than stopping at the first no.
    expect(deleted).not.toContain(`social/${ME}/a.jpg`);
    expect(order).toContain(`refused:social/${ME}/a.jpg`);
    expect(deleted).toEqual([`social/${ME}/v.mp4`, `social/${ME}/v.jpg`]);
  });

  it('names the orphaned keys in the log, which is the only record left', async () => {
    /* After the rows are deleted this line is the ONLY thing that says which
       files are still in the bucket, so "3 objects failed" without the keys is
       a log that cannot be acted on. It could never print before: the try/catch
       around a method that caught its own error meant `failed` was always
       empty and `removed` counted the failures. */
    const { s } = svc({ failOn: `social/${ME}/a.jpg` });
    const errors: string[] = [];
    (s as unknown as { logger: { error: (m: string) => void } }).logger = {
      error: (m: string) => errors.push(m),
      log: () => undefined, warn: () => undefined,
    } as never;
    await s.deleteAccount(ME, PW);
    const orphan = errors.find((m) => m.includes('ORPHANED'));
    expect(orphan).toBeDefined();
    expect(orphan).toContain(`social/${ME}/a.jpg`);
    expect(orphan).toContain(ME);
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

  it('deletes the account even when the bucket work runs past its budget', async () => {
    /**
     * THE FAILURE THIS REPLACES WAS THE WORST OF THE TWO OUTCOMES.
     *
     * Objects go before rows, deliberately — deleting the posts destroys the
     * only record of which objects to delete. But this ran one round trip per
     * object inside the request, so a prolific account hit the proxy timeout
     * MID-PURGE: the citizen got an error, kept their account, and lost an
     * arbitrary prefix of their photographs. Nobody chose that.
     *
     * Now the purge has a budget, and crossing it does not abort the deletion:
     * what is left is named in the log and the account still goes. An object
     * left behind is an operator's problem with a written record; a live
     * account with half its pictures gone is the citizen's problem and has no
     * record at all.
     */
    const { s, order } = svc({ pages: 40, slowMs: 5_000 });
    const errors: string[] = [];
    (s as unknown as { logger: { error: (m: string) => void } }).logger = {
      error: (m: string) => errors.push(m), log: () => undefined, warn: () => undefined,
    } as never;

    await expect(s.deleteAccount(ME, PW)).resolves.toEqual({ ok: true });
    // It stopped early rather than walking all forty pages…
    expect(order.filter((o) => o === 'postMedia.findMany').length).toBeLessThan(10);
    // …said so, with the count…
    expect(errors.join(' ')).toMatch(/ran out of time purging post objects/);
    // …and finished the deletion anyway, which is the whole point.
    expect(order).toContain('post.deleteMany');
    expect(order).toContain('user.update');
  });

  it('does not stop early when the bucket keeps up', async () => {
    // The budget must not fire on an ordinary account, or the log becomes
    // noise and nobody reads the line that matters.
    const { s, order } = svc({ pages: 3 });
    const errors: string[] = [];
    (s as unknown as { logger: { error: (m: string) => void } }).logger = {
      error: (m: string) => errors.push(m), log: () => undefined, warn: () => undefined,
    } as never;
    await s.deleteAccount(ME, PW);
    expect(errors.join(' ')).not.toMatch(/ran out of time/);
    // It really did walk every page — otherwise "did not stop early" is true
    // of a run that never started.
    expect(order.filter((o) => o === 'postMedia.findMany').length).toBeGreaterThan(3);
  });

  it('is idempotent on an account that is already deleted', async () => {
    const prisma = {
      user: { findUnique: async () => ({ id: ME, passwordHash: 'h', deletedAt: new Date() }) },
    } as any;
    const s = new AuthService(prisma, {} as never, {} as never, {} as never, {} as never);
    await expect(s.deleteAccount(ME, PW)).resolves.toEqual({ ok: true });
  });
});
