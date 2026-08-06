import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { swallowed } from '../shared/swallow';
import { PrismaService } from '../shared/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { categoryLabel, isCategory } from './categories';
import { mintAlias } from './alias';
import { boundingBox, haversineKm, parsePoint } from './geo';
import type { BrowseDto, CreateListingDto, UpdateListingDto, PostOfferDto } from './dto/local-services.dto';

type ListingRow = {
  id: string; ownerId: string; businessName: string; categoryKey: string; about: string | null;
  city: string; areas: string; phone: string | null; priceFrom: number | null; photosJson: string;
  lat: number | null; lng: number | null; radiusKm: number | null; homeVisit: boolean; onlineOk: boolean;
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
const MAX_LIVE_OFFERS = 5;

/** A calendar day, not an instant. Offers are dated, and a DATE column compared
 *  against a timestamp with a time on it silently excludes the whole of today. */
const startOfDayUtc = (d: Date): Date =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const ymd = (d: Date): string => d.toISOString().slice(0, 10);
const parseYmd = (s: string): Date | null => {
  const [y, m, day] = s.split('-').map(Number);
  if (!y || !m || !day) return null;
  const d = new Date(Date.UTC(y, m - 1, day));
  return Number.isNaN(d.getTime()) ? null : d;
};

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
      // The pin. Public on purpose — a shopfront's address is not a secret, and
      // a directory that will not say where anybody is cannot be walked to.
      lat: l.lat, lng: l.lng, radiusKm: l.radiusKm,
      homeVisit: l.homeVisit, onlineOk: l.onlineOk,
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

  async browse(q: BrowseDto, viewerId?: string) {
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

    /**
     * NEAR ME. The box goes in the query because an index can use it; the exact
     * circle is trimmed afterwards, in memory, on the rows the box returned.
     * Filtering by haversine in SQL reads every row in the table on every pan.
     *
     * A listing with no coordinates is excluded from a distance search rather
     * than assumed to be far away — it has not said where it is, and inventing
     * an answer for it is the one thing this codebase does not do.
     */
    const centre = parsePoint(q.near);
    const near = centre && q.withinKm ? { centre, km: q.withinKm } : null;
    if (near) {
      const b = boundingBox(near.centre.lat, near.centre.lng, near.km);
      where.lat = { gte: b.minLat, lte: b.maxLat };
      where.lng = { gte: b.minLng, lte: b.maxLng };
    }

    if (near) {
      // Paginating a set that is about to be trimmed would drop rows silently,
      // so the box is read whole (capped) and the page is cut after the trim.
      const boxRows = await this.prisma.serviceListing.findMany({
        where, orderBy: { createdAt: 'desc' }, take: 500,
      }) as unknown as ListingRow[];
      const withDist = boxRows
        .map((r) => ({ r, km: haversineKm(near.centre.lat, near.centre.lng, r.lat as number, r.lng as number) }))
        .filter((x) => x.km <= near.km)
        .sort((a, b2) => a.km - b2.km);
      const total = withDist.length;
      const slice = withDist.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
      const items = slice.map((x) => ({ ...this.card(x.r), distanceKm: Math.round(x.km * 100) / 100 }));
      return {
        items, total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
        saved: viewerId ? await this.savedIds(viewerId, items.map((i) => i.id)) : [],
      };
    }

    const [rows, total] = await Promise.all([
      this.prisma.serviceListing.findMany({
        where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE,
      }) as unknown as Promise<ListingRow[]>,
      this.prisma.serviceListing.count({ where }),
    ]);
    const items = rows.map((r) => this.card(r));
    // Which of these the caller already keeps, so a Save button knows whether it
    // is already pressed. One extra indexed read, and the alternative is a
    // second round trip per card.
    return {
      items, total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      saved: viewerId ? await this.savedIds(viewerId, items.map((i) => i.id)) : [],
    };
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
        lat: dto.lat ?? null,
        lng: dto.lng ?? null,
        radiusKm: dto.radiusKm ?? null,
        homeVisit: dto.homeVisit ?? false,
        onlineOk: dto.onlineOk ?? false,
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
    if (dto.lat !== undefined) data.lat = dto.lat;
    if (dto.lng !== undefined) data.lng = dto.lng;
    if (dto.radiusKm !== undefined) data.radiusKm = dto.radiusKm;
    if (dto.homeVisit !== undefined) data.homeVisit = dto.homeVisit;
    if (dto.onlineOk !== undefined) data.onlineOk = dto.onlineOk;
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

  // ───────────────────────── regulars ─────────────────────────

  /**
   * YOUR OWN SHORTLIST, AND THE BUSINESS IS NEVER TOLD.
   *
   * Being saved is a bookmark, not a relationship. A shopkeeper who could see
   * who had bookmarked them would have a list of warm leads, and the citizen
   * who saved them would have made a disclosure they did not intend. So there
   * is no notification here and no count on the owner's card — deliberately,
   * and this comment is the reason a later "engagement" feature should not add
   * one without saying so out loud.
   */
  async saveRegular(userId: string, listingId: string, note?: string) {
    const l = await this.prisma.serviceListing.findUnique({ where: { id: listingId } }) as ListingRow | null;
    if (!l || l.moderation !== 'approved') throw new NotFoundException('listing not found');
    // Upsert, because pressing Save twice from two devices is one bookmark.
    await this.prisma.serviceRegular.upsert({
      where: { userId_listingId: { userId, listingId } },
      create: { userId, listingId, note: note ?? null },
      update: note !== undefined ? { note } : {},
    });
    return { saved: true };
  }

  async forgetRegular(userId: string, listingId: string) {
    await this.prisma.serviceRegular.deleteMany({ where: { userId, listingId } });
    return { saved: false };
  }

  /**
   * The personal marketplace: the businesses they keep, with whatever is on
   * today from each of them attached. A closed listing stays in the list and
   * says so — the citizen chose to keep it, and quietly dropping it would look
   * like the app lost their bookmark rather than the shop shutting.
   */
  async regulars(userId: string, today = new Date()) {
    const rows = await this.prisma.serviceRegular.findMany({
      where: { userId }, orderBy: { createdAt: 'desc' }, take: 200,
    }) as unknown as Array<{ id: string; listingId: string; note: string | null; createdAt: Date }>;
    if (!rows.length) return { items: [] };

    const ids = rows.map((r) => r.listingId);
    const [listings, offers] = await Promise.all([
      this.prisma.serviceListing.findMany({ where: { id: { in: ids } }, take: 200 }) as unknown as Promise<ListingRow[]>,
      this.liveOffers(today, ids),
    ]);
    const byId = new Map(listings.map((l) => [l.id, l]));
    const offersFor = new Map<string, ReturnType<LocalServicesService['offerCard']>[]>();
    for (const o of offers) {
      const list = offersFor.get(o.listingId) ?? [];
      list.push(o);
      offersFor.set(o.listingId, list);
    }
    return {
      items: rows.flatMap((r) => {
        const l = byId.get(r.listingId);
        if (!l) return [];
        return [{
          ...this.card(l),
          savedAt: r.createdAt.toISOString(),
          note: r.note,
          closed: l.moderation !== 'approved',
          offersToday: offersFor.get(l.id) ?? [],
        }];
      }),
    };
  }

  /** Which of these listings the caller has kept — so a browse card knows
   *  whether its Save button is already pressed. */
  async savedIds(userId: string, listingIds: string[]): Promise<string[]> {
    if (!listingIds.length) return [];
    const rows = await this.prisma.serviceRegular.findMany({
      where: { userId, listingId: { in: listingIds.slice(0, 200) } },
      select: { listingId: true }, take: 200,
    }) as unknown as Array<{ listingId: string }>;
    return rows.map((r) => r.listingId);
  }

  // ───────────────────────── offers ─────────────────────────

  private offerCard(o: { id: string; listingId: string; title: string; detail: string | null; startsOn: Date; endsOn: Date }) {
    return {
      id: o.id,
      listingId: o.listingId,
      title: o.title,
      detail: o.detail,
      startsOn: ymd(o.startsOn),
      endsOn: ymd(o.endsOn),
      /** True when it started today — "new today" is worth saying, "still on" is not. */
      startsToday: false,
    };
  }

  private async liveOffers(today: Date, listingIds?: string[]) {
    const d = startOfDayUtc(today);
    const rows = await this.prisma.serviceOffer.findMany({
      where: {
        startsOn: { lte: d }, endsOn: { gte: d },
        ...(listingIds ? { listingId: { in: listingIds.slice(0, 200) } } : {}),
      },
      orderBy: { createdAt: 'desc' }, take: 200,
    }) as unknown as Array<{ id: string; listingId: string; title: string; detail: string | null; startsOn: Date; endsOn: Date }>;
    return rows.map((o) => ({ ...this.offerCard(o), startsToday: ymd(o.startsOn) === ymd(d) }));
  }

  /**
   * Everything on in the city today, with the business attached.
   *
   * An offer whose listing has since been closed is dropped rather than shown:
   * the discount is real but the shop is not, and sending somebody to a door
   * that no longer opens is worse than showing them nothing.
   */
  async offersToday(today = new Date()) {
    const offers = await this.liveOffers(today);
    if (!offers.length) return { items: [] };
    const listings = await this.prisma.serviceListing.findMany({
      where: { id: { in: [...new Set(offers.map((o) => o.listingId))] }, moderation: 'approved' },
      take: 200,
    }) as unknown as ListingRow[];
    const byId = new Map(listings.map((l) => [l.id, l]));
    return {
      items: offers.flatMap((o) => {
        const l = byId.get(o.listingId);
        return l ? [{ ...o, business: this.card(l) }] : [];
      }),
    };
  }

  /** What this owner has running, including what has already finished — a
   *  business needs to see the offer that expired to know why it stopped. */
  async myOffers(ownerId: string, listingId: string) {
    await this.own(ownerId, listingId);
    const rows = await this.prisma.serviceOffer.findMany({
      where: { listingId }, orderBy: { startsOn: 'desc' }, take: 100,
    }) as unknown as Array<{ id: string; listingId: string; title: string; detail: string | null; startsOn: Date; endsOn: Date }>;
    const d = ymd(startOfDayUtc(new Date()));
    return {
      items: rows.map((o) => ({
        ...this.offerCard(o),
        live: ymd(o.startsOn) <= d && ymd(o.endsOn) >= d,
      })),
    };
  }

  async postOffer(ownerId: string, listingId: string, dto: PostOfferDto) {
    const l = await this.own(ownerId, listingId);
    if (l.moderation !== 'approved') throw new BadRequestException('This listing is closed — reopen it before posting an offer.');

    const starts = dto.startsOn ? parseYmd(dto.startsOn) : startOfDayUtc(new Date());
    const ends = dto.endsOn ? parseYmd(dto.endsOn) : starts;
    if (!starts || !ends) throw new BadRequestException('Those dates could not be read.');
    if (ends < starts) throw new BadRequestException('An offer cannot end before it starts.');
    // Two months is a season, not an offer. A cap here is what stops "today's
    // deal" quietly becoming permanent pricing.
    if ((ends.getTime() - starts.getTime()) / 86_400_000 > 60) {
      throw new BadRequestException('An offer can run for at most 60 days. Post it again when it ends.');
    }
    const live = await this.prisma.serviceOffer.count({ where: { listingId, endsOn: { gte: startOfDayUtc(new Date()) } } });
    if (live >= MAX_LIVE_OFFERS) throw new BadRequestException(`You can have ${MAX_LIVE_OFFERS} offers running at once.`);

    const row = await this.prisma.serviceOffer.create({
      data: { listingId, title: dto.title, detail: dto.detail ?? null, startsOn: starts, endsOn: ends },
    }) as unknown as { id: string; listingId: string; title: string; detail: string | null; startsOn: Date; endsOn: Date };
    return this.offerCard(row);
  }

  async removeOffer(ownerId: string, offerId: string) {
    const o = await this.prisma.serviceOffer.findUnique({ where: { id: offerId } }) as { id: string; listingId: string } | null;
    if (!o) throw new NotFoundException('offer not found');
    await this.own(ownerId, o.listingId);
    await this.prisma.serviceOffer.delete({ where: { id: offerId } });
    return { ok: true };
  }
}
