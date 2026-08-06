import { swallow } from '../shared/swallow';
import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import { ORDER_HISTORY_CAP } from '../shared/paging';
import { MedicalService } from '../medical/medical.service';
import { FinancialService } from '../financial/financial.service';
import { AiService } from '../ai/ai.service';
import { MasterProfileService } from '../profile/master-profile.service';
import { beautyGender } from '../profile/sex-and-gender';
import {
  beautyInsights, recommendProducts, priceBeautyOrder, CONCERN_TAGS, BEAUTY_PRODUCTS,
  type BeautyInsight,
} from './beauty-engine';
import { topicalExclusions } from '../shared/topical-sensitivities';
import { allergyNotice } from '../shared/allergen-voice';
import { buildRoutines } from './routine-engine';
import { LookAnalysisService } from './look-analysis.service';
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
    private readonly masterProfile: MasterProfileService,
    private readonly looks: LookAnalysisService,
  ) {}

  /** Overlay the Master Profile's shared demographics onto the beauty profile
   *  blob so the Skin & Hair form auto-fills age/gender/height/weight/city/
   *  occupation from whatever hub the user filled first (single source of truth). */
  private async withMasterDemographics(userId: string, profile: Record<string, unknown>): Promise<Record<string, unknown>> {
    const m = await swallow(this.masterProfile.get(userId), 'beauty: master read', { userId });
    if (!m) return profile;
    const merged = { ...profile };
    const put = (k: string, v: unknown) => { if (v !== undefined && v !== null && v !== '') merged[k] = v; };
    put('age', typeof m.age === 'number' ? m.age : undefined);
    // beautyGender(), not m.gender and not displayGender(). This hub's select is
    // Female | Male | Other, so displayGender's 'Non-binary' would match no
    // option and the field would open blank — §15.1, one hub along. Reading
    // m.gender directly meant anyone who answered on the Master Profile page was
    // asked again here, because that page stopped writing that column.
    put('gender', beautyGender(m));
    put('heightCm', typeof m.heightCm === 'number' ? m.heightCm : undefined);
    put('weightKg', typeof m.weightKg === 'number' ? m.weightKg : undefined);
    put('city', m.city ?? undefined);
    put('occupation', m.occupation ?? undefined);
    return merged;
  }

  /**
   * Beauty's own sensitivities, plus the food allergens declared elsewhere.
   *
   * AT MATCH TIME, NOT IN THE PROFILE BLOB. The obvious place for this is
   * withMasterDemographics(), which overlays shared fields onto the profile the
   * form renders — and that is precisely why it must not go there. saveProfile()
   * persists the dto it receives straight into BeautyProfile.extras, so anything
   * this hub shows in its form comes back and is stored as Beauty's own. The
   * citizen would then own two copies of their nut allergy, editable in two
   * places, disagreeing the moment either changed. That is the problem §3
   * exists to remove, recreated by the fix for it.
   *
   * So the union happens where a product is being chosen and nowhere else.
   * Beauty displays, and stores, only what Beauty asked.
   */
  private async declaredSensitivities(userId: string, own: unknown): Promise<string[]> {
    const mine = Array.isArray(own) ? own.map(String).map((s) => s.trim()).filter(Boolean) : [];
    const m = await swallow(this.masterProfile.get(userId), 'beauty: master read', { userId });
    const food = String((m as { foodAllergens?: string | null } | null)?.foodAllergens ?? '')
      .split(',').map((s) => s.trim()).filter(Boolean);
    return [...new Set([...mine, ...food])];
  }

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
    const row = await swallow(this.beauty.findUnique({ where: { userId } }), 'beauty: profile read', { userId });
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
    const row = await swallow(this.beauty.findUnique({ where: { userId } }), 'beauty: profile read', { userId });
    if (!row) {
      // First open: auto-fill shared demographics from the Master Profile.
      const profile = await this.withMasterDemographics(userId, {});
      return { ...DEFAULT_PROFILE, saved: false, profile, analysis: null, photos: [], analyzedAt: null, aiEnabled: this.ai.enabled };
    }
    return {
      skinType: row.skinType, hairType: row.hairType,
      concerns: row.concerns ? row.concerns.split(',').filter(Boolean) : [],
      saved: true,
      profile: await this.withMasterDemographics(userId, safeJson<Record<string, unknown>>(row.extras, {})),
      /**
       * AN ASSESSMENT NEEDS SOMETHING TO HAVE ASSESSED.
       *
       * Every reading on that screen is a claim about a citizen's face:
       * "No active acne reported", "Even tone", "Firm, few lines" — seven of
       * them, all reading GOOD, on an account that had uploaded no photographs
       * at all. Those are not readings. They are the ABSENCE of a complaint in
       * an unanswered questionnaire, printed as a finding, which is the one
       * thing this codebase does not do: no screen asserts an absence it never
       * established.
       *
       * `analyzedAt` is the record that an analysis actually happened. Without
       * it a stored analysisJson is a leftover — from an older code path, a
       * deleted photo set, or a profile save that used to generate one — and a
       * leftover is not evidence. The screen already handles null by inviting
       * the citizen to upload; that is the honest state.
       */
      analysis: row.analyzedAt ? safeJson<unknown>(row.analysisJson, null) : null,
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
    const existing = await swallow(this.beauty.findUnique({ where: { userId } }), 'beauty: profile read', { userId });
    const photos = safeJson<{ slot: string; findings: string[] }[]>(existing?.photosJson, []);
    const photoFindings = [...new Set(photos.flatMap((x) => x.findings ?? []))];

    // Saving the profile alone does NOT generate an assessment — analysis is
    // created only by the full photo + profile flow (analyzePhotos). If an
    // assessment already exists, refresh it with the updated profile answers so
    // it stays consistent; if none exists, stay neutral until photos arrive.
    void photoFindings;
    const hasExisting = Boolean(existing?.analysisJson);
    const refreshed = hasExisting
      ? assessBeauty(
          { ...p, allergies: await this.declaredSensitivities(userId, (p as { allergies?: unknown }).allergies) },
          [...new Set(photos.flatMap((x) => x.findings ?? []))],
        )
      : null;
    await this.beauty.upsert({
      where: { userId },
      update: { skinType, hairType, concerns: concerns.join(','), extras: JSON.stringify(dto),
        ...(refreshed ? { analysisJson: JSON.stringify(refreshed) } : {}) },
      create: { userId, skinType, hairType, concerns: concerns.join(','), extras: JSON.stringify(dto), photosJson: '[]', progressJson: '[]' },
    });

    // Master Profile sync — shared demographics flow back to the single source of
    // truth and propagate to every other hub (age lives in the master fallback).
    const pp = p as { gender?: string; heightCm?: number; weightKg?: number; city?: string; occupation?: string };
    /**
     * BEAUTY NO LONGER WRITES GENDER BACK. (Owner decision, 1 Aug: gender is
     * decided once, at the Master Profile, and no hub asks again.)
     *
     * It used to, and it destroyed data. Beauty's select is
     * Female | Male | Other, so beautyGender() flattens nonBinary to 'Other';
     * the save then ran that label back through genderIdentityFromBeauty(),
     * which returns 'other', and syncShared() overwrites any field it is
     * handed. A non-binary citizen who changed their SKIN TYPE silently had
     * `nonBinary` rewritten to `other` in the canonical row — a protected
     * attribute destroyed by an unrelated save, with nothing shown.
     *
     * Removing the field from the patch is the whole fix, because syncShared
     * ignores `undefined`. The consolidation back-fill in
     * master-profile.service stays: it is fill-if-missing and write-once, so
     * it can still recover a gender for a legacy account whose only answer was
     * this hub's select, and it can never overwrite one.
     */
    await swallow(this.masterProfile.syncShared(userId, {
      heightCm: pp.heightCm, weightKg: pp.weightKg,
      city: pp.city, occupation: pp.occupation,
    }, 'beauty'), 'beauty: master-profile sync', { userId });

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
    const existing = await swallow(this.beauty.findUnique({ where: { userId } }), 'beauty: profile read', { userId });

    // Rolling-week rate limit: at most 5 photo analyses per 7 days (deleting a
    // check-in does not refund one — the log survives deletes).
    const recentLog = this.analysisLog(existing ?? null);
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

    const analysis = assessBeauty(
      { ...profileForAssess, allergies: await this.declaredSensitivities(userId, profileForAssess.allergies) },
      findings,
    );
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
      update: update,
      create: { userId, skinType: String(profile.skinType ?? 'normal'), hairType: String(profile.hairType ?? 'straight'), concerns: (profile.skinConcerns ?? []).join(','), extras: JSON.stringify(profile), photosJson: JSON.stringify(photoRows), progressJson: JSON.stringify(rejected ? [] : nextProgress), analysisJson: JSON.stringify(analysis), analyzedAt: now, analysisLogJson: newLog },
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
    const declared = await this.declaredSensitivities(userId, extras.allergies);
    const products = recommendProducts({
      readings,
      concerns: profile.concerns,
      profile: {
        skinType: String(extras.skinType ?? profile.skinType), budget: extras.budget,
        allergies: declared,
      },
      insights,
    });
    // K5.66 — the shelf says why it is shorter. recommendProducts() has filtered
    // on this since the substring test was replaced; it has never mentioned it,
    // and a citizen cannot tell our rule from our range. Counted over the same
    // catalogue the recommender read, with the same matcher.
    const cut = topicalExclusions(
      BEAUTY_PRODUCTS.map((p) => ({ name: p.name, ingredients: [...p.actives, p.keyIngredient] })),
      declared,
    );
    return {
      products,
      personalisedBy: { concerns: profile.concerns, labs: usedLabs, assessment: readings.length > 0 },
      matchedCount: products.filter((p) => p.matched).length,
      allergyNotice: allergyNotice(cut.matched, cut.removed, { one: 'product', many: 'products' }),
    };
  }

  /**
   * Read a reference photo, using the citizen's own allergies and skin type so
   * the products matched to the steps are ones they can actually use.
   */
  async analyzeLook(userId: string, input: { fileKey?: string; mimeType?: string; base64?: string }) {
    const profile = await this.getProfile(userId);
    const extras = profile.profile as { skinType?: string; allergies?: string[] };
    return this.looks.analyze(userId, input, {
      allergies: await this.declaredSensitivities(userId, extras.allergies),
      skinType: String(extras.skinType ?? profile.skinType ?? ''),
    });
  }

  /**
   * The routine, not just the shelf.
   *
   * Derived from the same recommendation the products page returns, so the two
   * can never disagree about what this person should be using — and so a change
   * to the beauty profile changes the routine on the next read, with nothing to
   * regenerate or invalidate.
   */
  async routine(userId: string) {
    const { products, personalisedBy } = await this.products(userId);
    const routines = buildRoutines(products);
    return {
      routines,
      personalisedBy,
      /** Products the routine actually uses, for a basket or a shopping list. */
      productCount: new Set(routines.flatMap((r) => r.steps.map((s) => s.productId))).size,
      disclaimer:
        'Cosmetic guidance based on your saved skin and hair profile — not medical advice. ' +
        'Stop anything that stings or reddens, and see a dermatologist for a condition that persists.',
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
    const row = await swallow(this.beauty.findUnique({ where: { userId } }), 'beauty: profile read', { userId });
    const used = this.analysisLog(row ?? null).length;
    return { limit: 5, used, remaining: Math.max(0, 5 - used) };
  }

  /** Delete the latest photo check-in. The current assessment is CLEARED to a
   *  neutral "waiting" state — nothing is shown again until the user uploads a
   *  fresh photo set and re-analyses. Earlier timeline entries are kept; the
   *  weekly analysis counter is NOT reset — deleting doesn't refund an upload. */
  async deleteLatestAssessment(userId: string) {
    const existing = await swallow(this.beauty.findUnique({ where: { userId } }), 'beauty: profile read', { userId });
    if (!existing) return this.getProfile(userId);
    const progress = safeJson<ProgressEntry[]>(existing.progressJson, []);
    if (progress.length === 0) return this.getProfile(userId);
    const nextProgress = progress.slice(0, -1);
    await this.beauty.upsert({
      where: { userId },
      update: { photosJson: '[]', progressJson: JSON.stringify(nextProgress), analysisJson: null, analyzedAt: null, faceJson: null },
      create: { userId, skinType: 'normal', hairType: 'straight', concerns: '', photosJson: '[]', progressJson: '[]' },
    });
    return this.getProfile(userId);
  }

  // ─────────────── Makeup Studio (face-first, biomarker-free) ───────────────
  async makeupLook(userId: string, occasion?: string) {
    const row = await swallow(this.beauty.findUnique({ where: { userId } }), 'beauty: profile read', { userId });
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
    // The wallet is charged what the shelf says, not what the request says.
    const priced = priceBeautyOrder(dto.items);
    if (!priced.ok) {
      throw new BadRequestException(
        priced.unknownIds.length === 1
          ? 'One of these is no longer on the shelf. Reload the market and try again.'
          : 'Some of these are no longer on the shelf. Reload the market and try again.',
      );
    }
    const { lines, totalInr } = priced;
    // Unified payment: pay from the one city wallet via the Financial hub.
    // Charge and record the order together — a failure after the debit used to
    // leave the citizen paid-up with no order to show for it.
    // Returns the id explicitly rather than the row, so the call site doesn't
    // depend on generic inference through the transaction callback.
    const orderId = await this.financial.paid<string>(
      userId,
      { hub: 'Beauty', category: 'beauty', label: 'Beauty market order', amountInr: totalInr, method: dto.method },
      async (tx) => {
        const created = await tx.beautyOrder.create({
          data: { userId, itemsJson: JSON.stringify(lines), totalInr, status: 'placed' },
        });
        return created.id;
      },
    );
    return this.orders(userId).then((list) => ({ orderId, orders: list }));
  }

  async orders(userId: string) {
    const rows = await this.prisma.beautyOrder.findMany({
      where: { userId }, orderBy: { createdAt: 'desc' }, take: ORDER_HISTORY_CAP,
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
