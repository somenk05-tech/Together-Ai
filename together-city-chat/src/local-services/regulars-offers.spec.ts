import { BadRequestException, NotFoundException } from '@nestjs/common';
import { LocalServicesService } from './local-services.service';

/**
 * A PRIVATE SHORTLIST, AND AN OFFER THAT EXPIRES ON ITS OWN.
 *
 * Two features, one shared property: both fail QUIETLY when they fail.
 *
 * A regular that leaked to the business would not throw — a shopkeeper would
 * simply start seeing a list of people who had bookmarked them, and the
 * citizens on it would never know they had disclosed anything. So the test is
 * not "is there a notification" but "does anything the OWNER can read contain
 * the saver".
 *
 * An offer with no end date would not throw either. It would sit on the Daily
 * Offers page for a year, and the page would slowly stop being worth opening —
 * which is the failure that has no error message and no bug report, only a
 * number that goes down.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

const OWNER = 'u-owner';
const SAVER = 'u-saver';
const D = (s: string) => new Date(`${s}T00:00:00.000Z`);

function harness(opts: { listings?: any[]; regulars?: any[]; offers?: any[] } = {}) {
  const listings = opts.listings ?? [{
    id: 'L1', ownerId: OWNER, businessName: 'Sharma Plumbing', categoryKey: 'plumbers',
    about: null, city: 'Mumbai', areas: 'Bandra', phone: null, priceFrom: null, photosJson: '[]',
    lat: null, lng: null, radiusKm: null,
    moderation: 'approved', createdAt: D('2026-08-01'), updatedAt: D('2026-08-01'),
  }];
  const regulars = opts.regulars ?? [];
  const offers = opts.offers ?? [];
  let seq = 0;

  const cmp = (where: any, r: any): boolean => {
    for (const [k, v] of Object.entries(where ?? {})) {
      if (k === 'userId_listingId') {
        const c = v as any;
        if (r.userId !== c.userId || r.listingId !== c.listingId) return false;
        continue;
      }
      if (v && typeof v === 'object' && !(v instanceof Date)) {
        const o = v as any;
        if ('in' in o && !o.in.includes(r[k])) return false;
        if ('not' in o && r[k] === o.not) return false;
        if ('lte' in o && !(r[k] <= o.lte)) return false;
        if ('gte' in o && !(r[k] >= o.gte)) return false;
      } else if (r[k] !== v) return false;
    }
    return true;
  };

  const prisma: any = {
    serviceListing: {
      findUnique: async ({ where }: any) => listings.find((l) => l.id === where.id) ?? null,
      findMany: async ({ where }: any) => listings.filter((l) => cmp(where, l)),
      count: async ({ where }: any) => listings.filter((l) => cmp(where, l)).length,
      update: async ({ where, data }: any) => { const r = listings.find((l) => l.id === where.id); Object.assign(r, data); return r; },
      groupBy: async () => [],
    },
    serviceRegular: {
      findMany: async ({ where }: any) => regulars.filter((r) => cmp(where, r)),
      upsert: async ({ where, create, update }: any) => {
        const hit = regulars.find((r) => cmp(where, r));
        if (hit) { Object.assign(hit, update); return hit; }
        const row = { id: `R${++seq}`, note: null, createdAt: D('2026-08-05'), ...create };
        regulars.push(row); return row;
      },
      deleteMany: async ({ where }: any) => {
        const keep = regulars.filter((r) => !cmp(where, r));
        const n = regulars.length - keep.length;
        regulars.length = 0; regulars.push(...keep);
        return { count: n };
      },
    },
    serviceOffer: {
      findMany: async ({ where }: any) => offers.filter((o) => cmp(where, o)),
      findUnique: async ({ where }: any) => offers.find((o) => o.id === where.id) ?? null,
      count: async ({ where }: any) => offers.filter((o) => cmp(where, o)).length,
      create: async ({ data }: any) => { const row = { id: `O${++seq}`, createdAt: D('2026-08-05'), ...data }; offers.push(row); return row; },
      delete: async ({ where }: any) => { const i = offers.findIndex((o) => o.id === where.id); return offers.splice(i, 1)[0]; },
    },
    serviceEnquiry: { findMany: async () => [], count: async () => 0 },
    // browse() now reads a rating per card. The harness has to answer, or a
    // spec about anonymity fails for a reason that has nothing to do with it.
    serviceReview: {
      groupBy: async () => [],
      findMany: async () => [],
      findUnique: async () => null,
      count: async () => 0,
    },
  };
  const svc: any = Object.create(LocalServicesService.prototype);
  svc.prisma = prisma;
  svc.notifications = { create: async () => undefined };
  /* THE GATE, STUBBED OPEN. These tests are about who the business can see,
     not about how many new neighbours a day it is given, and the real rule has
     its own two suites (trust.spec.ts, trust-gate.spec.ts, verification.spec.ts).
     "Never hold, release nothing, no badge" is the behaviour of a verified
     listing, which is what every fixture here is standing in for. */
  svc.verification = {
    holdsNewThread: async () => false,
    releaseFor: async () => 0,
    badgeFor: async () => null,
    summariesFor: async () => new Map(),
  };
  return { svc, listings, regulars, offers };
}

const strings = (v: unknown, out: string[] = []): string[] => {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => strings(x, out));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => strings(x, out));
  return out;
};

describe('keeping a business', () => {
  it('saves once however many times it is pressed', async () => {
    const { svc, regulars } = harness();
    await svc.saveRegular(SAVER, 'L1');
    await svc.saveRegular(SAVER, 'L1');
    expect(regulars).toHaveLength(1);
  });

  it('the business is never told, and cannot be told by anything it can read', async () => {
    const { svc } = harness();
    await svc.saveRegular(SAVER, 'L1', 'the one who turns up');
    // Everything the owner can read about their own listing.
    const mine = await svc.mine(OWNER);
    const inbox = await svc.inbox(OWNER);
    for (const view of [mine, inbox]) {
      expect(strings(view)).not.toContain(SAVER);
      expect(strings(view)).not.toContain('the one who turns up');
    }
  });

  it('will not keep a listing that is not live', async () => {
    const { svc, listings } = harness();
    listings[0].moderation = 'removed';
    await expect(svc.saveRegular(SAVER, 'L1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('a closed business stays on the list and says so', async () => {
    const { svc, listings } = harness();
    await svc.saveRegular(SAVER, 'L1');
    listings[0].moderation = 'removed';
    const out = await svc.regulars(SAVER, D('2026-08-05'));
    // Not dropped — the citizen chose to keep it, and a silent disappearance
    // reads as a lost bookmark rather than a shut shop.
    expect(out.items).toHaveLength(1);
    expect(out.items[0].closed).toBe(true);
  });

  it('forgetting is idempotent', async () => {
    const { svc, regulars } = harness();
    await svc.saveRegular(SAVER, 'L1');
    await svc.forgetRegular(SAVER, 'L1');
    await expect(svc.forgetRegular(SAVER, 'L1')).resolves.toEqual({ saved: false });
    expect(regulars).toHaveLength(0);
  });
});

describe('an offer runs for the days it says and then stops', () => {
  const post = async (svc: any, startsOn: string, endsOn: string) =>
    svc.postOffer(OWNER, 'L1', { title: '20% off drain cleaning', startsOn, endsOn });

  it('shows on its own days and on neither side of them', async () => {
    const { svc } = harness();
    await post(svc, '2026-08-05', '2026-08-07');
    expect((await svc.offersToday(D('2026-08-04'))).items).toHaveLength(0);
    expect((await svc.offersToday(D('2026-08-05'))).items).toHaveLength(1);
    expect((await svc.offersToday(D('2026-08-07'))).items).toHaveLength(1);
    // The day after it ends it is simply gone. Nobody had to remember anything.
    expect((await svc.offersToday(D('2026-08-08'))).items).toHaveLength(0);
  });

  it('defaults to a single day, so "today only" is the least work to say', async () => {
    const { svc, offers } = harness();
    await svc.postOffer(OWNER, 'L1', { title: 'Free check-up today' });
    expect(offers[0].startsOn.getTime()).toBe(offers[0].endsOn.getTime());
  });

  it('refuses to end before it starts, and refuses to run for a season', async () => {
    const { svc } = harness();
    await expect(post(svc, '2026-08-07', '2026-08-05')).rejects.toBeInstanceOf(BadRequestException);
    await expect(post(svc, '2026-08-05', '2026-12-05')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('is only postable by the business it belongs to', async () => {
    const { svc } = harness();
    await expect(svc.postOffer('somebody-else', 'L1', { title: 'Free everything' })).rejects.toBeTruthy();
  });

  it('drops an offer whose shop has since closed', async () => {
    const { svc, listings } = harness();
    await post(svc, '2026-08-05', '2026-08-07');
    listings[0].moderation = 'removed';
    // The discount is real and the shop is not. Sending somebody to a door that
    // no longer opens is the worst thing this page could do.
    expect((await svc.offersToday(D('2026-08-06'))).items).toHaveLength(0);
  });

  it('reaches the regulars list, which is the point of keeping anybody', async () => {
    const { svc } = harness();
    await svc.saveRegular(SAVER, 'L1');
    await post(svc, '2026-08-05', '2026-08-07');
    const out = await svc.regulars(SAVER, D('2026-08-06'));
    expect(out.items[0].offersToday).toHaveLength(1);
    expect(out.items[0].offersToday[0].title).toBe('20% off drain cleaning');
  });
});
