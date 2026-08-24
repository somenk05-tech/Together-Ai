import { BadRequestException } from '@nestjs/common';
import { summaryOf, VerificationService } from './verification.service';
import { policyFor, type TrustEvidence } from './trust';

/**
 * THE GATE, AGAINST A DATABASE-SHAPED THING.
 *
 * `trust.spec.ts` and `trust-gate.spec.ts` already argue about the rules. What
 * is left to prove is that the service asks the right questions of the right
 * rows — that "five a day" counts threads the business was GIVEN rather than
 * threads that exist, that a held one is not lost, and that approving a
 * document empties the queue in the same breath rather than in a nightly job
 * nobody has written.
 */

const DAY = 24 * 60 * 60 * 1000;
const T0 = new Date('2026-08-16T09:00:00Z');

type Enquiry = { id: string; listingId: string; openedAt: Date | null; createdAt: Date };

function harness(opts: { identity?: boolean; phone?: boolean; businessType?: string | null } = {}) {
  const listing = {
    id: 'L1', ownerId: 'U1', businessName: 'Anna Idli', city: 'Mumbai',
    categoryKey: 'restaurants', businessType: opts.businessType ?? null,
    createdAt: new Date(T0.getTime() - 400 * DAY),
  };
  const enquiries: Enquiry[] = [];
  let verification: Record<string, unknown> | null = null;
  const notes: Array<Record<string, unknown>> = [];
  let seq = 0;

  const within = (e: Enquiry, w: { openedAt?: unknown }) => {
    if (w.openedAt === null) return e.openedAt === null;
    const gte = (w.openedAt as { gte?: Date } | undefined)?.gte;
    if (gte) return e.openedAt != null && e.openedAt >= gte;
    return true;
  };

  const prisma = {
    serviceVerification: {
      findUnique: async () => (verification ? { ...verification } : null),
      upsert: async ({ create, update }: { create?: Record<string, unknown>; update: Record<string, unknown> }) => {
        verification = verification ? { ...verification, ...update } : { ...create };
        return verification;
      },
      findMany: async () => (verification && verification.docStatus === 'submitted' ? [{ ...verification }] : []),
    },
    user: {
      findUnique: async () => ({
        phoneVerifiedAt: opts.phone === false ? null : T0,
        identityVerifiedAt: opts.identity ? T0 : null,
      }),
    },
    serviceReview: { findMany: async () => [] },
    moderationLog: { count: async () => 0 },
    serviceListing: {
      findUnique: async () => ({ ...listing }),
      findMany: async () => [{ ...listing }],
    },
    serviceEnquiry: {
      count: async ({ where }: { where: { openedAt?: unknown } }) =>
        enquiries.filter((e) => within(e, where)).length,
      findMany: async ({ where }: { where: { openedAt?: unknown } }) =>
        enquiries.filter((e) => within(e, where))
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
          .map((e) => ({ id: e.id, createdAt: e.createdAt })),
      updateMany: async ({ where, data }: { where: { id: { in: string[] } }; data: { openedAt: Date } }) => {
        for (const e of enquiries) if (where.id.in.includes(e.id)) e.openedAt = data.openedAt;
        return { count: where.id.in.length };
      },
    },
  };

  const notifications = { create: async (n: Record<string, unknown>) => { notes.push(n); } };
  const svc = new VerificationService(
    prisma as never, notifications as never,
  );

  /** Arrive as a new neighbour: ask the gate, then write the row the way the
   *  service will. */
  const arrive = async (at: Date) => {
    const held = await svc.holdsNewThread(listing, at);
    const e: Enquiry = { id: `E${++seq}`, listingId: 'L1', openedAt: held ? null : at, createdAt: at };
    enquiries.push(e);
    return e;
  };

  return { svc, listing, enquiries, arrive, notes, verification: () => verification };
}

describe('five new neighbours a day', () => {
  it('hands over the first five and holds the sixth', async () => {
    const h = harness();
    const arrivals = [];
    for (let i = 0; i < 7; i++) arrivals.push(await h.arrive(new Date(T0.getTime() + i * 60_000)));
    expect(arrivals.filter((e) => e.openedAt != null)).toHaveLength(5);
    expect(arrivals.filter((e) => e.openedAt == null)).toHaveLength(2);
    expect(await h.svc.waiting('L1')).toBe(2);
  });

  it('starts counting again the next day, and the held ones go first', async () => {
    const h = harness();
    for (let i = 0; i < 8; i++) await h.arrive(new Date(T0.getTime() + i * 60_000));
    expect(await h.svc.waiting('L1')).toBe(3);

    const released = await h.svc.releaseFor(h.listing, new Date(T0.getTime() + DAY));
    expect(released).toBe(3);
    expect(await h.svc.waiting('L1')).toBe(0);
    // Nothing was refused and nothing was lost — which is the whole difference
    // between a queue and a wall.
    expect(h.enquiries.every((e) => e.openedAt != null)).toBe(true);
  });

  it('releases only what the new day has room for', async () => {
    const h = harness();
    for (let i = 0; i < 14; i++) await h.arrive(new Date(T0.getTime() + i * 60_000));
    expect(await h.svc.waiting('L1')).toBe(9);
    expect(await h.svc.releaseFor(h.listing, new Date(T0.getTime() + DAY))).toBe(5);
    expect(await h.svc.waiting('L1')).toBe(4);
  });

  it('never counts a held thread as one the business was given', async () => {
    // The bug this stops: counting rows that EXIST rather than rows that were
    // handed over means a listing past its limit never recovers, because
    // yesterday's held threads fill today's allowance without being released.
    const h = harness();
    for (let i = 0; i < 9; i++) await h.arrive(new Date(T0.getTime() + i * 60_000));
    const tomorrow = new Date(T0.getTime() + DAY);
    expect(await h.svc.holdsNewThread(h.listing, tomorrow)).toBe(false);
  });

  it('stops holding anything once the person behind it is verified', async () => {
    const h = harness({ identity: true });
    for (let i = 0; i < 20; i++) await h.arrive(new Date(T0.getTime() + i * 60_000));
    expect(await h.svc.waiting('L1')).toBe(0);
    expect(await h.svc.holdsNewThread(h.listing, T0)).toBe(false);
  });
});

describe('sending a document', () => {
  it('refuses a GST certificate as proof of a kitchen, and says what to send', async () => {
    const h = harness({ businessType: 'restaurant' });
    await expect(h.svc.submit('U1', 'L1', { entityKind: 'registered', docKind: 'gstin', docRef: '27AAACT2727Q1ZW' }))
      .rejects.toBeInstanceOf(BadRequestException);
    await h.svc.submit('U1', 'L1', { entityKind: 'registered', docKind: 'fssai', docRef: '11522998000123' });
    expect(h.verification()!.docStatus).toBe('submitted');
  });

  it('never lets a submission verify itself', async () => {
    const h = harness();
    const out = await h.svc.submit('U1', 'L1', { entityKind: 'registered', docKind: 'udyam', docRef: 'UDYAM-MH-01-0000001' });
    expect(out.docStatus).toBe('submitted');
    expect(out.tier).toBe('basic'); // identity is still unproved
    expect(out.gateLifted).toBe(false);
  });

  it('takes a freelancer at their word and asks them for nothing further', async () => {
    const h = harness({ identity: true });
    const out = await h.svc.submit('U1', 'L1', { entityKind: 'individual' });
    expect(h.verification()!.docStatus).toBe('none');
    expect(out.nextStep).toContain('right answer');
    expect(out.gateLifted).toBe(true);
  });

  it('clears an old refusal when a new document arrives', async () => {
    // Otherwise the owner reads "we could not accept that" underneath a
    // document nobody has looked at yet.
    const h = harness();
    await h.svc.submit('U1', 'L1', { entityKind: 'registered', docKind: 'udyam', docRef: 'UDYAM-1' });
    await h.svc.decide('ADMIN', 'L1', 'rejected', 'The name on the certificate is not the name on the listing.');
    expect(h.verification()!.rejectReason).toContain('name on the certificate');
    await h.svc.submit('U1', 'L1', { entityKind: 'registered', docKind: 'gstin', docRef: '27AAACT2727Q1ZW' });
    expect(h.verification()!.rejectReason).toBeNull();
    expect(h.verification()!.docStatus).toBe('submitted');
  });

  it('will not let one owner send a document for somebody else\'s listing', async () => {
    const h = harness();
    await expect(h.svc.submit('SOMEBODY-ELSE', 'L1', { entityKind: 'individual' })).rejects.toThrow();
  });
});

describe('the decision', () => {
  it('empties the whole queue the moment it is taken, and says how many', async () => {
    const h = harness({ identity: true });
    // Identity is proved but the document is not, so nothing is held — build
    // the backlog against a listing that is still basic.
    const g = harness();
    for (let i = 0; i < 9; i++) await g.arrive(new Date(T0.getTime() + i * 60_000));
    expect(await g.svc.waiting('L1')).toBe(4);

    await g.svc.decide('ADMIN', 'L1', 'verified', 'Udyam certificate matches the listing.');
    // Still basic — the person behind it has not proved who they are — so the
    // gate has NOT lifted, and only the day's room was released.
    expect(await g.svc.waiting('L1')).toBe(4);

    await h.svc.decide('ADMIN', 'L1', 'verified', 'Udyam certificate matches the listing.');
    expect(h.notes.at(-1)!.title).toContain('is verified');
  });

  it('tells the owner why it was refused, in the words the admin wrote', async () => {
    const h = harness();
    await h.svc.decide('ADMIN', 'L1', 'rejected', 'The certificate has expired.');
    expect(h.notes.at(-1)!.body).toBe('The certificate has expired.');
    expect(h.notes.at(-1)!.title).toContain('could not verify');
  });
});

describe('what a directory card is given', () => {
  const bare: TrustEvidence = {
    entityKind: 'registered', identityVerified: false, phoneVerified: false,
    docKind: null, docStatus: 'none', placeConfirmed: false,
    listedForDays: 0, reviewCount: 0, rating: null, reportsUpheld: 0,
  };

  it('counts the checks that passed and invents no score', () => {
    // The whole reason this shape exists. A "Trust Score 92/100" on somebody
    // else's business is a number the platform cannot show its working for;
    // "2 of 5 checks" is the same reassurance and every part of it can be
    // pointed at. If a `score` ever appears on this object, that argument was
    // lost somewhere and nobody noticed.
    const s = summaryOf({ ...bare, phoneVerified: true, identityVerified: true });
    expect(s.done).toBe(2);
    expect(s.total).toBe(5);
    expect(s).not.toHaveProperty('score');
    expect(Object.keys(s).sort()).toEqual(['blurb', 'checks', 'done', 'label', 'tier', 'total']);
  });

  it('says nothing at all about a listing that has passed nothing', () => {
    const s = summaryOf(bare);
    expect(s.tier).toBe('basic');
    expect(s.label).toBeNull();
    expect(s.checks.every((c) => !c.done)).toBe(true);
    expect(s.done).toBe(0);
  });

  it('agrees with the ladder rather than restating it', () => {
    // Two code paths compute a tier — the single-listing read and the batched
    // one behind a page of cards. Both go through tierOf, and if they ever
    // disagree one of them is a bug rather than a variant.
    const full: TrustEvidence = {
      ...bare, phoneVerified: true, identityVerified: true,
      docKind: 'fssai', docStatus: 'verified', placeConfirmed: true,
    };
    expect(summaryOf(full, policyFor('restaurant')).tier).toBe('business');
    expect(summaryOf(full, policyFor('clinic')).tier).toBe('identity');
    expect(summaryOf(full, policyFor('clinic')).done).toBe(4);
    // The camera is the fifth check, and it counts the same way.
    expect(summaryOf({ ...full, videoVerified: true }, policyFor('restaurant')).done).toBe(5);
  });
});
