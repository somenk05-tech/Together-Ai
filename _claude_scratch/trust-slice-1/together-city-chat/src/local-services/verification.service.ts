import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  badgeFor, DOC_KINDS, ENTITY_KINDS, FREE_NEW_THREADS_PER_DAY, gateLifted, nextStep, policyFor,
  tierOf, type DocKind, type EntityKind, type Tier, type TrustEvidence, type TrustBadge,
} from './trust';
import { dayStartUtc, releasable, shouldHold } from './trust-gate';
import type { SubmitVerificationDto } from './dto/verification.dto';

/** Only what the ladder needs off a listing. Deliberately not the whole row —
 *  this service should not grow opinions about menus or opening hours. */
export type TrustableListing = {
  id: string; ownerId: string; businessType: string | null; createdAt: Date;
};

type VerificationRow = {
  id: string; listingId: string;
  entityKind: string | null; docKind: string | null; docRef: string | null; docUrl: string | null;
  docStatus: string; submittedAt: Date | null; decidedAt: Date | null; decidedBy: string | null;
  rejectReason: string | null; placeConfirmedAt: Date | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * TOGETHER CITY TRUST — the reading and the writing.
 *
 * `trust.ts` decides and this collects. Every rung's evidence is gathered here
 * from rows that already exist (the account's phone, the listing's age, the
 * reviews it earned) plus the one new table, and handed to a pure function
 * that has never seen a database. That split is why a rung can be argued about
 * in a test rather than in production.
 */
@Injectable()
export class VerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // ───────────────────────── evidence ─────────────────────────

  private async row(listingId: string): Promise<VerificationRow | null> {
    return this.prisma.serviceVerification.findUnique({ where: { listingId } }) as unknown as VerificationRow | null;
  }

  /**
   * Everything the ladder reads, for one listing.
   *
   * Five reads and no joins on purpose: a joined query that grows an `include`
   * six months from now is how a citizen's name ends up in an object built for
   * a business, and this hub is the one place in the city where that is the
   * whole promise.
   */
  async evidenceFor(l: TrustableListing, now = new Date()): Promise<TrustEvidence> {
    const [v, owner, reviews, rejections] = await Promise.all([
      this.row(l.id),
      this.prisma.user.findUnique({
        where: { id: l.ownerId },
        select: { phoneVerifiedAt: true, identityVerifiedAt: true },
      }) as unknown as Promise<{ phoneVerifiedAt: Date | null; identityVerifiedAt: Date | null } | null>,
      this.prisma.serviceReview.findMany({
        where: { listingId: l.id }, select: { rating: true }, take: 500,
      }) as unknown as Promise<Array<{ rating: number }>>,
      // A HUMAN DECISION THAT WENT AGAINST THIS LISTING. Reports on a business
      // are not built yet — `Report.targetType` is user | post | comment — so
      // the honest signal available today is the moderation log, which is a
      // real record of a real person refusing or removing this page.
      this.prisma.moderationLog.count({
        where: { listingId: l.id, decision: { in: ['rejected', 'removed'] } },
      }),
    ]);

    // The same floor as the directory's star average, and for the same reason:
    // a rating the city will not print is not a rating a badge can rest on.
    const rating = reviews.length >= 3
      ? Math.round((reviews.reduce((n, r) => n + r.rating, 0) / reviews.length) * 10) / 10
      : null;

    return {
      entityKind: (v?.entityKind as EntityKind | null) ?? null,
      identityVerified: owner?.identityVerifiedAt != null,
      phoneVerified: owner?.phoneVerifiedAt != null,
      docKind: (v?.docKind as DocKind | null) ?? null,
      docStatus: (v?.docStatus as TrustEvidence['docStatus']) ?? 'none',
      placeConfirmed: v?.placeConfirmedAt != null,
      listedForDays: Math.max(0, Math.floor((now.getTime() - l.createdAt.getTime()) / DAY_MS)),
      reviewCount: reviews.length,
      rating,
      reportsUpheld: rejections,
    };
  }

  async tierOf(l: TrustableListing, now = new Date()): Promise<Tier> {
    return tierOf(await this.evidenceFor(l, now), policyFor(l.businessType));
  }

  /** What a citizen sees on a business page. Null at basic — the absence of a
   *  claim, never a claim of absence. */
  async badgeFor(l: TrustableListing, now = new Date()): Promise<TrustBadge | null> {
    return badgeFor(await this.tierOf(l, now));
  }

  // ───────────────────────── the gate ─────────────────────────

  /** New threads this listing has actually been given today. */
  private async openedToday(listingId: string, now: Date): Promise<number> {
    return this.prisma.serviceEnquiry.count({
      where: { listingId, openedAt: { gte: dayStartUtc(now) } },
    });
  }

  /** Threads the business has not been given at all. */
  async waiting(listingId: string): Promise<number> {
    return this.prisma.serviceEnquiry.count({ where: { listingId, openedAt: null } });
  }

  /**
   * Is this NEW thread handed over now, or held?
   *
   * Only ever asked about a new one. A thread already given away cannot be
   * taken back — a room that was open on Monday and gone on Tuesday is worse
   * than one that was never opened.
   */
  async holdsNewThread(l: TrustableListing, now = new Date()): Promise<boolean> {
    const tier = await this.tierOf(l, now);
    if (gateLifted(tier)) return false;
    return shouldHold(tier, await this.openedToday(l.id, now));
  }

  /**
   * RELEASE WHAT TODAY HAS ROOM FOR, OLDEST FIRST.
   *
   * Called when the owner opens their inbox rather than by a scheduled job:
   * there is nothing to run, nothing to drift, and the rule is one pure
   * function with a test beside it. The neighbour who has waited longest is
   * the one owed the answer, so any other order lets a busy day bury somebody
   * indefinitely.
   */
  async releaseFor(l: TrustableListing, now = new Date()): Promise<number> {
    const held = await this.prisma.serviceEnquiry.findMany({
      where: { listingId: l.id, openedAt: null },
      select: { id: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
      take: 200,
    }) as unknown as Array<{ id: string; createdAt: Date }>;
    if (held.length === 0) return 0;

    const tier = await this.tierOf(l, now);
    const out = releasable(held, tier, await this.openedToday(l.id, now));
    if (out.length === 0) return 0;

    await this.prisma.serviceEnquiry.updateMany({
      where: { id: { in: out.map((t) => t.id) } },
      data: { openedAt: now },
    });
    return out.length;
  }

  // ───────────────────────── the owner's tab ─────────────────────────

  private async own(ownerId: string, listingId: string): Promise<TrustableListing> {
    const l = await this.prisma.serviceListing.findUnique({
      where: { id: listingId },
      select: { id: true, ownerId: true, businessType: true, createdAt: true },
    }) as unknown as TrustableListing | null;
    if (!l) throw new NotFoundException('listing not found');
    if (l.ownerId !== ownerId) throw new ForbiddenException('not your listing');
    return l;
  }

  async read(ownerId: string, listingId: string, now = new Date()) {
    const l = await this.own(ownerId, listingId);
    const [ev, v, waiting] = await Promise.all([
      this.evidenceFor(l, now), this.row(l.id), this.waiting(l.id),
    ]);
    const policy = policyFor(l.businessType);
    const tier = tierOf(ev, policy);
    const badge = badgeFor(tier);

    return {
      tier,
      label: badge?.label ?? null,
      blurb: badge?.blurb ?? null,
      entityKind: ev.entityKind,
      entityKinds: Object.entries(ENTITY_KINDS).map(([kind, label]) => ({ kind, label })),
      phoneVerified: ev.phoneVerified,
      identityVerified: ev.identityVerified,
      docKind: ev.docKind,
      docRef: v?.docRef ?? null,
      docStatus: ev.docStatus,
      docRejectReason: v?.rejectReason ?? null,
      placeConfirmed: ev.placeConfirmed,
      waiting,
      freePerDay: FREE_NEW_THREADS_PER_DAY,
      gateLifted: gateLifted(tier),
      nextStep: nextStep(ev, policy),
      accepts: policy.accepts.map((kind) => ({ kind, label: DOC_KINDS[kind] })),
      requires: policy.requires ?? null,
      why: policy.why ?? null,
    };
  }

  /**
   * SEND IT FOR CHECKING.
   *
   * Nothing here decides anything — a submission sets `submitted` and a person
   * in the console sets the rest. A route that could write `verified` is a
   * route that will one day be reached by something that is not a person.
   */
  async submit(ownerId: string, listingId: string, dto: SubmitVerificationDto, now = new Date()) {
    const l = await this.own(ownerId, listingId);
    const policy = policyFor(l.businessType);

    // A freelancer has no business document to give and never will. The ladder
    // ends at Identity verified for them, the gate is already lifted there, and
    // that is the right answer rather than a rung left dangling.
    if (dto.entityKind === 'individual') {
      await this.upsert(l.id, { entityKind: dto.entityKind, docKind: null, docRef: null, docUrl: null, docStatus: 'none' });
      return this.read(ownerId, listingId, now);
    }

    if (!dto.docKind || !dto.docRef) {
      throw new BadRequestException('Choose a document and give its number.');
    }
    if (!policy.accepts.includes(dto.docKind)) {
      throw new BadRequestException(`${DOC_KINDS[dto.docKind]} is not proof of this kind of business.`);
    }
    if (policy.requires && !policy.requires.includes(dto.docKind)) {
      throw new BadRequestException(
        `${policy.why ?? ''} Send ${DOC_KINDS[policy.requires[0]]}.`.trim(),
      );
    }

    await this.upsert(l.id, {
      entityKind: dto.entityKind,
      docKind: dto.docKind,
      docRef: dto.docRef,
      docUrl: dto.docUrl ?? null,
      docStatus: 'submitted',
      submittedAt: now,
      // A resubmission is a fresh question. Leaving the old refusal on the row
      // means the owner reads "we could not accept that" under a document we
      // have not looked at yet.
      rejectReason: null,
      decidedAt: null,
      decidedBy: null,
    });
    return this.read(ownerId, listingId, now);
  }

  private async upsert(listingId: string, data: Record<string, unknown>) {
    await this.prisma.serviceVerification.upsert({
      where: { listingId },
      create: { listingId, ...data },
      update: data,
    });
  }

  // ───────────────────────── the console ─────────────────────────

  /** Oldest first. The listing nobody got to on Monday is the listing nobody
   *  gets to on Friday unless the queue is drained from its tail. */
  async queue(take = 50) {
    const rows = await this.prisma.serviceVerification.findMany({
      where: { docStatus: 'submitted' },
      orderBy: { submittedAt: 'asc' },
      take,
    }) as unknown as VerificationRow[];
    if (rows.length === 0) return { items: [] };

    const listings = await this.prisma.serviceListing.findMany({
      where: { id: { in: rows.map((r) => r.listingId) } },
      select: { id: true, businessName: true, categoryKey: true, city: true, businessType: true },
      take,
    }) as unknown as Array<{ id: string; businessName: string; categoryKey: string; city: string; businessType: string | null }>;
    const byId = new Map(listings.map((l) => [l.id, l]));

    return {
      items: rows.map((r) => ({
        listingId: r.listingId,
        businessName: byId.get(r.listingId)?.businessName ?? null,
        city: byId.get(r.listingId)?.city ?? null,
        businessType: byId.get(r.listingId)?.businessType ?? null,
        entityKind: r.entityKind,
        entityLabel: r.entityKind ? ENTITY_KINDS[r.entityKind as EntityKind] : null,
        docKind: r.docKind,
        docLabel: r.docKind ? DOC_KINDS[r.docKind as DocKind] : null,
        docRef: r.docRef,
        docUrl: r.docUrl,
        submittedAt: r.submittedAt?.toISOString() ?? null,
      })),
    };
  }

  /**
   * THE DECISION, AND THE ONE THING THAT HAPPENS AFTER IT.
   *
   * Approving releases every held thread at once. That is the whole promise the
   * tab makes — "you will get them all the moment this is verified" — and a
   * promise kept by a nightly job is a promise broken until the job runs.
   */
  async decide(adminId: string, listingId: string, decision: 'verified' | 'rejected', reason?: string, now = new Date()) {
    const l = await this.prisma.serviceListing.findUnique({
      where: { id: listingId },
      select: { id: true, ownerId: true, businessType: true, businessName: true, createdAt: true },
    }) as unknown as (TrustableListing & { businessName: string }) | null;
    if (!l) throw new NotFoundException('listing not found');

    await this.upsert(listingId, {
      docStatus: decision,
      decidedAt: now,
      decidedBy: adminId,
      rejectReason: decision === 'rejected' ? (reason ?? '') : null,
    });

    let released = 0;
    if (decision === 'verified') released = await this.releaseFor(l, now);

    void this.notifications.create({
      userId: l.ownerId,
      kind: 'service_verification',
      entityId: listingId,
      title: decision === 'verified' ? `${l.businessName} is verified` : `${l.businessName} — we could not verify that`,
      body: decision === 'verified'
        ? (released > 0
          ? `${released} ${released === 1 ? 'neighbour has' : 'neighbours have'} been waiting. They are in your messages now.`
          : 'Your badge is live and the daily limit is gone.')
        : (reason ?? 'Open your business page to send something else.'),
      href: '/services/mine',
    });

    return { listingId, docStatus: decision, released };
  }
}
