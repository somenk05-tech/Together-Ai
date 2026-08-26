import { PhotoModerationService, reviewId, verdictFor } from './photo-moderation.service';
import { DATING_PHOTO_MAX_BYTES, MediaService } from '../media/media.service';

/**
 * The photo pipeline fails closed. These pin the three places that matters:
 * the verdict arithmetic, what "no verdict yet" reads as, and the upload gate.
 */
describe('verdictFor', () => {
  it('approves a photo Rekognition found nothing in', () => {
    expect(verdictFor([], 90)).toEqual({ status: 'approved', reason: '' });
  });

  it('ignores label families that are a person’s own business', () => {
    expect(verdictFor([{ Name: 'Alcoholic Beverages', ParentName: 'Alcohol', Confidence: 99 }], 90).status).toBe('approved');
  });

  it('holds a suggestive photo for a person to decide', () => {
    const v = verdictFor([{ Name: 'Swimwear or Underwear', ParentName: 'Suggestive', Confidence: 80 }], 90);
    expect(v.status).toBe('held');
    expect(v.reason).toMatch(/a person decides/);
  });

  it('refuses explicit content above the reject line, and holds it below', () => {
    const label = { Name: 'Explicit Nudity', ParentName: 'Explicit', Confidence: 95 };
    expect(verdictFor([label], 90).status).toBe('rejected');
    expect(verdictFor([{ ...label, Confidence: 85 }], 90).status).toBe('held');
  });

  it('never lets a suggestive label alone reach rejected, however confident', () => {
    // Suggestive is a hold family, not a reject family: a 99% "swimwear" is a
    // beach photo until somebody looks.
    expect(verdictFor([{ Name: 'Swimwear or Underwear', ParentName: 'Suggestive', Confidence: 99 }], 90).status).toBe('held');
  });
});

function serviceWith(rows: Array<{ key: string; status: string }>, mode = 'rekognition') {
  const prisma = {
    datingPhotoReview: {
      findMany: jest.fn(async () => rows),
      createMany: jest.fn(async () => ({ count: 0 })),
      upsert: jest.fn(async () => ({})),
    },
  };
  const config = { get: (k: string) => (k === 'photoModeration.mode' ? mode : undefined) };
  const svc = new PhotoModerationService(prisma as never, {} as never, config as never, { track: () => undefined } as never);
  return { svc, prisma };
}

describe('what "not reviewed yet" reads as', () => {
  it('approves only keys with an approved row — no row is not approval', async () => {
    const { svc } = serviceWith([{ key: 'dating/u/a.jpg', status: 'approved' }, { key: 'dating/u/b.jpg', status: 'held' }]);
    const ok = await svc.approvedOf(['dating/u/a.jpg', 'dating/u/b.jpg', 'dating/u/c.jpg']);
    expect([...ok]).toEqual(['dating/u/a.jpg']);
  });

  it('tells the owner a photo with no row is pending', async () => {
    const { svc } = serviceWith([]);
    expect(await svc.statusOf(['dating/u/a.jpg'])).toEqual({ 'dating/u/a.jpg': 'pending' });
  });

  it('leaves a photo pending when Rekognition is not configured', async () => {
    const { svc, prisma } = serviceWith([]);
    svc.onModuleInit();
    expect(svc.configured).toBe(false);
    expect(await svc.review('dating/u/a.jpg', 'u')).toBe('pending');
    expect(prisma.datingPhotoReview.upsert).not.toHaveBeenCalled();
  });

  it('refuses to boot with moderation off in production', () => {
    const { svc } = serviceWith([], 'off');
    const prior = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      expect(() => svc.onModuleInit()).toThrow(/not allowed in production/);
    } finally {
      process.env.NODE_ENV = prior;
    }
  });

  it('files only the citizen’s own keys, never one pasted from somebody else', async () => {
    const { svc, prisma } = serviceWith([]);
    await svc.fileAndReview('u', ['dating/u/a.jpg', 'dating/other/x.jpg', 'https://cdn/x.jpg']);
    expect(prisma.datingPhotoReview.createMany).toHaveBeenCalledWith({ data: [{ key: 'dating/u/a.jpg', userId: 'u' }], skipDuplicates: true });
  });

  it('reviews a legacy inline photo by its digest rather than exempting it', async () => {
    const { svc, prisma } = serviceWith([]);
    const inline = 'data:image/png;base64,AAAA';
    await svc.fileAndReview('u', [inline]);
    const filed = (prisma.datingPhotoReview.createMany.mock.calls[0] as unknown as [{ data: { key: string }[] }])[0].data[0].key;
    expect(filed).toBe(reviewId(inline));
    expect(filed.startsWith('inline/')).toBe(true);
    expect(await svc.approvedOf([inline])).toEqual(new Set());
  });
});

describe('the upload gate', () => {
  const media = new MediaService({ presignDatingUpload: jest.fn(async () => ({ uploadUrl: 'u', key: 'k', expiresInSec: 1 })) } as never, { get: () => undefined } as never);

  it('accepts the four photo types and nothing else', async () => {
    await expect(media.requestDatingUpload('u', 'image/jpeg', 1000)).resolves.toBeDefined();
    await expect(media.requestDatingUpload('u', 'image/svg+xml', 1000)).rejects.toThrow(/JPEG, PNG, WebP or HEIC/);
    await expect(media.requestDatingUpload('u', 'image/gif', 1000)).rejects.toThrow(/JPEG, PNG, WebP or HEIC/);
  });

  it('refuses a missing size rather than treating NaN as small', async () => {
    await expect(media.requestDatingUpload('u', 'image/jpeg', Number(undefined))).rejects.toThrow(/how large/);
    await expect(media.requestDatingUpload('u', 'image/jpeg', 0)).rejects.toThrow(/how large/);
  });

  it('caps a dating photo at what Rekognition can read', async () => {
    await expect(media.requestDatingUpload('u', 'image/jpeg', DATING_PHOTO_MAX_BYTES + 1)).rejects.toThrow(/under 5 MB/);
  });
});
