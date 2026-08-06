import { BadRequestException, NotFoundException } from '@nestjs/common';
import { LocalServicesService, ratingOf, MIN_REVIEWS_FOR_AVERAGE } from './local-services.service';

/**
 * A REVIEW YOU HAD TO EARN, UNDER THE NAME THEY ALREADY KNOW YOU BY.
 *
 * Two rules hold this up and both fail silently if they break.
 *
 * EARNED — the gate is an existing thread. Without it a directory of citizen
 * businesses is a place where a rival leaves one star on a Tuesday. The thread
 * is the only proof of contact this hub has; it is NOT proof the work was done,
 * and the copy says "spoke to them" rather than "used them" for that reason.
 *
 * PSEUDONYMOUS — the review carries the same alias as the conversation, and
 * nothing else. If a real name ever reaches a review, nobody gets an error: the
 * shopkeeper simply starts seeing who is criticising them, and the person who
 * wrote it never learns that they signed it. So the assertions walk every
 * string in what the owner reads rather than checking known fields.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

const OWNER = 'u-owner';
const A = 'u-a';
const B = 'u-b';

function harness(opts: { reviews?: any[]; enquiries?: any[] } = {}) {
  const listings = [{
    id: 'L1', ownerId: OWNER, businessName: 'Sharma Plumbing', categoryKey: 'plumbers',
    about: null, city: 'Mumbai', areas: '', phone: null, priceFrom: null, photosJson: '[]',
    lat: null, lng: null, radiusKm: null, homeVisit: false, onlineOk: false,
    moderation: 'approved', createdAt: new Date('2026-08-01'), updatedAt: new Date('2026-08-01'),
  }];
  const enquiries = opts.enquiries ?? [];
  const reviews = opts.reviews ?? [];
  const notes: any[] = [];
  let seq = 0;

  const cmp = (where: any, r: any): boolean => {
    for (const [k, v] of Object.entries(where ?? {})) {
      if (k === 'listingId_seekerId' || k === 'listingId_reviewerId') {
        const c = v as any;
        for (const [ck, cv] of Object.entries(c)) if (r[ck] !== cv) return false;
        continue;
      }
      if (v && typeof v === 'object' && 'in' in (v as any)) { if (!(v as any).in.includes(r[k])) return false; }
      else if (r[k] !== v) return false;
    }
    return true;
  };

  const prisma: any = {
    serviceListing: {
      findUnique: async ({ where }: any) => listings.find((l) => l.id === where.id) ?? null,
      findMany: async ({ where }: any) => listings.filter((l) => cmp(where, l)),
      count: async () => listings.length,
      groupBy: async () => [],
    },
    serviceEnquiry: {
      findUnique: async ({ where }: any) => enquiries.find((e) => cmp(where, e)) ?? null,
      findMany: async ({ where }: any) => enquiries.filter((e) => cmp(where, e)),
      count: async ({ where }: any) => enquiries.filter((e) => cmp(where, e)).length,
    },
    serviceReview: {
      findUnique: async ({ where }: any) => reviews.find((r) => cmp(where, r)) ?? null,
      findMany: async ({ where }: any) => reviews.filter((r) => cmp(where, r)),
      count: async ({ where }: any) => reviews.filter((r) => cmp(where, r)).length,
      groupBy: async () => [],
      upsert: async ({ where, create, update }: any) => {
        const hit = reviews.find((r) => cmp(where, r));
        if (hit) { Object.assign(hit, update); return hit; }
        const row = { id: `V${++seq}`, ownerReply: null, createdAt: new Date('2026-08-06'), updatedAt: new Date('2026-08-06'), ...create };
        reviews.push(row); return row;
      },
      update: async ({ where, data }: any) => { const r = reviews.find((x) => x.id === where.id); Object.assign(r, data); return r; },
      deleteMany: async ({ where }: any) => {
        const keep = reviews.filter((r) => !cmp(where, r));
        const n = reviews.length - keep.length;
        reviews.length = 0; reviews.push(...keep);
        return { count: n };
      },
    },
  };
  const svc: any = Object.create(LocalServicesService.prototype);
  svc.prisma = prisma;
  svc.notifications = { create: async (n: any) => { notes.push(n); } };
  return { svc, reviews, enquiries, notes };
}

const spoke = (userId: string, alias: string) =>
  ({ id: `E-${userId}`, listingId: 'L1', seekerId: userId, alias, lastMessageAt: new Date(), seekerUnread: 0, ownerUnread: 0, closed: false, createdAt: new Date() });

const strings = (v: unknown, out: string[] = []): string[] => {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => strings(x, out));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => strings(x, out));
  return out;
};
const keys = (v: unknown, out: string[] = []): string[] => {
  if (Array.isArray(v)) v.forEach((x) => keys(x, out));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { out.push(k); keys(x, out); }
  return out;
};

describe('you have to have spoken to them', () => {
  it('refuses a review from somebody with no thread', async () => {
    const { svc } = harness();
    await expect(svc.postReview(A, 'L1', 5)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts one from somebody who has', async () => {
    const { svc, reviews } = harness({ enquiries: [spoke(A, 'Neighbour 1')] });
    await svc.postReview(A, 'L1', 4, 'Turned up on time.');
    expect(reviews).toHaveLength(1);
    expect(reviews[0].rating).toBe(4);
  });

  it('refuses a business reviewing itself', async () => {
    const { svc } = harness({ enquiries: [spoke(OWNER, 'Neighbour 1')] });
    await expect(svc.postReview(OWNER, 'L1', 5)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses a review on a listing that is not live', async () => {
    const { svc } = harness({ enquiries: [spoke(A, 'Neighbour 1')] });
    await expect(svc.postReview(A, 'nope', 5)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('keeps one review per person — a rating is an opinion, not a log', async () => {
    const { svc, reviews } = harness({ enquiries: [spoke(A, 'Neighbour 1')] });
    await svc.postReview(A, 'L1', 2, 'Late.');
    await svc.postReview(A, 'L1', 5, 'Came back and fixed it properly.');
    expect(reviews).toHaveLength(1);
    expect(reviews[0].rating).toBe(5);
    expect(reviews[0].body).toBe('Came back and fixed it properly.');
  });
});

describe('the review is signed with the alias and nothing else', () => {
  it('carries the same name the conversation does', async () => {
    const { svc, reviews } = harness({ enquiries: [spoke(A, 'Neighbour 7')] });
    await svc.postReview(A, 'L1', 5);
    expect(reviews[0].alias).toBe('Neighbour 7');
  });

  it('puts no identity in what anyone reads', async () => {
    const { svc } = harness({ enquiries: [spoke(A, 'Neighbour 1')] });
    await svc.postReview(A, 'L1', 1, 'Never came.');
    const page = await svc.reviews('L1', OWNER);
    expect(strings(page)).not.toContain(A);
    for (const k of ['reviewerId', 'reviewer', 'user', 'handle', 'name', 'email']) {
      expect(keys(page.items[0])).not.toContain(k);
    }
  });

  it('tells the business who wrote it only by that alias', async () => {
    const { svc, notes } = harness({ enquiries: [spoke(A, 'Neighbour 3')] });
    await svc.postReview(A, 'L1', 2, 'Slow.');
    expect(notes).toHaveLength(1);
    expect(notes[0].title).toContain('Neighbour 3');
    expect(strings(notes[0])).not.toContain(A);
  });

  it('does not re-sign an edited review', async () => {
    // The business may already have replied to it under that name.
    const { svc, reviews, enquiries } = harness({ enquiries: [spoke(A, 'Neighbour 3')] });
    await svc.postReview(A, 'L1', 3);
    enquiries[0].alias = 'Neighbour 99'; // as if the thread were re-minted
    await svc.postReview(A, 'L1', 4);
    expect(reviews[0].alias).toBe('Neighbour 3');
  });
});

describe('the owner answers once', () => {
  it('can reply to a review on their own listing', async () => {
    const { svc, reviews } = harness({ enquiries: [spoke(A, 'Neighbour 1')] });
    await svc.postReview(A, 'L1', 2, 'Late.');
    await svc.replyToReview(OWNER, reviews[0].id, 'Sorry — traffic. Refunded the call-out.');
    expect(reviews[0].ownerReply).toContain('Refunded');
  });

  it('cannot reply to somebody else’s', async () => {
    const { svc, reviews } = harness({ enquiries: [spoke(A, 'Neighbour 1')] });
    await svc.postReview(A, 'L1', 2);
    await expect(svc.replyToReview(B, reviews[0].id, 'nice')).rejects.toBeTruthy();
  });
});

describe('an average nobody should trust is not shown', () => {
  it('withholds the average below the floor and always gives the count', () => {
    // ★5.0 on a sample of one is a claim the data cannot carry. "2 reviews"
    // tells a reader exactly what is known.
    expect(ratingOf([{ rating: 5 }])).toEqual({ rating: null, count: 1 });
    expect(ratingOf([{ rating: 5 }, { rating: 5 }])).toEqual({ rating: null, count: 2 });
  });

  it('shows it at the floor and rounds to one decimal', () => {
    expect(MIN_REVIEWS_FOR_AVERAGE).toBe(3);
    expect(ratingOf([{ rating: 5 }, { rating: 4 }, { rating: 4 }])).toEqual({ rating: 4.3, count: 3 });
  });

  it('says nothing at all about a business nobody has reviewed', () => {
    expect(ratingOf([])).toEqual({ rating: null, count: 0 });
  });
});

describe('who may review, answered before the form is offered', () => {
  it('tells a stranger they cannot, and a talker they can', async () => {
    const { svc } = harness({ enquiries: [spoke(A, 'Neighbour 1')] });
    expect((await svc.reviews('L1', B)).canReview).toBe(false);
    expect((await svc.reviews('L1', A)).canReview).toBe(true);
  });
});
