import { BadRequestException, ForbiddenException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { AMENITY_LABEL, NEIGHBOURHOODS, livabilityScore, seedPhoto } from './realestate.constants';
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

const ADMIN_HANDLES = (process.env.MODERATION_ADMINS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
const MAX_LISTINGS_PER_HOUR = 8;

const parse = <T>(json: string | null, fallback: T): T => { try { return json ? JSON.parse(json) as T : fallback; } catch { return fallback; } };

@Injectable()
export class RealEstateService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService, private readonly ai: AiService) {}

  async onModuleInit(): Promise<void> {
    await this.ensureSeeds();
  }

  private shapeCard(p: PropRow) {
    const photos = parse<{ url: string; caption?: string }[]>(p.photosJson, []);
    return {
      id: p.id, listingType: p.listingType, propertyType: p.propertyType, status: p.status,
      title: p.title, city: p.city, locality: p.locality, priceInr: p.priceInr, areaSqft: p.areaSqft,
      bedrooms: p.bedrooms, bathrooms: p.bathrooms, furnishing: p.furnishing, facing: p.facing,
      coverPhoto: photos[0]?.url ?? null, photoCount: photos.length,
      pricePerSqft: p.areaSqft ? Math.round(p.priceInr / p.areaSqft) : 0,
      verified: { rera: Boolean(p.reraId), photo: photos.length > 0, listedBy: p.sellerId ? 'owner' : 'platform' },
      projectName: p.projectName, developer: p.developer, possessionDate: p.possessionDate, progressPct: p.progressPct,
      postedByYou: false, createdOn: p.createdAt.toISOString().slice(0, 10),
      moderation: p.moderation ?? 'approved',
      moderationReasons: parse<ModerationResult | null>(p.moderationJson ?? null, null)?.reasons ?? [],
    };
  }

  private neighbourhoodFor(p: PropRow) {
    return parse<{ label: string; kind: string; distanceKm: number }[]>((p as { neighbourhoodJson?: string | null }).neighbourhoodJson ?? null, NEIGHBOURHOODS[p.id] ?? []);
  }

  private async insightFor(p: PropRow) {
    const peers = await this.prisma.property.findMany({ where: { listingType: p.listingType, city: p.city } }) as PropRow[];
    const valid = peers.filter((x) => x.areaSqft > 0);
    const pps = p.areaSqft ? Math.round(p.priceInr / p.areaSqft) : 0;
    const avg = valid.length ? Math.round(valid.reduce((s, x) => s + x.priceInr / x.areaSqft, 0) / valid.length) : pps;
    return { pricePerSqft: pps, areaAvgPerSqft: avg, deltaPct: avg ? Math.round(((pps - avg) / avg) * 100) : 0, sampleSize: valid.length };
  }

  private async shapeDetail(p: PropRow, userId?: string) {
    const amenities = (p.amenities ? p.amenities.split(',').filter(Boolean) : []).map((k) => ({ key: k, label: AMENITY_LABEL[k] ?? k }));
    const neighbourhood = this.neighbourhoodFor(p);
    return {
      ...this.shapeCard(p),
      postedByYou: Boolean(userId && p.sellerId === userId),
      photos: parse<{ url: string; caption?: string }[]>(p.photosJson, []),
      floor: p.floor, totalFloors: p.totalFloors, description: p.description, amenities,
      reraId: p.reraId,
      floorPlans: parse<{ label: string; url: string }[]>(p.floorPlansJson, []),
      milestones: parse<{ label: string; pct: number; note?: string }[]>(p.milestonesJson, []),
      insight: await this.insightFor(p),
      neighbourhood,
      livabilityScore: livabilityScore(p.amenities, neighbourhood),
    };
  }

  async listings(query: ListingQueryDto, userId?: string) {
    // Only approved listings are searchable in Explore.
    const rows = await this.prisma.property.findMany({ where: { status: 'ready', moderation: 'approved' } as never, orderBy: { createdAt: 'desc' } }) as PropRow[];
    const filtered = rows.filter((p) =>
      (!query.city || p.city.toLowerCase() === query.city.toLowerCase()) &&
      (!query.propertyType || p.propertyType === query.propertyType) &&
      (!query.listingType || p.listingType === query.listingType) &&
      (query.minBedrooms == null || p.bedrooms >= query.minBedrooms) &&
      (query.maxPriceInr == null || p.priceInr <= query.maxPriceInr),
    );
    return filtered.map((p) => ({ ...this.shapeCard(p), postedByYou: Boolean(userId && p.sellerId === userId) }));
  }

  async underConstruction(userId?: string) {
    const rows = await this.prisma.property.findMany({ where: { status: 'under_construction', moderation: 'approved' } as never, orderBy: { createdAt: 'desc' } }) as PropRow[];
    return Promise.all(rows.map(async (p) => {
      const d = await this.shapeDetail(p, userId);
      return { ...d, floorPlanCount: d.floorPlans.length };
    }));
  }

  async detail(id: string, userId?: string) {
    const p = await this.prisma.property.findUnique({ where: { id } }) as PropRow | null;
    if (!p) throw new NotFoundException('property not found');
    return this.shapeDetail(p, userId);
  }

  async myListings(userId: string) {
    const rows = await this.prisma.property.findMany({ where: { sellerId: userId }, orderBy: { createdAt: 'desc' } }) as PropRow[];
    return rows.map((p) => ({ ...this.shapeCard(p), postedByYou: true }));
  }

  async post(userId: string, dto: PostPropertyDto) {
    if (!dto.photos || dto.photos.length === 0) {
      throw new BadRequestException('At least one photo is required to post a property.');
    }
    // Rate-limit listing creation (anti-spam).
    const hourAgo = new Date(Date.now() - 3600_000);
    const recent = await this.prisma.property.count({ where: { sellerId: userId, createdAt: { gt: hourAgo } } });
    if (recent >= MAX_LISTINGS_PER_HOUR) {
      throw new BadRequestException('You’ve created several listings in a short time — please try again later.');
    }

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
      } as never,
    }) as PropRow;

    // 2) Run the moderation pipeline and record the outcome.
    const result = await this.moderate(userId, p, dto);
    await this.prisma.property.update({
      where: { id: p.id },
      data: { moderation: result.decision, moderationJson: JSON.stringify(result) } as never,
    });
    await this.logModeration(p.id, 'system', result.decision, result.reasons.join(' · '));

    const detail = await this.shapeDetail({ ...p, moderation: result.decision, moderationJson: JSON.stringify(result) }, userId);
    return { ...detail, moderation: result.decision, moderationResult: result, notice: this.noticeFor(result) };
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
      where: { city: dto.city, propertyType: dto.propertyType, listingType: dto.listingType, moderation: 'approved' } as never,
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
    const rejected = await this.prisma.property.count({ where: { sellerId: userId, moderation: 'rejected' } as never });
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
      .catch(() => undefined);
  }

  // ─────────────── admin moderation ───────────────
  private assertAdmin(handle?: string) {
    if (!handle || !ADMIN_HANDLES.includes(handle.toLowerCase())) {
      throw new ForbiddenException('Moderator access required.');
    }
  }

  async moderationQueue(handle?: string) {
    this.assertAdmin(handle);
    const rows = await this.prisma.property.findMany({
      where: { moderation: { in: ['pending', 'review'] } } as never,
      orderBy: { createdAt: 'desc' }, take: 100,
    }) as PropRow[];
    return rows.map((p) => ({
      ...this.shapeCard(p),
      moderation: p.moderation ?? 'review',
      result: parse<ModerationResult | null>(p.moderationJson ?? null, null),
    }));
  }

  async moderationDecide(handle: string | undefined, id: string, decision: 'approved' | 'rejected', reason: string) {
    this.assertAdmin(handle);
    const p = await this.prisma.property.findUnique({ where: { id } }) as PropRow | null;
    if (!p) throw new NotFoundException('listing not found');
    const prev = parse<ModerationResult | null>(p.moderationJson ?? null, null);
    const next: ModerationResult = {
      decision, confidence: 1, score: prev?.score ?? 0, checks: prev?.checks ?? [],
      reasons: reason ? [reason] : (decision === 'rejected' ? (prev?.reasons ?? []) : []), decidedAt: new Date().toISOString(),
    };
    await this.prisma.property.update({ where: { id }, data: { moderation: decision, moderationJson: JSON.stringify(next) } as never });
    await this.logModeration(id, handle ?? 'moderator', decision, reason);
    return { id, moderation: decision };
  }

  private async ensureSeeds(): Promise<void> {
    try {
      if ((await this.prisma.property.count()) > 0) return;
    } catch { return; }
    const seeds = [
      {
        id: 're_ready_1', status: 'ready', listingType: 'sale', propertyType: 'apartment',
        title: '3 BHK in a gated community', city: 'Bengaluru', locality: 'Whitefield', priceInr: 12_500_000, areaSqft: 1650,
        bedrooms: 3, bathrooms: 3, furnishing: 'semi', floor: 8, totalFloors: 18, facing: 'east',
        amenities: 'lift,parking,power-backup,security,gym,pool,clubhouse', description: 'Bright east-facing 3 BHK with a large balcony overlooking the park.',
        photos: [{ url: seedPhoto('3 BHK · Whitefield', 205 as number) }, { url: seedPhoto('Living room', 190) }, { url: seedPhoto('Balcony view', 150) }],
      },
      {
        id: 're_ready_2', status: 'ready', listingType: 'rent', propertyType: 'apartment',
        title: '2 BHK for rent, fully furnished', city: 'Mumbai', locality: 'Powai', priceInr: 62_000, areaSqft: 980,
        bedrooms: 2, bathrooms: 2, furnishing: 'furnished', floor: 12, totalFloors: 24, facing: 'west',
        amenities: 'lift,parking,security,gym,cctv', description: 'Move-in ready, lake-facing, walking distance to the tech park.',
        photos: [{ url: seedPhoto('2 BHK · Powai', 260) }, { url: seedPhoto('Bedroom', 280) }],
      },
      {
        id: 're_ready_3', status: 'ready', listingType: 'sale', propertyType: 'villa',
        title: '4 BHK independent villa', city: 'Hyderabad', locality: 'Gachibowli', priceInr: 34_000_000, areaSqft: 3200,
        bedrooms: 4, bathrooms: 5, furnishing: 'unfurnished', floor: 0, totalFloors: 2, facing: 'north-east',
        amenities: 'parking,power-backup,security,park,water-supply', description: 'Spacious corner villa with a private garden and 3-car parking.',
        photos: [{ url: seedPhoto('Villa · Gachibowli', 95) }, { url: seedPhoto('Garden', 120) }],
      },
      {
        id: 're_uc_1', status: 'under_construction', listingType: 'sale', propertyType: 'apartment',
        title: 'Skyline Residences — 3 BHK', city: 'Bengaluru', locality: 'Hebbal', priceInr: 15_800_000, areaSqft: 1780,
        bedrooms: 3, bathrooms: 3, furnishing: 'unfurnished', floor: 14, totalFloors: 30, facing: 'north',
        amenities: 'lift,parking,power-backup,security,gym,pool,clubhouse,kids-play',
        description: 'A 30-storey tower with sky-deck amenities; premium 3 BHK homes.',
        projectName: 'Skyline Residences', developer: 'Aurora Estates', reraId: 'PRM/KA/RERA/1251/446/PR/2025',
        possessionDate: 'Dec 2026', progressPct: 45,
        floorPlans: [{ label: '3 BHK — 1780 sqft', url: seedPhoto('Floor plan · 3 BHK', 40) }, { label: 'Podium level', url: seedPhoto('Podium plan', 20) }],
        milestones: [
          { label: 'Excavation & foundation', pct: 100, note: 'Completed' },
          { label: 'Structure (up to 14th floor)', pct: 60, note: 'In progress' },
          { label: 'MEP & finishing', pct: 10, note: 'Started on lower floors' },
          { label: 'Handover', pct: 0, note: 'Expected Dec 2026' },
        ],
        photos: [{ url: seedPhoto('Skyline Residences', 210) }, { url: seedPhoto('Site progress', 30) }],
      },
      {
        id: 're_uc_2', status: 'under_construction', listingType: 'sale', propertyType: 'apartment',
        title: 'Green Meadows — 2 BHK', city: 'Pune', locality: 'Hinjewadi', priceInr: 8_900_000, areaSqft: 1120,
        bedrooms: 2, bathrooms: 2, furnishing: 'unfurnished', floor: 6, totalFloors: 15, facing: 'east',
        amenities: 'lift,parking,security,park,kids-play,gas-pipeline',
        description: 'Eco-friendly township with landscaped gardens; possession next year.',
        projectName: 'Green Meadows', developer: 'Terra Group', reraId: 'P52100049812',
        possessionDate: 'Jun 2026', progressPct: 68,
        floorPlans: [{ label: '2 BHK — 1120 sqft', url: seedPhoto('Floor plan · 2 BHK', 130) }],
        milestones: [
          { label: 'Foundation', pct: 100 }, { label: 'Superstructure', pct: 85 },
          { label: 'Finishing', pct: 30 }, { label: 'Handover', pct: 0, note: 'Expected Jun 2026' },
        ],
        photos: [{ url: seedPhoto('Green Meadows', 140) }],
      },
    ];
    for (const s of seeds) {
      await this.prisma.property.create({
        data: {
          id: s.id, sellerId: null, listingType: s.listingType, propertyType: s.propertyType, status: s.status,
          title: s.title, city: s.city, locality: s.locality, priceInr: s.priceInr, areaSqft: s.areaSqft,
          bedrooms: s.bedrooms, bathrooms: s.bathrooms, furnishing: s.furnishing, floor: s.floor, totalFloors: s.totalFloors, facing: s.facing,
          amenities: s.amenities, description: s.description, photosJson: JSON.stringify(s.photos),
          projectName: s.projectName ?? null, developer: s.developer ?? null, reraId: s.reraId ?? null,
          possessionDate: s.possessionDate ?? null, progressPct: s.progressPct ?? null,
          floorPlansJson: s.floorPlans ? JSON.stringify(s.floorPlans) : null,
          milestonesJson: s.milestones ? JSON.stringify(s.milestones) : null,
        },
      }).catch(() => undefined);
    }
  }
}
