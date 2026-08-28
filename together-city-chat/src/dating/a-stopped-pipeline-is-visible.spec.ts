/* eslint-disable @typescript-eslint/no-explicit-any */
import { PhotoModerationService } from './photo-moderation.service';

/**
 * ── OFF BY OMISSION IS STILL OFF (launch audit, 28 Aug) ──
 *
 * `PHOTO_MODERATION=off` has been fatal in production since the day photo
 * review shipped. Three environment variables away sat the identical state,
 * reached by forgetting rather than choosing, and it answered with one
 * `logger.warn`: no Rekognition client, so `review()` returns `pending` on its
 * second line, `approvedOf` admits only `approved`, and every card in the hub
 * is a coloured letter of the alphabet.
 *
 * Three things made that unrecoverable rather than merely broken:
 *
 *   1. Nothing was loud. One warning at boot, in a log stream nobody watches.
 *   2. Nothing was VISIBLE. `queue()` selected `held`, and this state produces
 *      `pending` — so the console screen a moderator opens to check on photo
 *      review was the one screen that could not show it had stopped.
 *   3. Nothing retried. Every route to `pending` — no client, an unreadable
 *      object, a Rekognition throw — was permanent, so a transient error at
 *      upload time hid that photograph for good.
 *
 * And the citizen could not tell, because their OWN editor renders their photos
 * without consulting the review table at all. Everybody believes their pictures
 * are up. This file pins all three.
 */
function build(rows: any[] = [], over: { region?: string; key?: string; secret?: string; mode?: string } = {}) {
  const found: any[] = [];
  const reviewed: string[] = [];
  const prisma: any = {
    datingPhotoReview: {
      findMany: jest.fn(async (args: any) => { found.push(args); return rows; }),
      createMany: jest.fn(async () => ({ count: 0 })),
      upsert: jest.fn(async () => ({})),
    },
  };
  const config = {
    get: (k: string) => ({
      'photoModeration.mode': over.mode ?? 'rekognition',
      'photoModeration.region': over.region ?? '',
      'photoModeration.accessKeyId': over.key ?? '',
      'photoModeration.secretAccessKey': over.secret ?? '',
    } as Record<string, unknown>)[k],
  };
  const svc = new PhotoModerationService(prisma as never, {} as never, config as never, { track: () => undefined } as never);
  (svc as any).logger = { warn: () => undefined, log: () => undefined };
  (svc as any).review = async (key: string) => { reviewed.push(key); return 'approved'; };
  return { svc, prisma, found, reviewed };
}

const CONFIGURED = { region: 'ap-south-1', key: 'AKIA', secret: 'shh' };

describe('booting without the credentials', () => {
  const prior = process.env.NODE_ENV;
  afterEach(() => { process.env.NODE_ENV = prior; });

  it('refuses in production, and names the variables that are missing', () => {
    process.env.NODE_ENV = 'production';
    const { svc } = build();
    expect(() => svc.onModuleInit()).toThrow(/REKOGNITION_REGION/);
    expect(() => svc.onModuleInit()).toThrow(/REKOGNITION_ACCESS_KEY_ID/);
    expect(() => svc.onModuleInit()).toThrow(/REKOGNITION_SECRET_ACCESS_KEY/);
    expect(() => svc.onModuleInit()).toThrow(/No dating photo can be shown/);
  });

  it('names only the one that is missing', () => {
    process.env.NODE_ENV = 'production';
    const { svc } = build([], { ...CONFIGURED, secret: '' });
    expect(() => svc.onModuleInit()).toThrow(/REKOGNITION_SECRET_ACCESS_KEY/);
    expect(() => svc.onModuleInit()).not.toThrow(/REKOGNITION_REGION/);
  });

  it('still boots in development — a laptop with no AWS account is not a launch', () => {
    process.env.NODE_ENV = 'development';
    const { svc } = build();
    expect(() => svc.onModuleInit()).not.toThrow();
    expect(svc.configured).toBe(false);
  });

  it('boots in production when the three are set', () => {
    process.env.NODE_ENV = 'production';
    const { svc } = build([], CONFIGURED);
    expect(() => svc.onModuleInit()).not.toThrow();
    expect(svc.configured).toBe(true);
  });
});

describe('the moderator queue', () => {
  it('shows a pending photo that has been waiting, not only a held one', async () => {
    const { svc, found } = build([]);
    await svc.queue();
    const where = found[0].where;
    expect(where.OR[0]).toEqual({ status: 'held' });
    expect(where.OR[1].status).toBe('pending');
    expect(where.OR[1].createdAt.lt).toBeInstanceOf(Date);
  });

  it('leaves ordinary in-flight work out of a human’s list', async () => {
    // `fileAndReview` is best-effort and off the request path, so a photo is
    // legitimately pending for seconds after a save. The grace period is what
    // separates "not looked at yet" from "never going to be".
    const { svc, found } = build([]);
    await svc.queue(50, 15 * 60_000);
    const cutoff = found[0].where.OR[1].createdAt.lt as Date;
    expect(Date.now() - cutoff.getTime()).toBeGreaterThanOrEqual(15 * 60_000 - 1000);
  });
});

describe('the retry sweep', () => {
  it('looks again at photos nobody ever looked at', async () => {
    const { svc, reviewed } = build([{ key: 'dating/u/a.jpg', userId: 'u' }, { key: 'dating/u/b.jpg', userId: 'u' }], CONFIGURED);
    svc.onModuleInit();
    expect(await svc.retryPending()).toBe(2);
    expect(reviewed).toEqual(['dating/u/a.jpg', 'dating/u/b.jpg']);
  });

  it('does nothing at all while the credentials are still missing', async () => {
    const { svc, reviewed, prisma } = build([{ key: 'dating/u/a.jpg', userId: 'u' }]);
    expect(await svc.retryPending()).toBe(0);
    expect(reviewed).toEqual([]);
    expect(prisma.datingPhotoReview.findMany).not.toHaveBeenCalled();
  });

  it('skips inline photos, whose bytes are no longer addressable', async () => {
    const { svc, found } = build([], CONFIGURED);
    svc.onModuleInit();
    await svc.retryPending();
    expect(found[0].where.NOT).toEqual({ key: { startsWith: 'inline/' } });
    expect(found[0].where.status).toBe('pending');
  });

  it('is bounded — a broken dependency costs a fixed handful per sweep', async () => {
    const { svc, found } = build([], CONFIGURED);
    svc.onModuleInit();
    await svc.retryPending(25);
    expect(found[0].take).toBe(25);
    expect(found[0].orderBy).toEqual({ createdAt: 'asc' });
  });
});
