import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import { MedicalService } from '../medical/medical.service';
import { FinancialService } from '../financial/financial.service';
import {
  beautyInsights, recommendProducts, BEAUTY_PRODUCTS, CONCERN_TAGS,
  type BeautyInsight,
} from './beauty-engine';
import type { SaveBeautyProfileDto, PlaceBeautyOrderDto } from './dto/beauty.dto';

const DEFAULT_PROFILE = { skinType: 'normal', hairType: 'straight', concerns: [] as string[] };

@Injectable()
export class BeautyService {
  constructor(
    private readonly prisma: PrismaService,
    // Beauty reads biomarkers only through the Medical Hub's consent gate.
    private readonly medical: MedicalService,
    private readonly financial: FinancialService,
  ) {}

  // ─────────────── skin & hair profile ───────────────
  async getProfile(userId: string) {
    const row = await this.prisma.beautyProfile.findUnique({ where: { userId } });
    if (!row) return { ...DEFAULT_PROFILE, saved: false };
    return {
      skinType: row.skinType, hairType: row.hairType,
      concerns: row.concerns ? row.concerns.split(',').filter(Boolean) : [],
      saved: true,
      concernOptions: Object.entries(CONCERN_TAGS).map(([key, v]) => ({ key, label: v.label })),
    };
  }

  async saveProfile(userId: string, dto: SaveBeautyProfileDto) {
    await this.prisma.beautyProfile.upsert({
      where: { userId },
      update: { skinType: dto.skinType, hairType: dto.hairType, concerns: dto.concerns.join(',') },
      create: { userId, skinType: dto.skinType, hairType: dto.hairType, concerns: dto.concerns.join(',') },
    });
    return this.getProfile(userId);
  }

  // ─────────────── biomarker insights (consent-gated) ───────────────
  /**
   * The cross-hub loop: ask the Medical Hub for the user's biomarkers *for the
   * beauty hub*. If the user has revoked Beauty consent, sharedBiomarkers throws
   * ForbiddenException (403) at the data boundary — we surface that as a clear
   * "access is off" state rather than fabricating insights.
   */
  async insights(userId: string) {
    // Let ForbiddenException propagate → 403 (the consent gate in action).
    const shared = await this.medical.sharedBiomarkers(userId, 'beauty');
    const values = shared.values ?? {};
    const insights = beautyInsights(values);
    return {
      granted: true,
      hasPanel: Boolean(shared.takenOn),
      takenOn: shared.takenOn,
      insights,
      source: 'Read from your Medical Hub with your consent. Turn Beauty off in Medical → Privacy & Consent to revoke.',
      disclaimer: 'Educational skin/hair guidance grounded in established clinical-nutrition science — not a dermatological diagnosis. Persistent changes deserve a clinician.',
    };
  }

  // ─────────────── product market ───────────────
  /**
   * The shelf, ranked for this user. We always personalise by their stated
   * concerns; if Beauty consent is granted and a panel exists, we additionally
   * match products to biomarker-driven insights (marked "From your labs").
   */
  async products(userId: string) {
    const profile = await this.getProfile(userId);
    let insights: BeautyInsight[] = [];
    let usedLabs = false;
    try {
      const shared = await this.medical.sharedBiomarkers(userId, 'beauty');
      insights = beautyInsights(shared.values ?? {});
      usedLabs = insights.length > 0;
    } catch (e) {
      if (!(e instanceof ForbiddenException)) throw e;
      // consent revoked → catalog still personalises by stated concerns only
    }
    const products = recommendProducts(insights, profile.concerns);
    return {
      products,
      personalisedBy: { concerns: profile.concerns, labs: usedLabs },
      matchedCount: products.filter((p) => p.matched).length,
    };
  }

  // ─────────────── orders (the commerce loop) ───────────────
  async placeOrder(userId: string, dto: PlaceBeautyOrderDto) {
    const totalInr = dto.items.reduce((s, i) => s + i.priceInr * i.qty, 0);
    // Unified payment: pay from the one city wallet via the Financial hub.
    await this.financial.charge(userId, { hub: 'Beauty', category: 'beauty', label: 'Beauty market order', amountInr: totalInr, method: dto.method });
    const order = await this.prisma.beautyOrder.create({
      data: { userId, itemsJson: JSON.stringify(dto.items), totalInr, status: 'placed' },
    });
    return this.orders(userId).then((list) => ({ orderId: order.id, orders: list }));
  }

  async orders(userId: string) {
    const rows = await this.prisma.beautyOrder.findMany({
      where: { userId }, orderBy: { createdAt: 'desc' },
    });
    return rows.map((o) => ({
      id: o.id, totalInr: o.totalInr, status: o.status,
      items: safeParse(o.itemsJson),
      createdAt: o.createdAt.toISOString(),
    }));
  }
}

function safeParse(json: string): { id: string; name: string; priceInr: number; qty: number }[] {
  try { return JSON.parse(json); } catch { return []; }
}
