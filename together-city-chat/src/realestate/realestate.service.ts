import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import { AMENITY_LABEL, NEIGHBOURHOODS, livabilityScore, seedPhoto } from './realestate.constants';
import type { PostPropertyDto, ListingQueryDto } from './dto/realestate.dto';

type PropRow = {
  id: string; sellerId: string | null; listingType: string; propertyType: string; status: string;
  title: string; city: string; locality: string; priceInr: number; areaSqft: number;
  bedrooms: number; bathrooms: number; furnishing: string | null; floor: number | null; totalFloors: number | null;
  facing: string | null; amenities: string; description: string | null; photosJson: string;
  projectName: string | null; developer: string | null; reraId: string | null; possessionDate: string | null;
  progressPct: number | null; floorPlansJson: string | null; milestonesJson: string | null; createdAt: Date;
};

const parse = <T>(json: string | null, fallback: T): T => { try { return json ? JSON.parse(json) as T : fallback; } catch { return fallback; } };

@Injectable()
export class RealEstateService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

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
    const rows = await this.prisma.property.findMany({ where: { status: 'ready' }, orderBy: { createdAt: 'desc' } }) as PropRow[];
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
    const rows = await this.prisma.property.findMany({ where: { status: 'under_construction' }, orderBy: { createdAt: 'desc' } }) as PropRow[];
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
    // Belt-and-braces: the DTO already enforces ≥1 photo, but guard again here.
    if (!dto.photos || dto.photos.length === 0) {
      throw new BadRequestException('At least one photo is required to post a property.');
    }
    const p = await this.prisma.property.create({
      data: {
        sellerId: userId, listingType: dto.listingType, propertyType: dto.propertyType, status: dto.status,
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
    return this.shapeDetail(p, userId);
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
