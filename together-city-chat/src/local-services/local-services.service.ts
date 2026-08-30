import { BadRequestException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException, Optional, Logger } from '@nestjs/common';
import { swallowed } from '../shared/swallow';
import { PrismaService } from '../shared/prisma/prisma.service';
import { StorageProvider } from '../media/storage.provider';
import { NotificationsService } from '../notifications/notifications.service';
import { AiService } from '../ai/ai.service';
import { categoryGroup, categoryKeysInGroup, categoryLabel, isCategory, isCategoryGroup } from './categories';
import { customerLabel, mintAlias } from './alias';
import { boundingBox, haversineKm, parsePoint } from './geo';
import { looksLikeId, normaliseSlug, slugProblem, SLUG_MESSAGES, suggestSlug } from './slug';
import { cleanDetails, isBusinessType, readDetails, sectionsFor } from './business-types';
import { normaliseHours, parseHours } from './hours';
import { VerificationService } from './verification.service';
import type { BrowseDto, CreateListingDto, UpdateListingDto, PostOfferDto, SaveMenuDto } from './dto/local-services.dto';
import type { PatchMenuItemDto } from './dto/orders.dto';

type ListingRow = {
  id: string; ownerId: string; businessName: string; categoryKey: string; about: string | null;
  city: string; areas: string; building: string | null; street: string | null; logoUrl: string | null;
  phone: string | null; priceFrom: number | null; photosJson: string;
  lat: number | null; lng: number | null; radiusKm: number | null;
  slug: string | null;
  businessType: string | null;
  detailsJson: string | null;
  hoursJson: string | null;
  phonePublic: boolean;
  moderation: string; createdAt: Date; updatedAt: Date;
};
type ReviewRow = {
  id: string; listingId: string; reviewerId: string; alias: string;
  rating: number; body: string | null; ownerReply: string | null;
  createdAt: Date; updatedAt: Date;
};
/**
 * A star average, and the reason it is not shown under three reviews.
 *
 * One five-star review is not a five-star business, it is one happy customer —
 * and a card showing ★5.0 on a sample of one is a claim the data cannot carry.
 * Below the floor the count is shown and the average is withheld, which is the
 * honest shape: "2 reviews" tells you exactly what is known.
 */
export const MIN_REVIEWS_FOR_AVERAGE = 3;
export function ratingOf(rows: Array<{ rating: number }>): { rating: number | null; count: number } {
  if (rows.length < MIN_REVIEWS_FOR_AVERAGE) return { rating: null, count: rows.length };
  const avg = rows.reduce((n, r) => n + r.rating, 0) / rows.length;
  return { rating: Math.round(avg * 10) / 10, count: rows.length };
}

type EnquiryRow = {
  id: string; listingId: string; seekerId: string; alias: string; revealName: boolean;
  lastMessageAt: Date; seekerUnread: number; ownerUnread: number; closed: boolean;
  openedAt: Date | null; createdAt: Date;
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

/* Module-level rather than an instance field: deletion.spec.ts constructs this
   service with `Object.create(LocalServicesService.prototype)`, which does not
   run field initialisers — so an instance `logger` is undefined there, and the
   first thing that reached for one turned a passing test into a TypeError. */
const log = new Logger('LocalServicesService');

@Injectable()
export class LocalServicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly ai: AiService,
    // The five-a-day gate. It lives next door because it is a fact about a
    // BUSINESS, not about a conversation — this service only asks it whether a
    // brand-new thread is handed over or held.
    private readonly verification: VerificationService,
    /* Optional so the specs that construct this service directly keep working;
       `remove` says loudly in the log when files were left behind. */
    @Optional() private readonly storage?: StorageProvider,
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
      // The address a citizen sees. Null on listings older than slugs, and the
      // screens fall back to the id rather than inventing one.
      slug: l.slug,
      /**
       * WHAT KIND OF BUSINESS, AND THEREFORE WHAT THIS PAGE IS.
       *
       * The type decides which sections the page renders and which questions
       * the form asked. It travels on every card so the screen never has to
       * guess from a category label — and `details` arrives already turned
       * into labelled lines, because the labels live in the schema and the
       * screen should not hold a second copy of them.
       */
      businessType: l.businessType,
      sections: sectionsFor(l.businessType),
      details: readDetails(l.businessType, parse<Record<string, unknown>>(l.detailsJson, {})),
      businessName: l.businessName,
      categoryKey: l.categoryKey,
      categoryLabel: categoryLabel(l.categoryKey),
      // The group travels with the card so the screen can pick its words: a
      // restaurant has a menu you order from, a plumber a price list you book
      // off. The rows are identical; the sentence is not.
      categoryGroup: categoryGroup(l.categoryKey),
      about: l.about,
      city: l.city,
      areas: csv(l.areas),
      priceFrom: l.priceFrom,
      photos: parse<Array<{ url: string; caption?: string }>>(l.photosJson, []),
      // The pin. Public on purpose — a shopfront's address is not a secret, and
      // a directory that will not say where anybody is cannot be walked to.
      lat: l.lat, lng: l.lng, radiusKm: l.radiusKm,
      // The exact door, public like the pin (owner, 24 Aug).
      building: l.building, street: l.street,
      // The shop's own sign, chosen — never just whichever photo came first.
      logoUrl: l.logoUrl,
      /**
       * THE HOURS ON THE DOOR. Seven rows or null, and null is not "closed" —
       * it is "never told us", which every screen has to keep saying
       * differently. The OPEN-NOW answer is deliberately not computed here:
       * it changes on the minute, and a value baked into a response is wrong
       * the moment the page is left open. The browser has a clock; this has
       * the rule, in hours.ts, and both sides import the same one.
       */
      hours: parseHours(l.hoursJson),
      /**
       * THE NUMBER, AND THE ONE CONDITION ON IT.
       *
       * `phone` is absent unless the owner published it — absent, not blanked.
       * A field that is present and empty invites the next person to fill it
       * in; a field that was never in the object cannot be rendered by
       * accident, and this is the field where an accident is a citizen's shop
       * number on a page they asked to keep off.
       *
       * The owner reads their own number back through `mine()` regardless.
       */
      ...(l.phonePublic && l.phone ? { phone: l.phone } : {}),
      createdAt: l.createdAt.toISOString(),
    };
  }

  private ownerCard(l: ListingRow) {
    return {
      ...this.card(l),
      phone: l.phone, phonePublic: l.phonePublic,
      // The RAW answers, keyed as the schema declared them — the edit form
      // needs the values back, not the sentences the page prints.
      detailValues: parse<Record<string, unknown>>(l.detailsJson, {}),
      moderation: l.moderation, updatedAt: l.updatedAt.toISOString(),
    };
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
  private thread(e: EnquiryRow & { listing?: ListingRow; seekerName?: string | null }, side: 'seeker' | 'owner') {
    const base = {
      id: e.id,
      /* THE CUSTOMER NUMBER, always — "#3" whether the row was minted today or
         in July under the old word. See alias.ts: the stored signature is not
         rewritten, it is read at the edge. */
      alias: customerLabel(e.alias),
      /* WHETHER THE PERSON CHOSE TO BE NAMED, on both sides: the business needs
         to know whether "#3" is all there is, and the seeker needs to see what
         they are currently showing without opening a settings page. */
      revealName: e.revealName === true,
      lastMessageAt: e.lastMessageAt.toISOString(),
      closed: e.closed,
      createdAt: e.createdAt.toISOString(),
      unread: side === 'seeker' ? e.seekerUnread : e.ownerUnread,
      side,
    };
    /* THE NAME, AND ONLY THE NAME. Owner's call on how much: a display name
       and nothing else — no id, no handle, no photograph, no city, no join
       date, no link to a profile. Enough to greet a customer; nothing to
       build a file on. It is ABSENT rather than null when it was not given,
       for the reason the phone number is absent from a public card: a field
       that is present and empty invites the next person to fill it in. */
    if (side === 'owner') {
      return {
        ...base,
        listingId: e.listingId,
        ...(e.revealName && e.seekerName ? { name: e.seekerName } : {}),
      };
    }
    return {
      ...base,
      listingId: e.listingId,
      business: e.listing
        ? { id: e.listing.id, businessName: e.listing.businessName, categoryLabel: categoryLabel(e.listing.categoryKey), city: e.listing.city }
        : null,
    };
  }

  // ───────────────────────── the directory ─────────────────────────

  /**
   * TRUST FOR A PAGE OF CARDS, in four grouped queries rather than four per
   * card. What a citizen is deciding between, on a directory page, is which of
   * these strangers to write to — so the badge belongs on the card and not two
   * clicks further in.
   */
  private async trustFor(rows: ListingRow[]) {
    const map = await this.verification.summariesFor(
      rows.map((r) => ({ id: r.id, ownerId: r.ownerId, businessType: r.businessType, createdAt: r.createdAt })),
    );
    return map;
  }

  async browse(q: BrowseDto, viewerId?: string) {
    const page = Math.max(1, q.page ?? 1);
    if (q.category && !isCategory(q.category)) throw new BadRequestException('unknown category');
    if (q.group && !isCategoryGroup(q.group)) throw new BadRequestException('unknown category group');

    const where: Record<string, unknown> = { moderation: 'approved' };
    // The leaf wins over the family. A screen that sends a category has already
    // decided which group it came from, and applying both would be the same
    // filter written twice — right today, and wrong the first time a trade
    // moves between groups.
    if (q.category) where.categoryKey = q.category;
    else if (q.group) where.categoryKey = { in: categoryKeysInGroup(q.group) };
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
      const nearIds = items.map((i) => i.id);
      const [savedNear, ratingsNear, trustNear] = await Promise.all([
        viewerId ? this.savedIds(viewerId, nearIds) : Promise.resolve([] as string[]),
        this.ratingsFor(nearIds),
        this.trustFor(slice.map((x) => x.r)),
      ]);
      return {
        items: items.map((i) => ({
          ...i, ...(ratingsNear[i.id] ?? { rating: null, count: 0 }), trust: trustNear.get(i.id) ?? null,
        })),
        total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)), saved: savedNear,
      };
    }

    const [rows, total] = await Promise.all([
      this.prisma.serviceListing.findMany({
        where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE,
      }) as unknown as Promise<ListingRow[]>,
      this.prisma.serviceListing.count({ where }),
    ]);
    const items = rows.map((r) => this.card(r));
    // Which of these the caller already keeps, and how each is rated — two
    // grouped reads for the page, rather than two per card.
    const ids = items.map((i) => i.id);
    const [saved, ratings, trust] = await Promise.all([
      viewerId ? this.savedIds(viewerId, ids) : Promise.resolve([] as string[]),
      this.ratingsFor(ids),
      this.trustFor(rows),
    ]);
    return {
      items: items.map((i) => ({
        ...i, ...(ratings[i.id] ?? { rating: null, count: 0 }), trust: trust.get(i.id) ?? null,
      })),
      total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)), saved,
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

  /**
   * BY NAME OR BY ID, AND THE NAME IS TRIED FIRST.
   *
   * A slug is what a citizen has in their hands — printed on a card, sent in a
   * message. An id is what an old link holds. Both must reach the same shop, so
   * both are accepted and neither is redirected: a URL somebody already shared
   * that quietly changes under them is its own small betrayal.
   */
  async detail(idOrSlug: string, viewerId?: string) {
    const where = looksLikeId(idOrSlug) ? { id: idOrSlug } : { slug: idOrSlug };
    const l = await this.prisma.serviceListing.findUnique({ where } as { where: { id: string } }) as ListingRow | null;
    // An owner can always see their own, including while it is closed — it is
    // their page, and a page that 404s to the person who wrote it is a bug.
    const ownIt = viewerId != null && l?.ownerId === viewerId;
    if (!l || (l.moderation !== 'approved' && !ownIt)) throw new NotFoundException('listing not found');
    /* THE BADGE, ON THE ONE PAGE WHERE SOMEBODY IS DECIDING. Null at basic —
       the absence of a claim, never a claim of absence, because a grey "not
       verified" chip marks every honest new business in the city on the day it
       most needs answering. Directory cards do not carry it yet: that is a
       query per page of results and it belongs with the ranking work. */
    const trust = await this.verification.badgeFor(l);
    return { ...(ownIt ? this.ownerCard(l) : this.card(l)), trust };
  }

  /**
   * Claim an address, or say plainly why it cannot be claimed.
   *
   * Uniqueness is checked here AND enforced by a unique index, because a check
   * followed by a write is a race — two shops pressing save in the same second
   * both see the name free. The index is what actually decides; this is what
   * produces a sentence a person can act on rather than a Prisma error.
   */
  /**
   * A new listing always leaves with an address. If the owner typed one it is
   * theirs; otherwise one is derived from the name, made unique against what
   * exists. Suggesting beats leaving it blank — a blank one means a shop's
   * first link, the one they send to ten people on day one, is a UUID.
   */
  private async slugForNew(typed: string | undefined, businessName: string): Promise<string | null> {
    if (typed?.trim()) return this.claimSlug(typed);
    // unbounded: the whole slug column, and it is one short string per row —
    // a suggestion that collides is worse than a page of reads.
    const rows = await this.prisma.serviceListing.findMany({
      where: { slug: { not: null } }, select: { slug: true }, take: 20000,
    }) as unknown as Array<{ slug: string }>;
    return suggestSlug(businessName, rows.map((r) => r.slug)) || null;
  }

  private async claimSlug(raw: string, ownListingId?: string): Promise<string> {
    const slug = normaliseSlug(raw);
    const problem = slugProblem(slug);
    if (problem) throw new BadRequestException(SLUG_MESSAGES[problem]);
    const existing = await this.prisma.serviceListing.findUnique({ where: { slug } }) as { id: string } | null;
    if (existing && existing.id !== ownListingId) {
      throw new BadRequestException('Another business already has that web address.');
    }
    return slug;
  }

  /** Is this address free? The screen asks as the owner types. */
  async slugAvailable(raw: string) {
    const slug = normaliseSlug(raw);
    const problem = slugProblem(slug);
    if (problem) return { slug, available: false, reason: SLUG_MESSAGES[problem] };
    const existing = await this.prisma.serviceListing.findUnique({ where: { slug } });
    return existing
      ? { slug, available: false, reason: 'Another business already has that web address.' }
      : { slug, available: true, reason: null };
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
        building: dto.building?.trim() || null,
        street: dto.street?.trim() || null,
        logoUrl: dto.logoUrl ?? null,
        slug: await this.slugForNew(dto.slug, dto.businessName),
        businessType: dto.businessType && isBusinessType(dto.businessType) ? dto.businessType : null,
        detailsJson: JSON.stringify(cleanDetails(dto.businessType ?? null, dto.details ?? {})),
        phone: dto.phone ?? null,
        phonePublic: dto.phonePublic ?? false,
        priceFrom: dto.priceFrom ?? null,
        photosJson: JSON.stringify((dto.photoUrls ?? []).map((url) => ({ url }))),
        lat: dto.lat ?? null,
        lng: dto.lng ?? null,
        radiusKm: dto.radiusKm ?? null,
        hoursJson: dto.hours ? JSON.stringify(normaliseHours(dto.hours)) : null,
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
    // An emptied box takes the answer off the page; it does not freeze it.
    if (dto.building !== undefined) data.building = dto.building.trim() || null;
    if (dto.street !== undefined) data.street = dto.street.trim() || null;
    if (dto.logoUrl !== undefined) data.logoUrl = dto.logoUrl;
    if (dto.slug !== undefined) {
      // An empty string means "take it off", which returns the listing to being
      // reachable by id only. It is a strange thing to want, and it is theirs.
      data.slug = dto.slug.trim() ? await this.claimSlug(dto.slug, id) : null;
    }
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.phonePublic !== undefined) data.phonePublic = dto.phonePublic;
    /**
     * The type and its answers move together, always.
     *
     * A listing that changed type while keeping the old type's answers is a
     * salon holding a restaurant's cuisines: invisible, because nothing renders
     * them, and waiting to reappear the day somebody switches back. So the
     * details are re-cleaned against whichever type is in force after this
     * edit, not whichever one was in force before it.
     */
    if (dto.businessType !== undefined || dto.details !== undefined) {
      const nextType = dto.businessType !== undefined
        ? (dto.businessType && isBusinessType(dto.businessType) ? dto.businessType : null)
        : ((await this.prisma.serviceListing.findUnique({ where: { id } }) as { businessType: string | null } | null)?.businessType ?? null);
      if (dto.businessType !== undefined) data.businessType = nextType;
      data.detailsJson = JSON.stringify(cleanDetails(nextType, dto.details ?? {}));
    }
    if (dto.priceFrom !== undefined) data.priceFrom = dto.priceFrom;
    if (dto.photoUrls !== undefined) data.photosJson = JSON.stringify(dto.photoUrls.map((url) => ({ url })));
    if (dto.lat !== undefined) data.lat = dto.lat;
    if (dto.lng !== undefined) data.lng = dto.lng;
    if (dto.radiusKm !== undefined) data.radiusKm = dto.radiusKm;
    /* SEVEN ROWS OR NOTHING. An empty array means "take my hours off the page"
       and stores null, which is the same state as never having set them —
       there is no third state where a listing has hours that say nothing. */
    if (dto.hours !== undefined) {
      data.hoursJson = dto.hours.length ? JSON.stringify(normaliseHours(dto.hours)) : null;
    }
    const row = await this.prisma.serviceListing.update({ where: { id }, data }) as unknown as ListingRow;
    return this.ownerCard(row);
  }

  /**
   * Closing a business does not delete the threads. Somebody who was mid-
   * conversation about a job keeps the conversation; what stops is the listing
   * appearing to anyone new.
   */
  /**
   * DELETE IT FOR GOOD — and only after it has already been closed.
   *
   * TWO STEPS ON PURPOSE. Closing takes a page out of the directory and is
   * reversible in every way that matters; this is not. A single button that
   * destroys a shopfront, its reviews, its menu and every conversation in it is
   * a button somebody presses at the end of a bad week. Requiring the listing to
   * be closed first is one extra press, and it is the press that makes the
   * decision deliberate rather than fast.
   *
   * AND IT BREAKS A PROMISE THIS HUB PRINTED, WHICH IS WHY THE NEIGHBOURS ARE
   * TOLD. "Closing takes it out of the directory. Conversations already open
   * stay open" is on the card next to the close button, and a citizen who was
   * mid-job on Tuesday read it. Deleting ends those rooms. So every person with
   * a thread here is notified BEFORE the rows go, in the same breath — a
   * conversation that simply vanishes is the version of this that is not
   * honest. Their name never enters any of it: the notification is addressed by
   * seekerId and says nothing about who else was in the room.
   */
  async deleteForever(ownerId: string, id: string) {
    const l = await this.own(ownerId, id);
    if (l.moderation !== 'removed') {
      throw new BadRequestException('Close the listing first. Deleting is the step after that.');
    }

    const threads = await this.prisma.serviceEnquiry.findMany({
      where: { listingId: id }, select: { seekerId: true }, take: 500,
    }) as unknown as Array<{ seekerId: string }>;

    // One person, one message, however many threads they somehow have.
    for (const seekerId of new Set(threads.map((t) => t.seekerId))) {
      void this.notifications.create({
        userId: seekerId, kind: 'service_listing_deleted', entityId: id,
        title: `${l.businessName} has gone`,
        body: 'They have removed their page from Together City, and your conversation with them has closed.',
        href: '/services',
      });
    }

    /**
     * ── THE ROWS GO BY CASCADE. THE FILES DID NOT GO AT ALL (30 Aug) ────────
     *
     * The comment below was right about every relation and silent about the
     * bucket — the same sentence, in a fourth place, that purge-plan.ts has
     * for pet photographs: "a foreign key knows nothing about an object
     * store".
     *
     * What was being left behind here is the widest set in the city. A
     * shopfront's logo, its scanned menu, every photograph in its gallery,
     * every menu item's picture, and — cascading from the same row — the
     * VERIFICATION DOCUMENTS the owner submitted to prove the business is
     * real. Those last are the reason this is the most serious of the four:
     * somebody uploads a document to prove who they are, deletes their
     * business page, and the document stays in a public bucket indefinitely.
     *
     * Everything here is a public-bucket URL rather than a private key, which
     * is why the purge plan had no vocabulary for it and this rule read as
     * complete. `keyFromUrl` returns '' for anything not under our own base,
     * so a link an owner pasted from somewhere else is left alone.
     */
    await this.purgeListingObjects(id);

    // Every relation is onDelete: Cascade — enquiries, messages, reviews,
    // regulars, offers, menu items and the verification row go with it.
    await this.prisma.serviceListing.delete({ where: { id } });
    return { ok: true as const, id };
  }

  /**
   * Every stored file this listing owns, out of the bucket before the rows
   * that name them are gone.
   *
   * Best-effort by necessity — a bucket having a bad day must not stop an
   * owner removing their page — but each failure is logged with the key,
   * because after the delete this log is the only record of what was left.
   */
  private async purgeListingObjects(listingId: string): Promise<void> {
    if (!this.storage) {
      log.error(
        `listing ${listingId}: no storage provider wired — its logo, menu scan, gallery, menu-item `
        + 'photographs and verification documents were NOT removed, and the rows naming them are about '
        + 'to be deleted, so those objects are now orphaned.',
      );
      return;
    }
    const storage = this.storage;
    const urls: string[] = [];

    const listing = await this.prisma.serviceListing.findUnique({
      where: { id: listingId },
      select: { logoUrl: true, menuScanUrl: true, photosJson: true },
    }).catch(swallowed('services.purgeObjects: read listing files', null, { listingId }));
    if (listing) {
      urls.push(listing.logoUrl ?? '', listing.menuScanUrl ?? '');
      // `[{url, caption}]` — the gallery shape every listing in the city uses.
      try {
        const parsed: unknown = JSON.parse(listing.photosJson || '[]');
        for (const p of Array.isArray(parsed) ? parsed : []) {
          const u = typeof p === 'string' ? p : (p as Record<string, unknown> | null)?.url;
          if (typeof u === 'string') urls.push(u);
        }
      } catch { /* a malformed gallery must not stop the rest going */ }
    }

    const items = await this.prisma.serviceMenuItem.findMany({
      where: { listingId }, select: { photoUrl: true }, take: 2000,
    }).catch(swallowed('services.purgeObjects: read menu photos', [] as Array<{ photoUrl: string | null }>, { listingId }));
    for (const i of items ?? []) urls.push(i.photoUrl ?? '');

    const ver = await this.prisma.serviceVerification.findFirst({
      where: { listingId }, select: { docUrl: true, videoUrl: true },
    }).catch(swallowed('services.purgeObjects: read verification files', null, { listingId }));
    if (ver) urls.push(ver.docUrl ?? '', ver.videoUrl ?? '');

    let removed = 0;
    const failed: string[] = [];
    for (const url of [...new Set(urls.filter(Boolean))]) {
      const key = storage.keyFromUrl(url);
      if (!key) continue; // not ours — an owner's link to somewhere else
      try { await storage.deleteObject(key); removed += 1; } catch (e) {
        failed.push(key);
        log.error(`listing ${listingId}: could not remove ${key}: ${(e as Error).message}`);
      }
    }
    if (failed.length) {
      log.error(`listing ${listingId}: ${failed.length} object(s) ORPHANED — ${failed.join(', ')}`);
    } else if (removed) {
      log.log(`listing ${listingId}: removed ${removed} stored file(s)`);
    }
  }

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
      /* FIVE NEW NEIGHBOURS A DAY UNTIL THE LISTING IS VERIFIED.
         Asked here and nowhere else, because it is only ever a question about a
         thread that does not exist yet — one already given away cannot be taken
         back, and a room open on Monday and gone on Tuesday is worse than one
         that was never opened.
         The citizen is refused nothing and told nothing: the thread is made,
         the message is stored, and it is the BUSINESS that waits. */
      const held = await this.verification.holdsNewThread(l);
      const soFar = await this.prisma.serviceEnquiry.count({ where: { listingId } });
      e = await this.prisma.serviceEnquiry.create({
        data: { listingId, seekerId, alias: mintAlias(soFar), openedAt: held ? null : new Date() },
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

    // The business is told somebody wrote; who that is, is the asker's call,
    // and the link goes to this hub's own room rather than to /chats.
    if (side === 'seeker' && e.openedAt == null) {
      /* A HELD THREAD RAISES NOTHING. The business cannot open this room yet;
         telling them somebody wrote and then showing them nothing is worse
         than the silence, and the count of people waiting is on the
         verification tab where it can be acted on. */
    } else if (side === 'seeker') {
      /* THE ALERT SAYS WHAT THE INBOX SAYS. A notification naming somebody who
         chose to stay a number would be the leak arriving by push — computed
         before the fire-and-forget below so the read is not hidden inside an
         un-awaited call. */
      const asker = e.revealName
        ? (await this.namesFor([e])).get(e.seekerId) ?? customerLabel(e.alias)
        : customerLabel(e.alias);
      void this.notifications.create({
        userId: l.ownerId, kind: 'service_enquiry', entityId: enquiryId,
        title: `${asker} messaged ${l.businessName}`,
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

  private shapeMessage(
    m: { id: string; senderSide: string; body: string; createdAt: Date; invoiceId?: string | null },
    viewerSide: 'seeker' | 'owner',
  ) {
    return {
      id: m.id,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
      // "mine" rather than a sender identity. Neither side needs to know more
      // than which bubble is theirs, and there is nothing else to know.
      mine: m.senderSide === viewerSide,
      // AN INVOICE ARRIVES IN THE THREAD IT BELONGS TO. The id upgrades the
      // bubble to a card; `body` still carries the sentence, so a reader whose
      // client does not know about invoices sees a message rather than a blank.
      ...(m.invoiceId ? { invoiceId: m.invoiceId } : {}),
    };
  }

  async messages(userId: string, enquiryId: string) {
    const { e, l, side } = await this.sideOf(userId, enquiryId);
    const rows = await this.prisma.serviceMessage.findMany({
      where: { enquiryId }, orderBy: { createdAt: 'asc' }, take: 500,
    }) as unknown as Array<{ id: string; senderSide: string; body: string; createdAt: Date; invoiceId: string | null }>;

    await this.prisma.serviceEnquiry.update({
      where: { id: enquiryId },
      data: side === 'seeker' ? { seekerUnread: 0 } : { ownerUnread: 0 },
    }).catch(swallowed('localServices.markRead', undefined));

    /* The name is read for the OWNER's side only, and only when it was given.
       The seeker knows their own name; putting it in their copy of the thread
       would be a second place it could travel from. */
    const names = side === 'owner' ? await this.namesFor([e]) : new Map<string, string>();

    return {
      thread: this.thread({ ...e, listing: l, seekerName: names.get(e.seekerId) ?? null }, side),
      // The business's name is public either way; only the seeker's is not.
      business: { id: l.id, businessName: l.businessName, categoryLabel: categoryLabel(l.categoryKey), city: l.city },
      messages: rows.map((r) => this.shapeMessage(r, side)),
    };
  }

  /**
   * SHOW MY NAME TO THIS BUSINESS — or stop showing it.
   *
   * The seeker's call and nobody else's: the owner cannot ask for it, cannot
   * see that it was asked, and the guard here is the same 404 the rest of the
   * thread uses — a business that tried this on its own inbox is told the
   * thread does not exist, because from that side, for this purpose, it
   * doesn't.
   *
   * REVERSIBLE, AND THAT IS NOT DECORATION. A name shown cannot be unseen, but
   * a name shown to somebody who turned out to be unpleasant should stop being
   * on their screen — the number comes back the moment this is turned off, and
   * the thread carries on.
   */
  async setReveal(userId: string, enquiryId: string, reveal: boolean) {
    const { e, side } = await this.sideOf(userId, enquiryId);
    if (side !== 'seeker') throw new NotFoundException('thread not found');
    const row = await this.prisma.serviceEnquiry.update({
      where: { id: e.id }, data: { revealName: reveal },
    }) as unknown as EnquiryRow;
    const l = await this.prisma.serviceListing.findUnique({ where: { id: e.listingId } }) as ListingRow | null;
    return this.thread({ ...row, listing: l ?? undefined }, 'seeker');
  }

  /** Every thread the caller is in, from whichever side they are on. */
  /**
   * The display names of the people who chose to be named, and nobody else.
   *
   * `select: { id, name }` and a where-clause built ONLY from threads whose
   * `revealName` is true: an anonymous thread's seekerId never reaches this
   * query, so there is no row to leak by accident later. Returns an empty map
   * when nobody has revealed, which is the common case and costs no query.
   */
  private async namesFor(rows: EnquiryRow[]): Promise<Map<string, string>> {
    const ids = [...new Set(rows.filter((e) => e.revealName).map((e) => e.seekerId))];
    if (!ids.length) return new Map();
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids } }, select: { id: true, name: true }, take: 200,
    }) as unknown as Array<{ id: string; name: string }>;
    return new Map(users.map((u) => [u.id, u.name]));
  }

  async inbox(userId: string) {
    const [asSeeker, ownListings] = await Promise.all([
      this.prisma.serviceEnquiry.findMany({
        where: { seekerId: userId }, orderBy: { lastMessageAt: 'desc' }, take: 100,
      }) as unknown as Promise<EnquiryRow[]>,
      this.prisma.serviceListing.findMany({
        where: { ownerId: userId },
        select: { id: true, ownerId: true, businessType: true, createdAt: true },
        take: MAX_LISTINGS_PER_OWNER + 20,
      }) as unknown as Promise<Array<{ id: string; ownerId: string; businessType: string | null; createdAt: Date }>>,
    ]);
    const ids = ownListings.map((l) => l.id);

    /* HELD THREADS COME OUT HERE, OLDEST FIRST, INTO WHATEVER ROOM TODAY HAS.
       Lazily rather than on a schedule: there is no job to run and nothing to
       drift, and the owner opening their inbox is exactly the moment the
       answer matters. See trust-gate.ts for the rule and its test. */
    await Promise.all(ownListings.map((l) => this.verification.releaseFor(l)));

    const asOwner = ids.length
      ? await this.prisma.serviceEnquiry.findMany({
          // A thread the business has not been given yet is not in its inbox.
          where: { listingId: { in: ids }, openedAt: { not: null } },
          orderBy: { lastMessageAt: 'desc' }, take: 200,
        }) as unknown as EnquiryRow[]
      : [];

    const listings = await this.prisma.serviceListing.findMany({
      where: { id: { in: [...new Set([...asSeeker.map((e) => e.listingId), ...ids])] } },
      take: 320, // the two reads above are capped at 100 and 200; this cannot exceed their union
    }) as unknown as ListingRow[];
    const byId = new Map(listings.map((l) => [l.id, l]));

    /* NAMES ARE FETCHED FOR THE REVEALED THREADS AND NO OTHERS, in one read.
       Not a join on the enquiry — a join returns the user row for every thread
       and leaves a whole citizen sitting in scope next to the loop that shapes
       the anonymous ones, which is exactly the accident anonymity.spec.ts was
       written against. This asks for names by id, only where a name was given,
       and selects the one column. */
    const names = await this.namesFor(asOwner);
    const seeking = asSeeker.map((e) => this.thread({ ...e, listing: byId.get(e.listingId) }, 'seeker'));
    const receiving = asOwner.map((e) => ({
      ...this.thread({ ...e, seekerName: names.get(e.seekerId) ?? null }, 'owner'),
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

  // ───────────────────────── reviews ─────────────────────────

  /**
   * A REVIEW YOU HAD TO EARN, UNDER THE NAME THEY ALREADY KNOW YOU BY.
   *
   * The thread is the gate. It is the only proof of contact this hub has, and
   * it is a real one — you cannot review a plumber you never spoke to. It is
   * NOT proof the work was done, and nothing on the screen claims it is; the
   * honest description is "spoke to them", which is what it says.
   *
   * The alias is copied onto the review rather than joined through the thread,
   * because a thread can be closed or a listing re-read and the signature must
   * not go missing when it is. It is the same alias the business already sees,
   * so a shopkeeper can connect the review to the exchange they remember and
   * answer it, without ever learning who wrote it.
   */
  async postReview(reviewerId: string, listingId: string, rating: number, body?: string) {
    const l = await this.prisma.serviceListing.findUnique({ where: { id: listingId } }) as ListingRow | null;
    if (!l || l.moderation !== 'approved') throw new NotFoundException('listing not found');
    if (l.ownerId === reviewerId) throw new BadRequestException('You cannot review your own business.');

    const thread = await this.prisma.serviceEnquiry.findUnique({
      where: { listingId_seekerId: { listingId, seekerId: reviewerId } },
    }) as EnquiryRow | null;
    if (!thread) {
      throw new BadRequestException('Only someone who has messaged this business can review it. Start a conversation first.');
    }

    const row = await this.prisma.serviceReview.upsert({
      where: { listingId_reviewerId: { listingId, reviewerId } },
      create: { listingId, reviewerId, alias: thread.alias, rating, body: body ?? null },
      // The alias is NOT rewritten on edit — it is the signature on a review the
      // business may already have replied to.
      update: { rating, body: body ?? null },
    }) as unknown as ReviewRow;

    void this.notifications.create({
      userId: l.ownerId, kind: 'service_review', entityId: listingId,
      title: `${customerLabel(thread.alias)} rated ${l.businessName} ${rating}★`,
      body: (body ?? '').slice(0, 120) || 'No words, just the rating.',
      href: `/services/mine`,
    });
    return this.reviewCard(row, 'reviewer');
  }

  async removeReview(reviewerId: string, listingId: string) {
    await this.prisma.serviceReview.deleteMany({ where: { listingId, reviewerId } });
    return { ok: true };
  }

  /** The owner answers. One reply per review — a thread under a rating is a
   *  second conversation in a place built for one. */
  async replyToReview(ownerId: string, reviewId: string, reply: string) {
    const r = await this.prisma.serviceReview.findUnique({ where: { id: reviewId } }) as ReviewRow | null;
    if (!r) throw new NotFoundException('review not found');
    await this.own(ownerId, r.listingId);
    const row = await this.prisma.serviceReview.update({
      where: { id: reviewId }, data: { ownerReply: reply },
    }) as unknown as ReviewRow;
    return this.reviewCard(row, 'owner');
  }

  private reviewCard(r: ReviewRow, side: 'reviewer' | 'owner' | 'public') {
    return {
      id: r.id,
      listingId: r.listingId,
      // The signature, and there is nothing else. No id, no name, no photo.
      /* The signature as the shelf prints it today — "#3" for a review posted
         under the old word too. The STORED string is not rewritten; see
         alias.ts on why a signature is not a thing to edit afterwards. */
      alias: customerLabel(r.alias),
      rating: r.rating,
      body: r.body,
      ownerReply: r.ownerReply,
      createdAt: r.createdAt.toISOString(),
      mine: side === 'reviewer',
    };
  }

  async reviews(listingId: string, viewerId?: string) {
    const rows = await this.prisma.serviceReview.findMany({
      where: { listingId }, orderBy: { createdAt: 'desc' }, take: 200,
    }) as unknown as ReviewRow[];
    const mineRow = viewerId ? rows.find((r) => r.reviewerId === viewerId) : undefined;
    // Whether the caller is ALLOWED to review — the screen needs to know before
    // it offers a form nobody can submit.
    const thread = viewerId
      ? await this.prisma.serviceEnquiry.findUnique({ where: { listingId_seekerId: { listingId, seekerId: viewerId } } })
      : null;
    return {
      ...ratingOf(rows),
      items: rows.map((r) => this.reviewCard(r, viewerId && r.reviewerId === viewerId ? 'reviewer' : 'public')),
      canReview: Boolean(thread),
      /**
       * The caller's OWN alias for this listing, so the review form can say
       * what a review will be signed with before it is written.
       *
       * Their own, and nobody else's — this is the name this one business
       * already calls them, which they have been reading at the top of the
       * thread since they opened it. It travels so the form can live on the
       * business page instead of squatting under a conversation.
       */
      alias: (thread as { alias?: string } | null)?.alias
        ? customerLabel((thread as { alias: string }).alias)
        : null,
      mine: mineRow ? this.reviewCard(mineRow, 'reviewer') : null,
    };
  }

  /** Ratings for a page of cards, in one read rather than one per card. */
  private async ratingsFor(listingIds: string[]): Promise<Record<string, { rating: number | null; count: number }>> {
    if (!listingIds.length) return {};
    const rows = await this.prisma.serviceReview.groupBy({
      by: ['listingId'],
      where: { listingId: { in: listingIds.slice(0, 200) } },
      _avg: { rating: true }, _count: { _all: true },
    }) as unknown as Array<{ listingId: string; _avg: { rating: number | null }; _count: { _all: number } }>;
    const out: Record<string, { rating: number | null; count: number }> = {};
    for (const r of rows) {
      out[r.listingId] = {
        rating: r._avg.rating == null ? null : Math.round(r._avg.rating * 10) / 10,
        count: r._count._all,
      };
    }
    return out;
  }

  // ───────────────────────── the menu ─────────────────────────

  /**
   * READ THE MENU, PROPOSE IT, STORE NOTHING.
   *
   * This is the half people get wrong. An extraction that writes straight to
   * the table looks like magic on the demo and produces a business held to a
   * price a model misread — so `scanMenu` returns a DRAFT and has no write path
   * at all. The only way into `ServiceMenuItem` is `saveMenu`, which the owner
   * calls after they have looked at every line.
   */
  async scanMenu(ownerId: string, listingId: string, dataUrl: string) {
    await this.own(ownerId, listingId);
    const m = /^data:(image\/[a-zA-Z+]+);base64,(.+)$/.exec(dataUrl.trim());
    if (!m) throw new BadRequestException('That does not look like an image.');
    const out = await this.ai.extractMenu({ mediaType: m[1], base64: m[2] });
    /* ── AND WHEN IT DOES NOT READ, IT SAYS WHICH KIND OF NOT (23 Aug) ────
       One sentence used to cover three unrelated things — no key on the
       server, a picture the model could not make sense of, and the provider
       being down — and "the menu reader is unavailable right now" is only
       actionable for none of them. The owner of a small restaurant reads that
       and has no idea whether to take the photograph again.

       The status codes differ for the same reason the sentences do: an
       unreadable photograph is the request's problem (400) and the other two
       are the server's (503), which is also what tells a monitor the
       difference between a bad snapshot and a feature that is down. */
    if (!out.ok) {
      if (out.reason === 'unreadable') {
        throw new BadRequestException(
          'The reader could not make sense of that photograph. One page at a time, straight on and in good light usually does it — or type the items in yourself.',
        );
      }
      throw new ServiceUnavailableException(
        out.reason === 'off'
          ? 'The menu reader is switched off on this server. Nothing you did — type the items in yourself and they publish exactly the same.'
          : 'The menu reader could not be reached just now. Try that photograph again in a moment, or type the items in yourself.',
      );
    }
    return {
      // Draft, and the shape says so: no ids, because nothing has been stored.
      items: out.items,
      note: out.note,
      // Said on the screen too, but the API should not be the only place this
      // is true — a caller that stores `items` without a review step is a bug.
      review: 'Read from your photo. Check every price before you publish it — this was transcribed, not confirmed.',
    };
  }

  /** The corrected menu, replacing whatever was there. */
  async saveMenu(ownerId: string, listingId: string, dto: SaveMenuDto) {
    await this.own(ownerId, listingId);
    /* BY ID WHERE THE EDITOR HAD ONE (24 Aug). This was delete-and-recreate,
       which was fine while a menu line was four text fields — but a line now
       carries state the bulk editor does not show (availability, a photo,
       variants, add-ons, prep time), and recreating the row would silently
       reset every sold-out switch in the shop each time a typo was fixed. A
       line that keeps its id keeps all of it; a line without one is new;
       whatever was not sent is gone, exactly as the screen says. */
    const existing = await this.prisma.serviceMenuItem.findMany({
      where: { listingId }, select: { id: true }, take: 300,
    }) as unknown as Array<{ id: string }>;
    const known = new Set(existing.map((x) => x.id));
    const keep = new Set(dto.items.map((it) => it.id).filter((id): id is string => !!id && known.has(id)));

    await this.prisma.$transaction(async (tx) => {
      await tx.serviceMenuItem.deleteMany({ where: { listingId, id: { notIn: [...keep] } } });
      for (const [i, it] of dto.items.entries()) {
        const data = {
          section: it.section ?? null,
          name: it.name,
          description: it.description ?? null,
          priceInr: it.priceInr ?? null,
          sortOrder: i,
        };
        if (it.id && keep.has(it.id)) {
          await tx.serviceMenuItem.update({ where: { id: it.id }, data });
        } else {
          await tx.serviceMenuItem.create({ data: { ...data, listingId } });
        }
      }
    });
    if (dto.scanUrl !== undefined) {
      await this.prisma.serviceListing.update({ where: { id: listingId }, data: { menuScanUrl: dto.scanUrl } });
    }
    return this.menu(listingId, ownerId);
  }

  /**
   * THE COMMAND CENTRE'S ONE-TAP EDIT — sold out, a price, a photo, a variant
   * list — on one line, without republishing two hundred others. The citizen-
   * facing menu reads the same row, so the change is live the same minute:
   * the card greys, the cart refuses it, the recommender stops saying its name.
   */
  async patchMenuItem(ownerId: string, listingId: string, itemId: string, dto: PatchMenuItemDto) {
    await this.own(ownerId, listingId);
    const item = await this.prisma.serviceMenuItem.findFirst({ where: { id: itemId, listingId }, select: { id: true } });
    if (!item) throw new NotFoundException('menu item not found');
    await this.prisma.serviceMenuItem.update({
      where: { id: itemId },
      data: {
        ...(dto.available !== undefined ? { available: dto.available } : {}),
        ...(dto.priceInr !== undefined ? { priceInr: dto.priceInr } : {}),
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.section !== undefined ? { section: dto.section } : {}),
        ...(dto.veg !== undefined ? { veg: dto.veg } : {}),
        ...(dto.spice !== undefined ? { spice: dto.spice } : {}),
        ...(dto.photoUrl !== undefined ? { photoUrl: dto.photoUrl } : {}),
        ...(dto.prepMinutes !== undefined ? { prepMinutes: dto.prepMinutes } : {}),
        ...(dto.variants !== undefined ? { variantsJson: dto.variants?.length ? JSON.stringify(dto.variants) : null } : {}),
        ...(dto.addons !== undefined ? { addonsJson: dto.addons?.length ? JSON.stringify(dto.addons) : null } : {}),
      },
    });
    return this.menu(listingId, ownerId);
  }

  /** The menu as anybody sees it, grouped by the headings the menu itself used. */
  async menu(listingId: string, viewerId: string) {
    const [rows, listing] = await Promise.all([
      this.prisma.serviceMenuItem.findMany({
        where: { listingId }, orderBy: { sortOrder: 'asc' }, take: 300,
      }) as unknown as Promise<Array<{
        id: string; section: string | null; name: string; description: string | null; priceInr: number | null;
        available: boolean; veg: string | null; spice: number | null; photoUrl: string | null;
        prepMinutes: number | null; variantsJson: string | null; addonsJson: string | null;
      }>>,
      this.prisma.serviceListing.findUnique({ where: { id: listingId } }) as unknown as Promise<{ menuScanUrl: string | null; ownerId: string; moderation: string } | null>,
    ]);
    // The same visibility rule as the listing page it hangs off: a menu belongs
    // to a business, and a business that is closed or waiting on moderation is
    // visible to nobody but the person who wrote it. Reading the menu must not
    // be the back door to a page the citizen cannot open.
    if (!listing || (listing.moderation !== 'approved' && listing.ownerId !== viewerId)) {
      throw new NotFoundException('listing not found');
    }
    /* SOLD OUT IS SHOWN, NOT HIDDEN. An item that vanishes when the kitchen
       runs out looks like a menu that shrank, and reappearing tomorrow looks
       like a new dish. The row stays, says "sold out", and refuses the cart —
       the same honesty rule the shelf uses for an empty shelf. */
    const namedList = (json: string | null): Array<{ name: string; priceInr: number }> => {
      if (!json) return [];
      try {
        const arr = JSON.parse(json) as unknown;
        return Array.isArray(arr)
          ? arr.filter((v): v is { name: string; priceInr: number } =>
            !!v && typeof (v as { name?: unknown }).name === 'string' && typeof (v as { priceInr?: unknown }).priceInr === 'number').slice(0, 12)
          : [];
      } catch { return []; }
    };
    const shaped = rows.map((r) => ({
      id: r.id, section: r.section, name: r.name, description: r.description, priceInr: r.priceInr,
      available: r.available,
      veg: r.veg, spice: r.spice, photoUrl: r.photoUrl, prepMinutes: r.prepMinutes,
      variants: namedList(r.variantsJson),
      addons: namedList(r.addonsJson),
    }));
    const sections: Array<{ section: string | null; items: typeof shaped }> = [];
    for (const r of shaped) {
      let bucket = sections.find((x) => x.section === (r.section ?? null));
      if (!bucket) { bucket = { section: r.section ?? null, items: [] }; sections.push(bucket); }
      bucket.items.push(r);
    }
    return { count: rows.length, sections, scanUrl: listing?.menuScanUrl ?? null };
  }

  /**
   * PICK ITEMS OFF A MENU AND ASK ABOUT THEM.
   *
   * It posts a message into the thread that already exists, in the citizen's
   * own words plus the lines they picked — it does NOT place an order. There is
   * no payment here, no stock, no confirmation, and pretending otherwise would
   * be the worst kind of half-feature: a business acting on an "order" the app
   * never actually took.
   *
   * The message is plain text on purpose. It has to be readable by the
   * shopkeeper on a bad connection, and it is the record both sides keep.
   */
  async sendMenuItems(seekerId: string, listingId: string, itemIds: string[], note?: string) {
    const thread = await this.enquire(seekerId, listingId);
    const rows = await this.prisma.serviceMenuItem.findMany({
      where: { id: { in: itemIds.slice(0, 30) }, listingId }, orderBy: { sortOrder: 'asc' }, take: 30,
    }) as unknown as Array<{ name: string; priceInr: number | null }>;
    if (!rows.length) throw new BadRequestException('Those items are no longer on the menu.');

    const lines = rows.map((r) => `· ${r.name}${r.priceInr != null ? ` — ₹${r.priceInr}` : ''}`);
    const known = rows.filter((r) => r.priceInr != null);
    // Only totalled when every line has a price. A total that silently omits
    // the "ask" items is a number the citizen will hold the business to.
    const total = known.length === rows.length
      ? `\nThat comes to ₹${known.reduce((n, r) => n + (r.priceInr as number), 0)} at the listed prices.`
      : '\nSome of these have no listed price.';

    const body = [
      'Asking about:',
      ...lines,
      total,
      (note ?? '').trim() ? `\n${(note as string).trim()}` : '',
      '\nThis is a question, not an order.',
    ].filter(Boolean).join('\n');

    await this.post(seekerId, thread.id, body);
    return { threadId: thread.id };
  }
}
