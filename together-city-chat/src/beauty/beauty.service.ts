import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import { MedicalService } from '../medical/medical.service';
import { FinancialService } from '../financial/financial.service';
import { AiService } from '../ai/ai.service';
import {
  beautyInsights, recommendProducts, BEAUTY_PRODUCTS, CONCERN_TAGS,
  type BeautyInsight,
} from './beauty-engine';
import { assessBeauty, type BeautyProfileInput, type BeautyAssessment } from './beauty-analysis';
import { buildMakeupLook, type FaceAttrs } from './makeup-engine';
import type { PlaceBeautyOrderDto } from './dto/beauty.dto';

const DEFAULT_PROFILE = { skinType: 'normal', hairType: 'straight', concerns: [] as string[] };

/** Beauty profile row incl. the JSON columns the offline Prisma client can't type yet. */
interface BeautyRow {
  skinType: string; hairType: string; concerns: string;
  extras: string | null; photosJson: string; progressJson: string; analysisJson: string | null; analyzedAt: Date | null;
  analysisLogJson?: string | null; // rolling-week analysis log (new column; offline client can't type it)
  faceJson?: string | null;        // AI face-feature read (new column; offline client can't type it)
}
/** A permanent, dated skin & hair assessment in the timeline. Each entry keeps a
 *  per-attribute snapshot so any past assessment can be revisited and compared —
 *  none is ever overwritten (the first is the baseline / Month 0). */
export interface AttrSnapshot { key: string; label: string; level: string }
export interface ProgressEntry {
  id: string; date: string; findings: string[]; score: number; thumb: string | null;
  skinScore?: number; hairScore?: number;
  skin?: AttrSnapshot[]; hair?: AttrSnapshot[]; baseline?: boolean;
}
const safeJson = <T>(s: string | null | undefined, fb: T): T => { try { return s ? (JSON.parse(s) as T) : fb; } catch { return fb; } };

/** Assessment level → 0–100 score (higher is healthier), for progress comparison. */
const LEVEL_SCORE: Record<string, number> = { good: 100, monitor: 70, attention: 45, priority: 20 };
const levelScore = (lvl: string) => LEVEL_SCORE[lvl] ?? 60;
const avgScore = (readings: { level: string }[]) =>
  readings.length ? Math.round(readings.reduce((s, r) => s + levelScore(r.level), 0) / readings.length) : 0;
const snapshot = (readings: { key: string; label: string; level: string }[]): AttrSnapshot[] =>
  readings.map((r) => ({ key: r.key, label: r.label, level: r.level }));

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

  /** Append a permanent, dated assessment to the timeline. The FIRST entry is the
   *  baseline (Month 0); nothing is ever overwritten. Capped generously (baseline
   *  + most recent 59) to bound the JSON column while always keeping the baseline. */
  private appendAssessment(progress: ProgressEntry[], assessment: BeautyAssessment, opts: { thumb?: string | null }): ProgressEntry[] {
    const now = new Date();
    const skinScore = avgScore(assessment.skin.readings);
    const hairScore = avgScore(assessment.hair.readings);
    const entry: ProgressEntry = {
      id: (globalThis.crypto?.randomUUID?.() ?? `${now.getTime()}-${Math.round(Math.random() * 1e6)}`),
      date: now.toISOString(),
      findings: [...assessment.skin.issues, ...assessment.hair.issues],
      score: Math.round((skinScore + hairScore) / 2),
      skinScore, hairScore,
      skin: snapshot(assessment.skin.readings), hair: snapshot(assessment.hair.readings),
      thumb: typeof opts.thumb === 'string' && opts.thumb.startsWith('data:') && opts.thumb.length < 200_000 ? opts.thumb : null,
      baseline: progress.length === 0,
    };
    const next = [...progress, entry];
    return next.length > 60 ? [next[0], ...next.slice(-59)] : next;
  }

  /** Per-attribute comparison of two assessments + a plain-language summary. */
  private compareAssessments(prev: ProgressEntry, curr: ProgressEntry) {
    const cmp = (prevR?: AttrSnapshot[], currR?: AttrSnapshot[]) => {
      const pm = new Map((prevR ?? []).map((r) => [r.key, r]));
      return (currR ?? []).map((r) => {
        const p = pm.get(r.key);
        const ps = p ? levelScore(p.level) : null;
        const cs = levelScore(r.level);
        const direction = ps == null ? 'new' : cs > ps ? 'improved' : cs < ps ? 'worse' : 'stable';
        return { key: r.key, label: r.label, from: p?.level ?? null, to: r.level, direction, delta: ps == null ? 0 : cs - ps };
      });
    };
    const skin = cmp(prev.skin, curr.skin);
    const hair = cmp(prev.hair, curr.hair);
    const skinDelta = (curr.skinScore ?? 0) - (prev.skinScore ?? 0);
    const hairDelta = (curr.hairScore ?? 0) - (prev.hairScore ?? 0);
    const improved = [...skin, ...hair].filter((a) => a.direction === 'improved').map((a) => a.label);
    const worse = [...skin, ...hair].filter((a) => a.direction === 'worse').map((a) => a.label);
    const list = (arr: string[]) => (arr.length <= 1 ? (arr[0] ?? '') : `${arr.slice(0, -1).join(', ')} and ${arr[arr.length - 1]}`);
    const parts: string[] = [];
    parts.push(improved.length ? `Compared with your previous assessment, ${list(improved)} ${improved.length > 1 ? 'have' : 'has'} improved.` : 'Compared with your previous assessment:');
    if (worse.length) parts.push(`${list(worse)} ${worse.length > 1 ? 'need' : 'needs'} a little more attention.`);
    parts.push(skinDelta >= 0 && hairDelta >= 0
      ? 'Keep up your current skincare routine and nutrition plan.'
      : 'Stay consistent — small changes compound over the coming weeks.');
    return { skin, hair, skinDelta, hairDelta, summary: parts.join(' ') };
  }

  /** The permanent skin & hair timeline: every dated assessment, the latest-vs-
   *  previous comparison, and whether a monthly follow-up is due. */
  async beautyHistory(userId: string) {
    const row = await this.beauty.findUnique({ where: { userId } }).catch(() => null);
    const progress = safeJson<ProgressEntry[]>(row?.progressJson, []);
    if (!progress.length) return { hasHistory: false, entries: [], comparison: null, followUpDue: false, daysSinceLast: null };
    const entries = progress.map((e, i) => ({
      ...e, baseline: e.baseline ?? i === 0, index: i,
      label: i === 0 ? 'Baseline' : `Month ${i}`,
    }));
    const last = entries[entries.length - 1];
    const prev = entries.length > 1 ? entries[entries.length - 2] : null;
    const daysSinceLast = Math.floor((Date.now() - new Date(last.date).getTime()) / 86_400_000);
    return {
      hasHistory: true,
      entries,
      comparison: prev ? this.compareAssessments(prev, last) : null,
      followUpDue: daysSinceLast >= 30,
      daysSinceLast,
    };
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
      uploads: { limit: 5, used: this.analysisLog(row).length, remaining: Math.max(0, 5 - this.analysisLog(row).length) },
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
    // Completing the profile the FIRST time creates the baseline assessment in the
    // timeline. Later profile edits refresh the current assessment but don't add a
    // new timeline entry (follow-ups come from dated photo assessments).
    const progress = safeJson<ProgressEntry[]>(existing?.progressJson, []);
    const nextProgress = progress.length === 0 ? this.appendAssessment(progress, analysis, { thumb: null }) : progress;
    await this.beauty.upsert({
      where: { userId },
      update: { skinType, hairType, concerns: concerns.join(','), extras: JSON.stringify(dto), analysisJson: JSON.stringify(analysis), progressJson: JSON.stringify(nextProgress), analyzedAt: now } as never,
      create: { userId, skinType, hairType, concerns: concerns.join(','), extras: JSON.stringify(dto), photosJson: '[]', analysisJson: JSON.stringify(analysis), progressJson: JSON.stringify(nextProgress), analyzedAt: now } as never,
    });
    return this.getProfile(userId);
  }

  /**
   * One-time photo analysis. AI reviews the uploaded photos to identify visible
   * issues (acne, pigmentation, texture, pores, redness, hydration, hair density,
   * scalp…) — but ONLY if the photo is clear and authentic. Beauty-filtered,
   * edited or AI-generated photos are rejected with a prompt to re-upload. The
   * detected issues are folded into the deterministic assessment. Runs once.
   */
  async analyzePhotos(userId: string, photos: { slot: string; base64: string; mediaType?: string }[], thumb?: string) {
    const existing = await this.beauty.findUnique({ where: { userId } }).catch(() => null);

    // Rolling-week rate limit: at most 5 photo analyses per 7 days (deleting a
    // check-in does not refund one — the log survives deletes).
    const recentLog = this.analysisLog(existing);
    if (recentLog.length >= 5) {
      const oldest = new Date(Math.min(...recentLog.map((t) => new Date(t).getTime())));
      const nextAt = new Date(oldest.getTime() + 7 * 86_400_000);
      return {
        ...(await this.getProfile(userId)), photoFindings: [] as string[], aiUsed: false,
        quality: 'limit' as const,
        warning: `You've used all 5 photo analyses for this week. You can analyse again after ${nextAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}.`,
      };
    }

    const profile = safeJson<BeautyProfileInput>(existing?.extras, {});
    const images = photos.filter((p) => p.base64).map((p) => ({ base64: p.base64, mediaType: p.mediaType || 'image/jpeg' }));

    const review = images.length ? await this.ai.reviewSkinPhotos(images) : { quality: 'ok' as const, findings: [] as string[], note: '', face: null as Record<string, string> | null };
    const rejected = review.quality === 'suspect' || review.quality === 'unclear';
    const warning = review.quality === 'suspect'
      ? 'These photos look filtered or AI-generated — please upload clear, unedited photos of yourself for an accurate analysis.'
      : review.quality === 'unclear'
        ? 'These photos are too unclear to analyse — try again in good, even lighting without cropping.'
        : '';
    const findings = review.findings;

    // "Don't know" answers → estimate from what the photos show, and mark the
    // fields as AI-estimated (the user can edit them anytime).
    const fset = findings.join(' ').toLowerCase();
    const unknown = (v?: string) => !v || /don'?t know/i.test(String(v));
    const est: Record<string, string> = {};
    if (!rejected) {
      if (unknown(profile.skinType)) {
        if (/oily|sebum|shine/.test(fset)) est.skinType = 'Oily';
        else if (/dehydrat|dry skin|flak/.test(fset)) est.skinType = 'Dry';
        else if (/redness|sensitiv/.test(fset)) est.skinType = 'Sensitive';
        else if (fset) est.skinType = 'Normal';
      }
      if (unknown(profile.scalpType)) {
        if (/dandruff|dry scalp|flaky scalp/.test(fset)) est.scalpType = 'Dry';
        else if (/oily scalp/.test(fset)) est.scalpType = 'Oily';
      }
      if (unknown(profile.hairDensity) && /low density|thinning|hair loss|sparse/.test(fset)) est.hairDensity = 'Low';
      if (unknown(profile.hairTexture) && /frizz|damage|breakage/.test(fset)) est.hairTexture = 'Frizzy';
    }
    const estKeys = Object.keys(est);
    const profileForAssess: BeautyProfileInput = estKeys.length
      ? { ...profile, ...est, aiEstimated: { ...((profile as { aiEstimated?: Record<string, boolean> }).aiEstimated ?? {}), ...Object.fromEntries(estKeys.map((k) => [k, true])) } } as BeautyProfileInput
      : profile;

    const analysis = assessBeauty(profileForAssess, findings);
    const issues = [...analysis.skin.issues, ...analysis.hair.issues];
    const photoRows = photos.map((p) => ({ slot: p.slot, analyzedAt: new Date().toISOString(), findings }));
    const now = new Date();

    // Append a PERMANENT, dated assessment to the timeline (only on a real
    // analysis) — the baseline and every follow-up are kept, never overwritten.
    const progress = safeJson<ProgressEntry[]>(existing?.progressJson, []);
    const nextProgress = rejected ? progress : this.appendAssessment(progress, analysis, { thumb });
    void issues; // (issues are captured inside the appended assessment)

    // Record this analysis run in the rolling-week log (counts even if rejected —
    // each run costs an AI review). On a rejected photo, keep the prior assessment.
    const newLog = JSON.stringify([...recentLog, now.toISOString()]);
    const update = rejected
      ? { photosJson: JSON.stringify(photoRows), analysisLogJson: newLog }
      : { photosJson: JSON.stringify(photoRows), progressJson: JSON.stringify(nextProgress), analysisJson: JSON.stringify(analysis), analyzedAt: now, analysisLogJson: newLog,
          ...(estKeys.length ? { extras: JSON.stringify(profileForAssess) } : {}),
          ...(review.face ? { faceJson: JSON.stringify(review.face) } : {}) };
    await this.beauty.upsert({
      where: { userId },
      update: update as never,
      create: { userId, skinType: String(profile.skinType ?? 'normal'), hairType: String(profile.hairType ?? 'straight'), concerns: (profile.skinConcerns ?? []).join(','), extras: JSON.stringify(profile), photosJson: JSON.stringify(photoRows), progressJson: JSON.stringify(rejected ? [] : nextProgress), analysisJson: JSON.stringify(analysis), analyzedAt: now, analysisLogJson: newLog } as never,
    });
    return { ...(await this.getProfile(userId)), photoFindings: findings, aiUsed: this.ai.enabled && images.length > 0, quality: review.quality, warning };
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
      // consent revoked → recommendations run purely on the skin & hair profile
    }
    // PRIMARY signal: the saved assessment's per-attribute readings.
    const analysis = profile.analysis as { skin?: { readings?: { key: string; label: string; level: string }[] }; hair?: { readings?: { key: string; label: string; level: string }[] } } | null;
    const readings = [...(analysis?.skin?.readings ?? []), ...(analysis?.hair?.readings ?? [])];
    const extras = profile.profile as { skinType?: string; budget?: string; allergies?: string[] };
    const products = recommendProducts({
      readings,
      concerns: profile.concerns,
      profile: { skinType: String(extras.skinType ?? profile.skinType), budget: extras.budget, allergies: extras.allergies },
      insights,
    });
    return {
      products,
      personalisedBy: { concerns: profile.concerns, labs: usedLabs, assessment: readings.length > 0 },
      matchedCount: products.filter((p) => p.matched).length,
    };
  }

  // ─────────────── photo re-upload management (5 analyses / rolling week) ───────────────

  private analysisLog(row: BeautyRow | null): string[] {
    const log = safeJson<string[]>(row?.analysisLogJson, []);
    const weekAgo = Date.now() - 7 * 86_400_000;
    return log.filter((t) => new Date(t).getTime() > weekAgo);
  }

  /** How many photo analyses remain this rolling week (max 5). */
  async uploadAllowance(userId: string) {
    const row = await this.beauty.findUnique({ where: { userId } }).catch(() => null);
    const used = this.analysisLog(row).length;
    return { limit: 5, used, remaining: Math.max(0, 5 - used) };
  }

  /** Delete the latest photo check-in so the user can re-upload. The assessment
   *  is regenerated from the profile alone (photo findings removed); the weekly
   *  analysis counter is NOT reset — deleting doesn't refund an upload. */
  async deleteLatestAssessment(userId: string) {
    const existing = await this.beauty.findUnique({ where: { userId } }).catch(() => null);
    if (!existing) return this.getProfile(userId);
    const progress = safeJson<ProgressEntry[]>(existing.progressJson, []);
    if (progress.length === 0) return this.getProfile(userId);
    const nextProgress = progress.slice(0, -1);
    const profile = safeJson<BeautyProfileInput>(existing.extras, {});
    const analysis = assessBeauty(profile, []); // regenerate without the deleted photos' findings
    await this.beauty.upsert({
      where: { userId },
      update: { photosJson: '[]', progressJson: JSON.stringify(nextProgress), analysisJson: JSON.stringify(analysis), analyzedAt: new Date() } as never,
      create: { userId, skinType: 'normal', hairType: 'straight', concerns: '', photosJson: '[]', progressJson: '[]' } as never,
    });
    return this.getProfile(userId);
  }

  // ─────────────── Makeup Studio (face-first, biomarker-free) ───────────────
  async makeupLook(userId: string, occasion?: string) {
    const row = await this.beauty.findUnique({ where: { userId } }).catch(() => null);
    const face = safeJson<FaceAttrs | null>(row?.faceJson, null);
    const analysis = safeJson<{ skin?: { readings?: { key: string; label: string; level: string }[] } } | null>(row?.analysisJson, null);
    const extras = safeJson<{ skinTone?: string; undertone?: string; budget?: string }>(row?.extras, {});
    return {
      ...buildMakeupLook({
        face,
        readings: analysis?.skin?.readings ?? [],
        skinTone: extras.skinTone, undertone: extras.undertone,
        occasion,
      }),
      budget: extras.budget ?? null,
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
