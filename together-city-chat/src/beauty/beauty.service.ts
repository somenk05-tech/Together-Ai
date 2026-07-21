import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import { MedicalService } from '../medical/medical.service';
import { FinancialService } from '../financial/financial.service';
import { AiService } from '../ai/ai.service';
import {
  beautyInsights, recommendProducts, BEAUTY_PRODUCTS, CONCERN_TAGS,
  type BeautyInsight,
} from './beauty-engine';
import { assessBeauty, type BeautyProfileInput } from './beauty-analysis';
import type { PlaceBeautyOrderDto } from './dto/beauty.dto';

const DEFAULT_PROFILE = { skinType: 'normal', hairType: 'straight', concerns: [] as string[] };

/** Beauty profile row incl. the JSON columns the offline Prisma client can't type yet. */
interface BeautyRow {
  skinType: string; hairType: string; concerns: string;
  extras: string | null; photosJson: string; progressJson: string; analysisJson: string | null; analyzedAt: Date | null;
}
export interface ProgressEntry { id: string; date: string; findings: string[]; score: number; thumb: string | null }
const safeJson = <T>(s: string | null | undefined, fb: T): T => { try { return s ? (JSON.parse(s) as T) : fb; } catch { return fb; } };

@Injectable()
export class BeautyService {
  constructor(
    private readonly prisma: PrismaService,
    // Beauty reads biomarkers only through the Medical Hub's consent gate.
    private readonly medical: MedicalService,
    private readonly financial: FinancialService,
    private readonly ai: AiService,
  ) {}

  private get beauty() {
    return (this.prisma as unknown as {
      beautyProfile: {
        findUnique(a: unknown): Promise<BeautyRow | null>;
        upsert(a: unknown): Promise<BeautyRow>;
      };
    }).beautyProfile;
  }

  // ─────────────── skin & hair profile ───────────────
  async getProfile(userId: string) {
    const row = await this.beauty.findUnique({ where: { userId } }).catch(() => null);
    if (!row) return { ...DEFAULT_PROFILE, saved: false, profile: {}, analysis: null, photos: [], analyzedAt: null, aiEnabled: this.ai.enabled };
    return {
      skinType: row.skinType, hairType: row.hairType,
      concerns: row.concerns ? row.concerns.split(',').filter(Boolean) : [],
      saved: true,
      profile: safeJson<Record<string, unknown>>(row.extras, {}),
      analysis: safeJson<unknown>(row.analysisJson, null),
      photos: safeJson<unknown[]>(row.photosJson, []),
      progress: safeJson<ProgressEntry[]>(row.progressJson, []),
      analyzedAt: row.analyzedAt ? row.analyzedAt.toISOString() : null,
      aiEnabled: this.ai.enabled,
      concernOptions: Object.entries(CONCERN_TAGS).map(([key, v]) => ({ key, label: v.label })),
    };
  }

  /** Save the full skin & hair profile and generate the ONE-TIME assessment. */
  async saveProfile(userId: string, dto: Record<string, unknown>) {
    const p = dto as BeautyProfileInput & { skinType?: string; hairType?: string };
    const skinType = String(p.skinType ?? 'normal');
    const hairType = String(p.hairType ?? 'straight');
    const concerns = Array.isArray(p.skinConcerns) ? (p.skinConcerns as string[]) : [];

    // Keep any prior photo findings so re-saving the profile doesn't lose them.
    const existing = await this.beauty.findUnique({ where: { userId } }).catch(() => null);
    const photos = safeJson<{ slot: string; findings: string[] }[]>(existing?.photosJson, []);
    const photoFindings = [...new Set(photos.flatMap((x) => x.findings ?? []))];

    const analysis = assessBeauty(p, photoFindings);
    const now = new Date();
    await this.beauty.upsert({
      where: { userId },
      update: { skinType, hairType, concerns: concerns.join(','), extras: JSON.stringify(dto), analysisJson: JSON.stringify(analysis), analyzedAt: now } as never,
      create: { userId, skinType, hairType, concerns: concerns.join(','), extras: JSON.stringify(dto), photosJson: '[]', analysisJson: JSON.stringify(analysis), analyzedAt: now } as never,
    });
    return this.getProfile(userId);
  }

  /**
   * One-time photo assessment. Runs vision ONCE (AI when configured, else the
   * profile-based assessment stands), stores the findings, and refreshes the
   * saved analysis. No re-analysis happens on later page opens.
   */
  async analyzePhotos(userId: string, photos: { slot: string; base64: string; mediaType?: string }[], thumb?: string) {
    const existing = await this.beauty.findUnique({ where: { userId } }).catch(() => null);
    const profile = safeJson<BeautyProfileInput>(existing?.extras, {});
    const images = photos.filter((p) => p.base64).map((p) => ({ base64: p.base64, mediaType: p.mediaType || 'image/jpeg' }));
    const findings = await this.ai.skinPhotoFindings(images);
    const photoRows = photos.map((p) => ({ slot: p.slot, analyzedAt: new Date().toISOString(), findings }));
    const analysis = assessBeauty(profile, findings);
    const now = new Date();

    // Append a dated progress point (with a small thumbnail) for the timeline.
    const score = Math.max(40, Math.min(100, 100 - findings.length * 8));
    const entry: ProgressEntry = {
      id: (globalThis.crypto?.randomUUID?.() ?? `${now.getTime()}-${Math.round(Math.random() * 1e6)}`),
      date: now.toISOString(), findings, score,
      thumb: typeof thumb === 'string' && thumb.startsWith('data:') && thumb.length < 200_000 ? thumb : null,
    };
    const progress = safeJson<ProgressEntry[]>(existing?.progressJson, []);
    progress.push(entry);
    const trimmed = progress.slice(-12); // keep the last 12 check-ins

    await this.beauty.upsert({
      where: { userId },
      update: { photosJson: JSON.stringify(photoRows), progressJson: JSON.stringify(trimmed), analysisJson: JSON.stringify(analysis), analyzedAt: now } as never,
      create: { userId, skinType: String(profile.skinType ?? 'normal'), hairType: String(profile.hairType ?? 'straight'), concerns: (profile.skinConcerns ?? []).join(','), extras: JSON.stringify(profile), photosJson: JSON.stringify(photoRows), progressJson: JSON.stringify(trimmed), analysisJson: JSON.stringify(analysis), analyzedAt: now } as never,
    });
    return { ...(await this.getProfile(userId)), photoFindings: findings, aiUsed: this.ai.enabled && images.length > 0 };
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
