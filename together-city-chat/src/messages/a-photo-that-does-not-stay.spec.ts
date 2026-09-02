import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MessagesService } from './messages.service';

/* eslint-disable @typescript-eslint/no-explicit-any */

const SRC = join(__dirname, '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');

/**
 * ── A PHOTO THAT DOES NOT STAY ──────────────────────────────────────────────
 *
 * Temporary media as a chat primitive (owner, 2 Sep). The feature is a promise
 * — "they can open this once" — and a promise is only as good as the place it
 * is enforced. Every assertion here is about a way the promise could be true
 * in the UI and false in the system.
 *
 * The four that matter, in the order they would break:
 *
 *  1 · THE KEY NEVER LEAVES. A snap lives in the private vault and its address
 *      is never serialized. A recipient holding it could fetch the bytes
 *      without spending a view, forever, past the expiry and past the sweep.
 *  2 · THE VIEW IS SPENT ATOMICALLY. Two taps arriving together on a View Once
 *      is the classic read-modify-write, on the one counter the feature rests
 *      on. The spend is a compare-and-set or it is nothing.
 *  3 · THE CLOCK IS THE SERVER'S. A deadline in the request body is a deadline
 *      the sender sets on somebody else's copy.
 *  4 · IT CANNOT BE FORWARDED. "An attachment from a conversation you are in"
 *      is exactly what a snap somebody sent you is — so the generous clause in
 *      the ownership gate would have waved it straight through.
 */

/** A conversation with one sender and one recipient, and one snap in it. */
function build(snap: Partial<Record<string, unknown>>, opts: { members?: string[] } = {}) {
  const published: any[] = [];
  const deleted: string[] = [];
  const row: any = {
    id: 'a1', url: 'snaps/sender/abc.jpg', mimeType: 'image/jpeg', size: 10,
    snapMode: 'once', snapLive: false, snapViews: 1, snapOpensJson: null,
    snapExpiresAt: new Date(Date.now() + 3600_000),
    snapOpenedAt: null, snapKeptAt: null, snapShotAt: null, snapGoneAt: null,
    ...snap,
  };
  const members = opts.members ?? ['reader'];
  const prisma: any = {
    message: {
      findUnique: jest.fn(async () => ({
        id: 'm1', senderId: 'sender', conversationId: 'c1', deleted: false, attachments: [row],
      })),
    },
    conversationMember: {
      findUnique: jest.fn(async ({ where }: any) =>
        (members.includes(where.conversationId_userId.userId) ? { userId: where.conversationId_userId.userId } : null)),
      findMany: jest.fn(async () => members.map((userId) => ({ userId }))),
    },
    attachment: {
      // Compare-and-set: the write lands only while the json is what we read.
      updateMany: jest.fn(async ({ where, data }: any) => {
        if ((where.snapOpensJson ?? null) !== (row.snapOpensJson ?? null)) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      }),
      findUnique: jest.fn(async () => row),
      update: jest.fn(async ({ data }: any) => { Object.assign(row, data); return row; }),
      findFirst: jest.fn(async () => null),
    },
  };
  const storage: any = {
    readPrivateObject: jest.fn(async () => ({ body: {} as never, contentType: 'image/jpeg' })),
    deletePrivateObject: jest.fn(async (k: string) => { deleted.push(k); return true; }),
  };
  const svc = new MessagesService(
    prisma,
    { assertCanPostToConversation: async () => undefined } as any,
    { publish: (e: unknown) => published.push(e) } as any,
    { get: () => undefined } as any,
    { screen: async () => ({ ok: true }), screenSnap: async () => ({ ok: true }) } as any,
    storage,
  );
  return { svc, prisma, storage, row, published, deleted };
}

describe('a photo that does not stay', () => {
  describe('the view is spent, and spending it is what serves the bytes', () => {
    it('serves a View Once exactly once', async () => {
      const { svc, storage } = build({});
      expect(await svc.openSnap('reader', 'm1')).not.toBeNull();
      expect(storage.readPrivateObject).toHaveBeenCalledTimes(1);
      // The budget is gone, and so is the object — the last view retires it
      // now rather than at the next sweep.
      expect(await svc.openSnap('reader', 'm1')).toBeNull();
      expect(storage.readPrivateObject).toHaveBeenCalledTimes(1);
    });

    it('gives View Twice two, and the second is the last', async () => {
      const { svc } = build({ snapMode: 'twice', snapViews: 2 });
      expect(await svc.openSnap('reader', 'm1')).not.toBeNull();
      expect(await svc.openSnap('reader', 'm1')).not.toBeNull();
      expect(await svc.openSnap('reader', 'm1')).toBeNull();
    });

    it('counts per recipient, so one member of a group cannot spend another one’s view', async () => {
      // The bug a single shared counter would have been: the first person to
      // open a View Once in a group of three takes the only view and the other
      // two are handed a photograph that is already gone.
      const { svc, deleted } = build({}, { members: ['a', 'b'] });
      expect(await svc.openSnap('a', 'm1')).not.toBeNull();
      expect(deleted).toEqual([]);            // b has not looked yet
      expect(await svc.openSnap('b', 'm1')).not.toBeNull();
      expect(deleted).toEqual(['snaps/sender/abc.jpg']);   // now everyone has
    });

    it('refuses the sender their own snap — one view means one', async () => {
      const { svc, storage } = build({});
      expect(await svc.openSnap('sender', 'm1')).toBeNull();
      expect(storage.readPrivateObject).not.toHaveBeenCalled();
    });

    it('refuses a stranger, and refuses it as the same nothing', async () => {
      const { svc } = build({});
      expect(await svc.openSnap('nobody', 'm1')).toBeNull();
    });

    it('refuses a snap whose clock has run out, budget or no budget', async () => {
      const { svc } = build({ snapMode: 'day', snapViews: null, snapExpiresAt: new Date(Date.now() - 1000) });
      expect(await svc.openSnap('reader', 'm1')).toBeNull();
    });

    it('lets a 24-hour snap be opened again and again inside the day', async () => {
      const { svc, deleted } = build({ snapMode: 'day', snapViews: null });
      expect(await svc.openSnap('reader', 'm1')).not.toBeNull();
      expect(await svc.openSnap('reader', 'm1')).not.toBeNull();
      expect(await svc.openSnap('reader', 'm1')).not.toBeNull();
      // No budget to exhaust, so nothing is retired early — the sweep owns it.
      expect(deleted).toEqual([]);
    });
  });

  describe('keeping stops the clock', () => {
    it('takes the deadline off, and the tile stops counting down', async () => {
      const { svc, row } = build({ snapMode: 'keep', snapViews: null });
      const out: any = await svc.keepSnap('reader', 'm1');
      expect(row.snapKeptAt).toBeInstanceOf(Date);
      expect(out.media[0].snap.keptAt).not.toBeNull();
      expect(out.media[0].snap.expiresAt).toBeNull();
      expect(out.media[0].snap.gone).toBe(false);
    });

    it('refuses to keep any of the other three — that is what they are', async () => {
      for (const mode of ['once', 'twice', 'day']) {
        const { svc } = build({ snapMode: mode });
        await expect(svc.keepSnap('reader', 'm1')).rejects.toThrow();
      }
    });
  });

  describe('the address never leaves the server', () => {
    it('serializes a snap with an empty url and no thumbnail', () => {
      const { svc, row } = build({});
      const out: any = (svc as any).serialize({
        id: 'm1', conversationId: 'c1', senderId: 'sender', text: '', messageType: 'IMAGE',
        deleted: false, createdAt: new Date(), attachments: [row],
      }, 'reader');
      expect(out.media[0].kind).toBe('snap');
      expect(out.media[0].url).toBe('');
      expect(JSON.stringify(out)).not.toContain('snaps/sender');
    });

    it('keeps the url empty even after it is kept — keeping stops the clock, not the vault', () => {
      const { svc, row } = build({ snapMode: 'keep', snapKeptAt: new Date(), snapViews: null });
      const out: any = (svc as any).serialize({
        id: 'm1', conversationId: 'c1', senderId: 'sender', text: '', messageType: 'IMAGE',
        deleted: false, createdAt: new Date(), attachments: [row],
      }, 'reader');
      expect(out.media[0].url).toBe('');
      expect(out.media[0].kind).toBe('snap');
    });

    it('tells each reader their OWN remaining views', () => {
      const { svc, row } = build({ snapMode: 'twice', snapViews: 2, snapOpensJson: JSON.stringify({ a: 2 }) });
      const msg = {
        id: 'm1', conversationId: 'c1', senderId: 'sender', text: '', messageType: 'IMAGE',
        deleted: false, createdAt: new Date(), attachments: [row],
      };
      expect(((svc as any).serialize(msg, 'a')).media[0].snap.viewsLeft).toBe(0);
      expect(((svc as any).serialize(msg, 'b')).media[0].snap.viewsLeft).toBe(2);
      // No viewer — a broadcast — carries the ALLOWANCE, which is the true
      // thing to say to a room. Same shape as `starred`.
      expect(((svc as any).serialize(msg)).media[0].snap.viewsLeft).toBe(2);
    });
  });

  describe('the rules that live in the source', () => {
    const svcSrc = read('messages/messages.service.ts');
    const dto = read('messages/dto/messages.dto.ts');
    const guard = read('messages/chat-media-guard.ts');
    const controller = read('messages/messages.controller.ts');

    it('spends the view with a compare-and-set, not a read-then-write', () => {
      // Two taps arriving together both read `{}`, both see a view available
      // and both serve the photograph. The old json in the WHERE clause is
      // what makes the loser lose.
      expect(svcSrc).toMatch(/updateMany\(\{\s*\n\s*where: \{ id: a\.id, snapOpensJson: a\.snapOpensJson \?\? null \}/);
      expect(svcSrc).toMatch(/if \(won\.count === 0\) continue;/);
    });

    it('serves the bytes AFTER the spend, never before', () => {
      const open = svcSrc.slice(svcSrc.indexOf('async openSnap('), svcSrc.indexOf('private async retireSnapIfSpent'));
      // Against the SPEND's read, not the kept-snap shortcut above it: a kept
      // snap has no budget left to spend, which is what keeping did to it.
      expect(open.indexOf('updateMany')).toBeLessThan(open.indexOf('const found = await this.storage.readPrivateObject(a.url)'));
    });

    it('computes every deadline from the mode, and takes none from the request', () => {
      expect(dto).toMatch(/mode: z\.enum\(\['once', 'twice', 'day', 'keep'\]\)/);
      // The DTO's snap object has exactly two fields. A third called anything
      // like an expiry is the failure this asserts against.
      expect(dto).not.toMatch(/expiresAt:.*z\./);
      expect(svcSrc).toMatch(/snapExpiresAt: clock\.ttlMs == null \? null : new Date\(Date\.now\(\) \+ clock\.ttlMs\)/);
    });

    it('screens every snap in every conversation, not only in dating', () => {
      // `screenAttachments` is scoped to dating and argues that at length. A
      // snap is the exception, because it is the one image nobody can report
      // after the fact — by the time somebody complains the bytes are gone.
      const send = svcSrc.slice(svcSrc.indexOf('async send('), svcSrc.indexOf('message.create'));
      expect(send).toMatch(/await this\.media\.screenSnap\(a\.url, senderId\)/);
      expect(send).not.toMatch(/anonymousTrust[\s\S]*screenSnap/);
      expect(guard).toMatch(/async screenSnap\(key: string, senderId: string\)/);
      // Fail-closed, and out of the PRIVATE vault: a snap has no public URL.
      expect(guard).toMatch(/getSnapObjectPrefix\(key, SNIFF_BYTES\)/);
      expect(guard).toMatch(/await this\.storage\.deletePrivateObject\(key\)/);
    });

    it('refuses a forward before the clause that would have allowed it', () => {
      const gate = svcSrc.slice(svcSrc.indexOf('private async assertAttachmentsAreYoursToSend'));
      expect(gate.indexOf("u.startsWith('snaps/')")).toBeGreaterThan(-1);
      expect(gate.indexOf('A snap cannot be forwarded')).toBeLessThan(gate.indexOf('const foreign = urls.filter'));
    });

    it('refuses a snap key that has already been sent once', () => {
      expect(svcSrc).toMatch(/That snap has already been sent\./);
    });

    it('serves the bytes itself rather than handing out a signed link', () => {
      // A signed URL is a bearer credential for the length of its window, so a
      // View Once served as one can be re-fetched for as long as it lasts.
      expect(controller).toMatch(/@Get\('messages\/:id\/snap'\)/);
      expect(controller).toMatch(/'Cache-Control': 'no-store/);
      expect(controller).not.toMatch(/presign[A-Za-z]*Download\(/);
    });

    it('opens a door for the native shells to report a screen capture', () => {
      // The route exists for iOS's userDidTakeScreenshotNotification and
      // Android's API-34 callback. Whether the WEB refrains from calling it is
      // asserted on the web side, in a-snap-is-never-fetched-until-you-tap —
      // a server spec reaching across the monorepo is a spec that fails in a
      // build context that only copied this package.
      expect(controller).toMatch(/@Post\('messages\/:id\/snap\/screenshot'\)/);
      expect(svcSrc).toMatch(/async reportSnapShot\(userId: string, messageId: string\)/);
    });
  });
});
