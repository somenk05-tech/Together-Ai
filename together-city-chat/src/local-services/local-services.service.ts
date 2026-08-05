import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { swallowed } from '../shared/swallow';
import { PrismaService } from '../shared/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { categoryLabel, isCategory } from './categories';
import { mintAlias } from './alias';
import type { BrowseDto, CreateListingDto, UpdateListingDto } from './dto/local-services.dto';

type ListingRow = {
  id: string; ownerId: string; businessName: string; categoryKey: string; about: string | null;
  city: string; areas: string; phone: string | null; priceFrom: number | null; photosJson: string;
  moderation: string; createdAt: Date; updatedAt: Date;
};
type EnquiryRow = {
  id: string; listingId: string; seekerId: string; alias: string;
  lastMessageAt: Date; seekerUnread: number; ownerUnread: number; closed: boolean; createdAt: Date;
};

const parse = <T>(json: string | null, fallback: T): T => {
  try { return json ? (JSON.parse(json) as T) : fallback; } catch { return fallback; }
};
const csv = (s?: string): string[] =>
  (s ?? '').split(',').map((x) => x.trim()).filter(Boolean);

const PAGE_SIZE = 24;
const MAX_LISTINGS_PER_OWNER = 5;

@Injectable()
export class LocalServicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // ───────────────────────── shaping ─────────────────────────

  /**
   * THE PUBLIC FACE OF A LISTING.
   *
   * `phone` is absent, not blanked. A field that is present and empty invites
   * the next person to fill it in; a field that was never in the type cannot be
   * rendered by accident. The owner reads their own number back through
   * `mine()`, which is the only place it exists in an outbound object.
   */
  private card(l: ListingRow) {
    return {
      id: l.id,
      businessName: l.businessName,
      categoryKey: l.categoryKey,
      categoryLabel: categoryLabel(l.categoryKey),
      about: l.about,
      city: l.city,
      areas: csv(l.areas),
      priceFrom: l.priceFrom,
      photos: parse<Array<{ url: string; caption?: string }>>(l.photosJson, []),
      createdAt: l.createdAt.toISOString(),
    };
  }

  private ownerCard(l: ListingRow) {
    return { ...this.card(l), phone: l.phone, moderation: l.moderation, updatedAt: l.updatedAt.toISOString() };
  }

  /**
   * A THREAD, SEEN FROM ONE SIDE.
   *
   * `side` decides what the object contains, and the two shapes are genuinely
   * different objects rather than one object with fields nulled out:
   *
   *  · the seeker sees the business — its name is public, that is the point of
   *    a directory;
   *  · the owner sees an alias and NOTHING ELSE about the person. No id, no
   *    handle, no avatar, no join date, no city. There is nothing in this
   *    object to correlate on.
   *
   * `seekerId` never appears in either. It is needed to authorise the request
   * and it stops at the door.
   */
  private thread(e: EnquiryRow & { listing?: ListingRow }, side: 'seeker' | 'owner') {
    const base = {
      id: e.id,
      alias: e.alias,
      lastMessageAt: e.lastMessageAt.toISOString(),
      closed: e.closed,
      createdAt: e.createdAt.toISOString(),
      unread: side === 'seeker' ? e.seekerUnread : e.ownerUnread,
      side,
    };
    if (side === 'owner') return { ...base, listingId: e.listingId };
    return {
      ...base,
      listingId: e.listingId,
      business: e.listing
        ? { id: e.listing.id, businessName: e.listing.businessName, categoryLabel: categoryLabel(e.listing.categoryKey), city: e.listing.city }
        : null,
    };
  }

  // ───────────────────────── the directory ─────────────────────────

  async browse(q: BrowseDto) {
    const page = Math.max(1, q.page ?? 1);
    if (q.category && !isCategory(q.category)) throw new BadRequestException('unknown category');

    const where: Record<string, unknown> = { moderation: 'approved' };
    if (q.category) where.categoryKey = q.category;
    if (q.city) where.city = { equals: q.city, mode: 'insensitive' };
    // An area filter is a substring of the csv rather than a join. A locality is
    // a name somebody typed, and half the value of "local" is that it accepts
    // the name people actually use for where they live.
    if (q.area) where.areas = { contains: q.area, mode: 'insensitive' };
    if (q.q) {
      where.OR = [
        { businessName: { contains: q.q, mode: 'insensitive' } },
        { about: { contains: q.q, mode: 'insensitive' } },
      ];
    }

    const [rows, total] = await Promise.all([
      this.prisma.serviceListing.findMany({
        where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE,
      }) as unknown as Promise<ListingRow[]>,
      this.prisma.serviceListing.count({ where }),
    ]);
    return { items: rows.map((r) => this.card(r)), total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
  }

  /** What the directory currently holds, per category — so an empty hub can say
   *  which rooms are empty instead of showing a wall of zeroes. */
  async facets(city?: string) {
    const where: Record<string, unknown> = { moderation: 'approved' };
    if (city) where.city = { equals: city, mode: 'insensitive' };
    const rows = await this.prisma.serviceListing.groupBy({
      by: ['categoryKey'], where, _count: { _all: true },
    }) as unknown as Array<{ categoryKey: string; _count: { _all: number } }>;
    const counts: Record<string, number> = {};
    for (const r of rows) counts[r.categoryKey] = r._count._all;
    return counts;
  }

  async detail(id: string, viewerId?: string) {
    const l = await this.prisma.serviceListing.findUnique({ where: { id } }) as ListingRow | null;
    // An owner can always see their own, including while it is closed — it is
    // their page, and a page that 404s to the person who wrote it is a bug.
    const ownIt = viewerId != null && l?.ownerId === viewerId;
    if (!l || (l.moderation !== 'approved' && !ownIt)) throw new NotFoundException('listing not found');
    return ownIt ? this.ownerCard(l) : this.card(l);
  }

  // ───────────────────────── being a business ─────────────────────────

  async mine(ownerId: string) {
    const rows = await this.prisma.serviceListing.findMany({
      where: { ownerId }, orderBy: { createdAt: 'desc' }, take: MAX_LISTINGS_PER_OWNER + 20,
    }) as unknown as ListingRow[];
    return rows.map((r) => this.ownerCard(r));
  }

  async create(ownerId: string, dto: CreateListingDto) {
    const live = await this.prisma.serviceListing.count({ where: { ownerId, moderation: { not: 'removed' } } });
    if (live >= MAX_LISTINGS_PER_OWNER) {
      throw new BadRequestException(`You can list up to ${MAX_LISTINGS_PER_OWNER} businesses. Close one first.`);
    }
    const row = await this.prisma.serviceListing.create({
      data: {
        ownerId,
        businessName: dto.businessName,
        categoryKey: dto.categoryKey,
        about: dto.about ?? null,
        city: dto.city,
        areas: (dto.areas ?? '').trim(),
        phone: dto.phone ?? null,
        priceFrom: dto.priceFrom ?? null,
        photosJson: JSON.stringify((dto.photoUrls ?? []).map((url) => ({ url }))),
      },
    }) as unknown as ListingRow;
    return this.ownerCard(row);
  }

  private async own(ownerId: string, id: string): Promise<ListingRow> {
    const l = await this.prisma.serviceListing.findUnique({ where: { id } }) as ListingRow | null;
    if (!l) throw new NotFoundException('listing not found');
    if (l.ownerId !== ownerId) throw new ForbiddenException('not your listing');
    return l;
  }

  async update(ownerId: string, id: string, dto: UpdateListingDto) {
    await this.own(ownerId, id);
    const data: Record<string, unknown> = {};
    if (dto.businessName !== undefined) data.businessName = dto.businessName;
    if (dto.categoryKey !== undefined) data.categoryKey = dto.categoryKey;
    if (dto.about !== undefined) data.about = dto.about;
    if (dto.city !== undefined) data.city = dto.city;
    if (dto.areas !== undefined) data.areas = dto.areas.trim();
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.priceFrom !== undefined) data.priceFrom = dto.priceFrom;
    if (dto.photoUrls !== undefined) data.photosJson = JSON.stringify(dto.photoUrls.map((url) => ({ url })));
    const row = await this.prisma.serviceListing.update({ where: { id }, data }) as unknown as ListingRow;
    return this.ownerCard(row);
  }

  /**
   * Closing a business does not delete the threads. Somebody who was mid-
   * conversation about a job keeps the conversation; what stops is the listing
   * appearing to anyone new.
   */
  async close(ownerId: string, id: string) {
    await this.own(ownerId, id);
    const row = await this.prisma.serviceListing.update({
      where: { id }, data: { moderation: 'removed' },
    }) as unknown as ListingRow;
    return this.ownerCard(row);
  }

  // ───────────────────────── the anonymous thread ─────────────────────────

  /**
   * Open — or return to — the one thread this person has with this business.
   *
   * The unique index on (listingId, seekerId) is what makes "Chat" idempotent:
   * tapping it twice from two devices lands in the same room rather than
   * minting a second alias for the same person.
   */
  async enquire(seekerId: string, listingId: string, message?: string) {
    const l = await this.prisma.serviceListing.findUnique({ where: { id: listingId } }) as ListingRow | null;
    if (!l || l.moderation !== 'approved') throw new NotFoundException('listing not found');
    if (l.ownerId === seekerId) throw new BadRequestException('This is your own business.');

    let e = await this.prisma.serviceEnquiry.findUnique({
      where: { listingId_seekerId: { listingId, seekerId } },
    }) as EnquiryRow | null;

    if (!e) {
      const soFar = await this.prisma.serviceEnquiry.count({ where: { listingId } });
      e = await this.prisma.serviceEnquiry.create({
        data: { listingId, seekerId, alias: mintAlias(soFar) },
      }) as unknown as EnquiryRow;
    }

    const body = (message ?? '').trim();
    if (body) await this.post(seekerId, e.id, body);
    return this.thread({ ...e, listing: l }, 'seeker');
  }

  /** Which side of this thread the caller is on — or none, which is a 404. */
  private async sideOf(userId: string, enquiryId: string): Promise<{ e: EnquiryRow; l: ListingRow; side: 'seeker' | 'owner' }> {
    const e = await this.prisma.serviceEnquiry.findUnique({ where: { id: enquiryId } }) as EnquiryRow | null;
    if (!e) throw new NotFoundException('thread not found');
    const l = await this.prisma.serviceListing.findUnique({ where: { id: e.listingId } }) as ListingRow | null;
    if (!l) throw new NotFoundException('thread not found');
    if (e.seekerId === userId) return { e, l, side: 'seeker' };
    if (l.ownerId === userId) return { e, l, side: 'owner' };
    // Not "forbidden" — a thread you are not in is a thread you cannot know
    // exists, and a 403 confirms the id was real.
    throw new NotFoundException('thread not found');
  }

  async post(userId: string, enquiryId: string, body: string) {
    const { e, l, side } = await this.sideOf(userId, enquiryId);
    if (e.closed) throw new BadRequestException('This conversation is closed.');

    const msg = await this.prisma.serviceMessage.create({
      data: { enquiryId, senderSide: side, body },
    }) as unknown as { id: string; senderSide: string; body: string; createdAt: Date };

    await this.prisma.serviceEnquiry.update({
      where: { id: enquiryId },
      data: {
        lastMessageAt: msg.createdAt,
        ...(side === 'seeker' ? { ownerUnread: { increment: 1 } } : { seekerUnread: { increment: 1 } }),
      },
    });

    // The business is told a neighbour wrote; it is not told who, and the link
    // goes to this hub's own room rather than to /chats.
    if (side === 'seeker') {
      void this.notifications.create({
        userId: l.ownerId, kind: 'service_enquiry', entityId: enquiryId,
        title: `${e.alias} messaged ${l.businessName}`,
        body: body.slice(0, 120),
        href: `/services/messages/${enquiryId}`,
      });
    } else {
      void this.notifications.create({
        userId: e.seekerId, kind: 'service_reply', entityId: enquiryId,
        title: `${l.businessName} replied`,
        body: body.slice(0, 120),
        href: `/services/messages/${enquiryId}`,
      });
    }
    return this.shapeMessage(msg, side);
  }

  private shapeMessage(m: { id: string; senderSide: string; body: string; createdAt: Date }, viewerSide: 'seeker' | 'owner') {
    return {
      id: m.id,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
      // "mine" rather than a sender identity. Neither side needs to know more
      // than which bubble is theirs, and there is nothing else to know.
      mine: m.senderSide === viewerSide,
    };
  }

  async messages(userId: string, enquiryId: string) {
    const { e, l, side } = await this.sideOf(userId, enquiryId);
    const rows = await this.prisma.serviceMessage.findMany({
      where: { enquiryId }, orderBy: { createdAt: 'asc' }, take: 500,
    }) as unknown as Array<{ id: string; senderSide: string; body: string; createdAt: Date }>;

    await this.prisma.serviceEnquiry.update({
      where: { id: enquiryId },
      data: side === 'seeker' ? { seekerUnread: 0 } : { ownerUnread: 0 },
    }).catch(swallowed('localServices.markRead', undefined));

    return {
      thread: this.thread({ ...e, listing: l }, side),
      // The business's name is public either way; only the seeker's is not.
      business: { id: l.id, businessName: l.businessName, categoryLabel: categoryLabel(l.categoryKey), city: l.city },
      messages: rows.map((r) => this.shapeMessage(r, side)),
    };
  }

  /** Every thread the caller is in, from whichever side they are on. */
  async inbox(userId: string) {
    const [asSeeker, ownListings] = await Promise.all([
      this.prisma.serviceEnquiry.findMany({
        where: { seekerId: userId }, orderBy: { lastMessageAt: 'desc' }, take: 100,
      }) as unknown as Promise<EnquiryRow[]>,
      this.prisma.serviceListing.findMany({
        where: { ownerId: userId }, select: { id: true }, take: MAX_LISTINGS_PER_OWNER + 20,
      }) as unknown as Promise<Array<{ id: string }>>,
    ]);
    const ids = ownListings.map((l) => l.id);
    const asOwner = ids.length
      ? await this.prisma.serviceEnquiry.findMany({
          where: { listingId: { in: ids } }, orderBy: { lastMessageAt: 'desc' }, take: 200,
        }) as unknown as EnquiryRow[]
      : [];

    const listings = await this.prisma.serviceListing.findMany({
      where: { id: { in: [...new Set([...asSeeker.map((e) => e.listingId), ...ids])] } },
      take: 320, // the two reads above are capped at 100 and 200; this cannot exceed their union
    }) as unknown as ListingRow[];
    const byId = new Map(listings.map((l) => [l.id, l]));

    const seeking = asSeeker.map((e) => this.thread({ ...e, listing: byId.get(e.listingId) }, 'seeker'));
    const receiving = asOwner.map((e) => ({
      ...this.thread(e, 'owner'),
      businessName: byId.get(e.listingId)?.businessName ?? null,
    }));
    return { seeking, receiving };
  }

  /** Either side can end it. The messages stay; the room stops accepting new ones. */
  async closeThread(userId: string, enquiryId: string) {
    const { e } = await this.sideOf(userId, enquiryId);
    await this.prisma.serviceEnquiry.update({ where: { id: e.id }, data: { closed: true } });
    return { ok: true };
  }
}
