import { swallowed } from '../shared/swallow';
import { BadRequestException, ForbiddenException, Injectable, NotFoundException, OnModuleInit, Optional, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import { ClockService, DEFAULT_TIMEZONE } from '../shared/clock/clock.service';
import { AdminAccessService } from '../admin/admin-access.service';
import { PostMediaGuard } from '../social/post-media-guard';
import { AiService } from '../ai/ai.service';
import { ConversationsService } from '../conversations/conversations.service';
import { MessagesService } from '../messages/messages.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AMENITY_LABEL, livabilityScore, livabilityBasis } from './realestate.constants';
import { ruleChecks, decide, normalizeDesc, type ListingInput, type ModerationResult } from './moderation';
import type { PostPropertyDto, ListingQueryDto } from './dto/realestate.dto';

type PropRow = {
  id: string; sellerId: string | null; listingType: string; propertyType: string; status: string;
  moderation?: string; moderationJson?: string | null;
  title: string; city: string; locality: string; priceInr: number; areaSqft: number;
  bedrooms: number; bathrooms: number; furnishing: string | null; floor: number | null; totalFloors: number | null;
  facing: string | null; amenities: string; description: string | null; photosJson: string;
  projectName: string | null; developer: string | null; reraId: string | null; possessionDate: string | null;
  progressPct: number | null; floorPlansJson: string | null; milestonesJson: string | null; createdAt: Date;
};

const MAX_LISTINGS_PER_HOUR = 8;

const parse = <T>(json: string | null, fallback: T): T => { try { return json ? JSON.parse(json) as T : fallback; } catch { return fallback; } };

@Injectable()
export class RealEstateService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly access: AdminAccessService,
    private readonly clock: ClockService,
    private readonly conversations: ConversationsService,
    private readonly messages: MessagesService,
    private readonly notifications: NotificationsService,
    /**
     * Optional, and ABSENT MEANS REFUSE — the same contract SocialService and
     * UsersService state. A spec asserting what a listing writes should not have
     * to stand up an image classifier; a listing carrying photographs cannot be
     * waved through because one was not configured.
     */
    @Optional() private readonly screening?: PostMediaGuard,
  ) {}

  async onModuleInit(): Promise<void> {
    // One-time cleanup: remove the old demo listings (platform-seeded ids).
    await this.prisma.property.deleteMany({
      where: { id: { in: ['re_ready_1', 're_ready_2', 're_ready_3', 're_uc_1', 're_uc_2'] }, sellerId: null },
    }).catch(swallowed('realestate.onModuleInit', undefined));
  }

  /**
   * `tz` is the VIEWER's zone, because "posted on" is a date being shown to
   * whoever is looking. It defaults to the city's own zone rather than UTC:
   * a listing posted at 01:00 in Delhi should not read as the previous day for
   * a viewer we happen not to have a zone for.
   */
  private shapeCard(p: PropRow, tz: string = DEFAULT_TIMEZONE) {
    const photos = parse<{ url: string; caption?: string }[]>(p.photosJson, []);
    return {
      id: p.id, listingType: p.listingType, propertyType: p.propertyType, status: p.status,
      title: p.title, city: p.city, locality: p.locality, priceInr: p.priceInr, areaSqft: p.areaSqft,
      bedrooms: p.bedrooms, bathrooms: p.bathrooms, furnishing: p.furnishing, facing: p.facing,
      coverPhoto: photos[0]?.url ?? null, photoCount: photos.length,
      pricePerSqft: p.areaSqft ? Math.round(p.priceInr / p.areaSqft) : 0,
      verified: { rera: Boolean(p.reraId), photo: photos.length > 0, listedBy: p.sellerId ? 'owner' : 'platform' },
      projectName: p.projectName, developer: p.developer, possessionDate: p.possessionDate, progressPct: p.progressPct,
      postedByYou: false, createdOn: this.clock.dayIn(tz, p.createdAt),
      moderation: p.moderation ?? 'approved',
      moderationReasons: parse<ModerationResult | null>(p.moderationJson ?? null, null)?.reasons ?? [],
    };
  }

  private neighbourhoodFor(p: PropRow) {
    return parse<{ label: string; kind: string; distanceKm: number }[]>((p as { neighbourhoodJson?: string | null }).neighbourhoodJson ?? null, []);
  }

  private async insightFor(p: PropRow) {
    // unbounded: the market average — truncation fabricates a different price per sqft
    const peers = await this.prisma.property.findMany({ where: { listingType: p.listingType, city: p.city } }) as PropRow[];
    const valid = peers.filter((x) => x.areaSqft > 0);
    const pps = p.areaSqft ? Math.round(p.priceInr / p.areaSqft) : 0;
    const avg = valid.length ? Math.round(valid.reduce((s, x) => s + x.priceInr / x.areaSqft, 0) / valid.length) : pps;
    return { pricePerSqft: pps, areaAvgPerSqft: avg, deltaPct: avg ? Math.round(((pps - avg) / avg) * 100) : 0, sampleSize: valid.length };
  }

  private async shapeDetail(p: PropRow, userId?: string, tz: string = DEFAULT_TIMEZONE) {
    const amenities = (p.amenities ? p.amenities.split(',').filter(Boolean) : []).map((k) => ({ key: k, label: AMENITY_LABEL[k] ?? k }));
    const neighbourhood = this.neighbourhoodFor(p);
    return {
      ...this.shapeCard(p, tz),
      postedByYou: Boolean(userId && p.sellerId === userId),
      photos: parse<{ url: string; caption?: string }[]>(p.photosJson, []),
      floor: p.floor, totalFloors: p.totalFloors, description: p.description, amenities,
      reraId: p.reraId,
      floorPlans: parse<{ label: string; url: string }[]>(p.floorPlansJson, []),
      milestones: parse<{ label: string; pct: number; note?: string }[]>(p.milestonesJson, []),
      insight: await this.insightFor(p),
      neighbourhood,
      livabilityScore: livabilityScore(p.amenities, neighbourhood),
      livabilityBasis: livabilityBasis(p.amenities, neighbourhood),
    };
  }

  async listings(query: ListingQueryDto, userId?: string) {
    // Only approved listings are searchable in Explore.
    // unbounded: filters run in memory below — a cap would silently hide matching listings; query-side filters + pagination is the named follow-up
    const rows = await this.prisma.property.findMany({ where: { status: 'ready', moderation: 'approved' }, orderBy: { createdAt: 'desc' } }) as PropRow[];
    const filtered = rows.filter((p) =>
      (!query.city || p.city.toLowerCase() === query.city.toLowerCase()) &&
      (!query.propertyType || p.propertyType === query.propertyType) &&
      (!query.listingType || p.listingType === query.listingType) &&
      (query.minBedrooms == null || p.bedrooms >= query.minBedrooms) &&
      (query.maxPriceInr == null || p.priceInr <= query.maxPriceInr),
    );
    const tz = userId ? await this.clock.timezoneFor(userId) : DEFAULT_TIMEZONE;
    return filtered.map((p) => ({ ...this.shapeCard(p, tz), postedByYou: Boolean(userId && p.sellerId === userId) }));
  }

  async underConstruction(userId?: string) {
    // unbounded: filters run in memory below — same follow-up as listings()
    const rows = await this.prisma.property.findMany({ where: { status: 'under_construction', moderation: 'approved' }, orderBy: { createdAt: 'desc' } }) as PropRow[];
    const tz = userId ? await this.clock.timezoneFor(userId) : DEFAULT_TIMEZONE;
    return Promise.all(rows.map(async (p) => {
      const d = await this.shapeDetail(p, userId, tz);
      return { ...d, floorPlanCount: d.floorPlans.length };
    }));
  }

  async detail(id: string, userId?: string) {
    const p = await this.prisma.property.findUnique({ where: { id } }) as PropRow | null;
    if (!p) throw new NotFoundException('property not found');
    // The list routes both require `moderation: 'approved'`; this one required
    // nothing, so a pending, rejected or removed listing was readable by any
    // citizen who knew its id — including the private rejection reasons that
    // shapeCard emits. Owners still see their own listing in every state, which
    // is what the "preview your pending listing" case actually needs.
    // `?? 'approved'` matches shapeCard's default, so pre-moderation rows keep
    // behaving exactly as they do everywhere else.
    const own = Boolean(userId && p.sellerId === userId);
    if (!own && (p.moderation ?? 'approved') !== 'approved') {
      throw new NotFoundException('property not found');
    }
    return this.shapeDetail(p, userId, userId ? await this.clock.timezoneFor(userId) : DEFAULT_TIMEZONE);
  }

  async myListings(userId: string) {
    // unbounded: their own listings — citizen-scale
    const rows = await this.prisma.property.findMany({ where: { sellerId: userId }, orderBy: { createdAt: 'desc' } }) as PropRow[];
    const tz = await this.clock.timezoneFor(userId);
    return rows.map((p) => ({ ...this.shapeCard(p, tz), postedByYou: true }));
  }

  /**
   * Connect with the seller — the Real Estate version of the Dating hub's
   * "Connect to Chat". Opens (or reuses) the DIRECT conversation between the
   * enquirer and the seller and drops the listing in as a rich card, so the
   * chat starts from the property rather than from a blank screen.
   *
   * The conversation is authorised by the enquiry itself, not by a prior
   * connection: trust level 2 on the conversation is what lets two strangers
   * talk (the same mechanism dating matches use), while staying ≥2 keeps the
   * chat under real names and in the main Chats list — an enquiry is not
   * anonymous, and it must not leak into the Dating hub.
   *
   * Free, unlike dating: an enquiry IS the marketplace working; charging for
   * it would price the funnel's one conversion step.
   */
  async enquire(userId: string, id: string, message?: string) {
    const p = await this.prisma.property.findUnique({ where: { id } }) as PropRow | null;
    // Same visibility rule as detail(): a non-approved listing does not exist
    // for anyone but its seller — and the seller has nobody to enquire to.
    if (!p || (p.moderation ?? 'approved') !== 'approved') throw new NotFoundException('property not found');
    if (!p.sellerId) throw new BadRequestException('This is a platform listing — there is no seller to chat with.');
    if (p.sellerId === userId) throw new BadRequestException('This is your own listing.');

    const conversationId = await this.conversations.getOrCreateDirectByIds(userId, p.sellerId, 'city', 2);

    // Send the listing card once per enquirer per listing — pressing Connect
    // twice must not paste the same card into the chat again.
    const deepLink = `/realestate/property/${p.id}`;
    const already = await this.prisma.message.findFirst({
      where: { conversationId, senderId: userId, shareJson: { contains: deepLink } },
      select: { id: true },
    }).catch(swallowed('realestate.enquire.already', null));

    if (!already) {
      const photos = parse<{ url: string }[]>(p.photosJson, []);
      await this.messages.send(userId, {
        conversationId,
        messageType: 'TEXT',
        body: (message ?? '').trim() || `Hi — I'm interested in "${p.title}" (${p.locality}, ${p.city}).`,
        share: {
          kind: 'property', hub: 'Real Estate',
          title: p.title, subtitle: `${p.locality}, ${p.city}`,
          image: photos[0]?.url ?? null, priceInr: p.priceInr, deepLink,
          meta: [p.propertyType, `${p.areaSqft} sqft`, p.listingType === 'rent' ? 'For rent' : 'For sale'],
        },
      });
      void this.notifications.create({
        userId: p.sellerId, actorId: userId, kind: 'realestate_enquiry', entityId: p.id,
        title: 'New enquiry on your listing 🏠',
        body: `Someone is interested in “${p.title}” — reply in Chats.`,
        href: `/chats?c=${conversationId}`,
      });
    } else if ((message ?? '').trim()) {
      // A repeat Connect with a fresh message is a message, not a new card.
      await this.messages.send(userId, { conversationId, messageType: 'TEXT', body: (message as string).trim() });
    }

    return { conversationId, alreadyOpen: Boolean(already) };
  }

  /**
   * ── THE CAPTION WAS MODERATED AND THE PICTURE WAS NOT (this audit) ─────────
   *
   * `moderation.ts` touches `photos` for exactly one thing — `p.caption`, fed
   * into the contact-details regexes. So a listing's captions were checked for
   * phone numbers while the photographs went to public Explore having passed
   * through nothing at all, on the one hub any citizen can browse without
   * knowing the seller. Dating photos get fail-closed Rekognition, posts get
   * PostMediaGuard, chat images get ChatMediaGuard; this had the same reach as
   * a post and none of the screening.
   *
   * The same guard, and its inline entry point, because a listing photograph is
   * a `data:` URL in a column rather than an object in a bucket — see
   * `screenInlineImage`. First refusal wins and the listing is refused whole: a
   * listing is all-or-nothing, so there is nothing to learn from screening the
   * other nine photographs of one that is already refused.
   *
   * A photo whose `url` is not a readable `data:` image is refused too, and
   * that is deliberate rather than incidental: the Sell UI produces data URLs,
   * and anything else in that field is a remote picture nobody here has seen.
   */
  private async screenPhotos(userId: string, photos: ReadonlyArray<{ url: string }>): Promise<void> {
    if (!photos.length) return;
    const consequence = 'so the listing hasn’t been saved';
    if (!this.screening) {
      throw new ServiceUnavailableException(`We couldn’t check that photo just now, ${consequence}. Try again in a moment.`);
    }
    for (const photo of photos) {
      const out = await this.screening.screenInlineImage(userId, photo.url, consequence);
      if (out.ok) continue;
      throw out.retryable ? new ServiceUnavailableException(out.reason) : new BadRequestException(out.reason);
    }
  }

  async post(userId: string, dto: PostPropertyDto) {
    // Photos are optional for now — no minimum enforced here or in moderation.
    // Rate-limit listing creation (anti-spam).
    const hourAgo = new Date(Date.now() - 3600_000);
    const recent = await this.prisma.property.count({ where: { sellerId: userId, createdAt: { gt: hourAgo } } });
    if (recent >= MAX_LISTINGS_PER_HOUR) {
      throw new BadRequestException('You’ve created several listings in a short time — please try again later.');
    }
    // Before the row exists, so an unscreened photograph is never written down.
    await this.screenPhotos(userId, dto.photos);

    // 1) Create in Pending Review — never live immediately.
    const p = await this.prisma.property.create({
      data: {
        sellerId: userId, listingType: dto.listingType, propertyType: dto.propertyType, status: dto.status,
        moderation: 'pending',
        title: dto.title, city: dto.city, locality: dto.locality, priceInr: dto.priceInr, areaSqft: dto.areaSqft,
        bedrooms: dto.bedrooms, bathrooms: dto.bathrooms, furnishing: dto.furnishing ?? null,
        floor: dto.floor ?? null, totalFloors: dto.totalFloors ?? null, facing: dto.facing ?? null,
        amenities: dto.amenities.join(','), description: dto.description ?? null,
        photosJson: JSON.stringify(dto.photos),
        projectName: dto.projectName ?? null, developer: dto.developer ?? null, reraId: dto.reraId ?? null,
        possessionDate: dto.possessionDate ?? null, progressPct: dto.progressPct ?? null,
        floorPlansJson: dto.floorPlans ? JSON.stringify(dto.floorPlans) : null,
        milestonesJson: dto.milestones ? JSON.stringify(dto.milestones) : null,
      },
    }) as PropRow;

    // 2) Run the moderation pipeline and record the outcome.
    const result = await this.moderate(userId, p, dto);
    await this.prisma.property.update({
      where: { id: p.id },
      data: { moderation: result.decision, moderationJson: JSON.stringify(result) },
    });
    await this.logModeration(p.id, 'system', result.decision, result.reasons.join(' · '));

    const detail = await this.shapeDetail({ ...p, moderation: result.decision, moderationJson: JSON.stringify(result) }, userId);
    return { ...detail, moderation: result.decision, moderationResult: result, notice: this.noticeFor(result) };
  }

  /** The listing, if and only if it is this citizen's. 404 otherwise — a
   *  non-owner must not be able to tell somebody else's id from a typo. */
  private async assertOwn(id: string, userId: string): Promise<PropRow> {
    const p = await this.prisma.property.findUnique({ where: { id } }) as PropRow | null;
    if (!p || p.sellerId !== userId) throw new NotFoundException('property not found');
    return p;
  }

  /**
   * Edit a listing (owner only). The edited content goes back through the
   * same moderation pipeline as a new listing — an edit is a new claim to the
   * marketplace, and "approved" describes the words that were approved, not
   * the row. A clean edit is live again immediately; a dirty one reads its
   * reasons in My Listings exactly like a fresh submission.
   *
   * This is also how a closed listing comes back: edit and save relists it
   * (through moderation), so "closed" is never a dead end.
   */
  async update(userId: string, id: string, dto: PostPropertyDto) {
    await this.assertOwn(id, userId);
    // An edit is a new claim to the marketplace, and that includes its pictures:
    // screening only on create would make `update` the way round this guard.
    await this.screenPhotos(userId, dto.photos);
    const p = await this.prisma.property.update({
      where: { id },
      data: {
        listingType: dto.listingType, propertyType: dto.propertyType, status: dto.status,
        title: dto.title, city: dto.city, locality: dto.locality, priceInr: dto.priceInr, areaSqft: dto.areaSqft,
        bedrooms: dto.bedrooms, bathrooms: dto.bathrooms, furnishing: dto.furnishing ?? null,
        floor: dto.floor ?? null, totalFloors: dto.totalFloors ?? null, facing: dto.facing ?? null,
        amenities: dto.amenities.join(','), description: dto.description ?? null,
        photosJson: JSON.stringify(dto.photos),
        projectName: dto.projectName ?? null, developer: dto.developer ?? null, reraId: dto.reraId ?? null,
        possessionDate: dto.possessionDate ?? null, progressPct: dto.progressPct ?? null,
        floorPlansJson: dto.floorPlans ? JSON.stringify(dto.floorPlans) : null,
        milestonesJson: dto.milestones ? JSON.stringify(dto.milestones) : null,
      },
    }) as PropRow;

    const result = await this.moderate(userId, p, dto);
    await this.prisma.property.update({
      where: { id },
      data: { moderation: result.decision, moderationJson: JSON.stringify(result) },
    });
    await this.logModeration(id, 'system', result.decision, `edit: ${result.reasons.join(' · ')}`);

    const detail = await this.shapeDetail({ ...p, moderation: result.decision, moderationJson: JSON.stringify(result) }, userId);
    return { ...detail, moderation: result.decision, moderationResult: result, notice: this.noticeFor(result) };
  }

  /**
   * Close a listing (owner only): sold, rented, or simply no longer offered.
   * The row stays — it is the seller's history and the moderation log's
   * anchor — but `moderation: 'removed'` takes it out of Explore and detail
   * for everyone but the seller (detail() already treats non-approved as
   * not-found for strangers). Editing it later relists it through moderation.
   */
  async close(userId: string, id: string) {
    const p = await this.assertOwn(id, userId);
    const prev = parse<ModerationResult | null>(p.moderationJson ?? null, null);
    const next: ModerationResult = {
      decision: 'removed',
      confidence: 1, score: prev?.score ?? 0, checks: prev?.checks ?? [],
      reasons: ['Closed by you. Edit & save to relist it.'], decidedAt: new Date().toISOString(),
    };
    await this.prisma.property.update({ where: { id }, data: { moderation: 'removed', moderationJson: JSON.stringify(next) } });
    await this.logModeration(id, userId, 'removed', 'closed by seller');
    return { id, moderation: 'removed' as const };
  }

  private noticeFor(r: ModerationResult): string {
    if (r.decision === 'approved') return 'Your property is now live in Explore Properties.';
    if (r.decision === 'review') return 'Thanks — your listing is in manual review. We’ll notify you shortly.';
    return `Your listing wasn’t published: ${r.reasons.join(' ')} Edit and resubmit when ready.`;
  }

  /** Full moderation pipeline: deterministic rules + duplicate/pricing/fraud
   *  signals + an optional AI text pass (graceful fallback when AI is off). */
  private async moderate(userId: string, p: PropRow, dto: PostPropertyDto): Promise<ModerationResult> {
    const input: ListingInput = {
      title: dto.title, description: dto.description ?? '', city: dto.city, locality: dto.locality,
      propertyType: dto.propertyType, listingType: dto.listingType, priceInr: dto.priceInr, areaSqft: dto.areaSqft,
      bedrooms: dto.bedrooms, bathrooms: dto.bathrooms, furnishing: dto.furnishing ?? null, photos: dto.photos,
    };

    const [duplicateOf, peerMedianPerSqft, fraudScore] = await Promise.all([
      this.findDuplicate(userId, p.id, dto),
      this.peerMedianPerSqft(dto),
      this.fraudScore(userId),
    ]);

    const { checks, risk } = ruleChecks(input, { duplicateOf, peerMedianPerSqft, fraudScore });
    const ai = await this.aiTextModeration(dto);
    const result = decide(checks, risk, ai ?? undefined);
    result.decidedAt = new Date().toISOString();
    return result;
  }

  /** AI description check. Returns null when AI is off (rules still apply). */
  private async aiTextModeration(dto: PostPropertyDto): Promise<{ flagged: boolean; confidence: number; reason?: string } | null> {
    const text = `${dto.title}\n${dto.description ?? ''}`.trim();
    if (text.length < 20) return null;
    const out = await this.ai.json<{ flagged: boolean; confidence: number; reason: string }>(
      'You moderate real-estate listing text. Flag spam, scams, fraud, hate/offensive language, off-platform contact details, or clearly fake/unrealistic claims. ' +
        'Respond as JSON {"flagged": boolean, "confidence": 0..1, "reason": short string}.',
      `Listing title + description:\n"""${text.slice(0, 1500)}"""`,
      null as unknown as { flagged: boolean; confidence: number; reason: string },
      300,
    );
    if (!out || typeof out.flagged !== 'boolean') return null;
    return { flagged: out.flagged, confidence: typeof out.confidence === 'number' ? Math.max(0, Math.min(1, out.confidence)) : 0.5, reason: out.reason };
  }

  private async findDuplicate(userId: string, selfId: string, dto: PostPropertyDto): Promise<string | null> {
    const target = normalizeDesc(`${dto.title} ${dto.description ?? ''}`);
    if (target.length < 12) return null;
    const peers = await this.prisma.property.findMany({
      where: { OR: [{ sellerId: userId }, { city: dto.city, propertyType: dto.propertyType }], NOT: { id: selfId } },
      take: 200,
    }) as PropRow[];
    for (const q of peers) {
      const other = normalizeDesc(`${q.title} ${q.description ?? ''}`);
      if (!other) continue;
      if (other === target) return q.id;
      // token overlap
      const a = new Set(target.split(' ')), b = new Set(other.split(' '));
      const inter = [...a].filter((w) => b.has(w)).length;
      const jaccard = inter / (a.size + b.size - inter || 1);
      if (jaccard > 0.85) return q.id;
    }
    return null;
  }

  private async peerMedianPerSqft(dto: PostPropertyDto): Promise<number | null> {
    const peers = await this.prisma.property.findMany({
      where: { city: dto.city, propertyType: dto.propertyType, listingType: dto.listingType, moderation: 'approved' },
      take: 200,
    }) as PropRow[];
    const vals = peers.filter((x) => x.areaSqft > 0).map((x) => x.priceInr / x.areaSqft).sort((a, b) => a - b);
    if (vals.length < 4) return null;
    return vals[Math.floor(vals.length / 2)];
  }

  /** Simple account-based fraud score (0..100). Deeper signals — IP, device
   *  fingerprint, VPN — need infra not present here (see moderation TODO). */
  private async fraudScore(userId: string): Promise<number> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { createdAt: true } });
    const total = await this.prisma.property.count({ where: { sellerId: userId } });
    const dayAgo = new Date(Date.now() - 86_400_000);
    const lastDay = await this.prisma.property.count({ where: { sellerId: userId, createdAt: { gt: dayAgo } } });
    const rejected = await this.prisma.property.count({ where: { sellerId: userId, moderation: 'rejected' } });
    let score = 0;
    const accountAgeH = user ? (Date.now() - new Date(user.createdAt).getTime()) / 3600_000 : 0;
    if (accountAgeH < 24 && total >= 3) score += 30;          // brand-new account, many listings
    if (lastDay >= 5) score += 25;                             // rapid repeated posting
    score += Math.min(30, rejected * 10);                     // repeated policy violations
    return Math.min(100, score);
  }

  private async logModeration(listingId: string, actor: string, decision: string, reason: string) {
    await (this.prisma as unknown as { moderationLog: { create(a: unknown): Promise<unknown> } }).moderationLog
      .create({ data: { listingId, actor, decision, reason: reason.slice(0, 500) } })
      .catch(swallowed('realestate.logModeration', undefined));
  }

  // ─────────────── admin moderation ───────────────
  /**
   * ── ONE PERMISSION SYSTEM, AND REAL ESTATE WAS NOT IN IT (this audit) ──────
   *
   * `social.service.ts` records the day the city moved to one moderator
   * system — "Both are the AdminGrant/permission system now" — and dating went
   * with it. Real estate was left on `AdminService.assertAdmin`, which reads
   * `User.role === 'admin'` seeded from MODERATION_ADMINS. Two consequences,
   * pointing in opposite directions and both bad: a console `moderator`, whose
   * whole role is `moderation.read` + `moderation.act`, was 403'd out of the
   * listing queue; and anybody in MODERATION_ADMINS could approve or reject
   * listings without holding `moderation.act` at all — including roles the
   * permission table deliberately withholds it from.
   *
   * `userId` is optional on these two methods for historical reasons; the
   * controller always has one. An absent caller is refused here rather than
   * handed to `assert`, which would query the grants table for `undefined`.
   */
  private async assertModerator(userId: string | undefined, need: 'moderation.read' | 'moderation.act'): Promise<string> {
    if (!userId) throw new ForbiddenException(`This needs the "${need}" permission, which none of your roles carries.`);
    await this.access.assert(userId, need);
    return userId;
  }

  async moderationQueue(userId?: string) {
    await this.assertModerator(userId, 'moderation.read');
    const rows = await this.prisma.property.findMany({
      where: { moderation: { in: ['pending', 'review'] } },
      orderBy: { createdAt: 'desc' }, take: 100,
    }) as PropRow[];
    return rows.map((p) => ({
      ...this.shapeCard(p),
      moderation: p.moderation ?? 'review',
      result: parse<ModerationResult | null>(p.moderationJson ?? null, null),
    }));
  }

  /**
   * A listing decision, through the console rather than beside it.
   *
   * THE PERMISSION FIRST, THEN THE ROW — the same shape `moderateDecision` and
   * `decideAppeal` were moved to: the 404 must not speak before `assert` has.
   *
   * AND IT WRITES AN AdminAudit ROW. It wrote a `moderationLog` row and nothing
   * else, through a helper whose failure is swallowed — so approving or
   * rejecting a listing was invisible in `GET /admin/audit`, and on a bad day
   * invisible everywhere. `moderation.act` is in MUST_AUDIT; `act` records
   * BEFORE the write and refuses an empty reason, which is the console-wide
   * rule this route accepted `reason: ''` against. The moderationLog write
   * stays: it is the seller-facing history on the listing, and it is a
   * different record for a different reader.
   */
  async moderationDecide(userId: string | undefined, id: string, decision: 'approved' | 'rejected', reason: string) {
    const actorId = await this.assertModerator(userId, 'moderation.act');
    const p = await this.prisma.property.findUnique({ where: { id } }) as PropRow | null;
    if (!p) throw new NotFoundException('listing not found');
    const prev = parse<ModerationResult | null>(p.moderationJson ?? null, null);
    const next: ModerationResult = {
      decision, confidence: 1, score: prev?.score ?? 0, checks: prev?.checks ?? [],
      reasons: reason ? [reason] : (decision === 'rejected' ? (prev?.reasons ?? []) : []), decidedAt: new Date().toISOString(),
    };
    await this.access.act({
      actorId, need: 'moderation.act', action: `realestate.listing.${decision}`,
      entity: 'property', entityId: id, reason,
      before: { moderation: p.moderation ?? null }, after: { moderation: decision },
    }, async () => {
      await this.prisma.property.update({ where: { id }, data: { moderation: decision, moderationJson: JSON.stringify(next) } });
      await this.logModeration(id, actorId, decision, reason);
    });
    return { id, moderation: decision };
  }

}
