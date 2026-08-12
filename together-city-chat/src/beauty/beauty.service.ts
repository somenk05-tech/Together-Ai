import { swallow } from '../shared/swallow';
import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import { ORDER_HISTORY_CAP } from '../shared/paging';
import { MedicalService } from '../medical/medical.service';
import { FinancialService } from '../financial/financial.service';
import { AiService } from '../ai/ai.service';
import { MasterProfileService } from '../profile/master-profile.service';
import { beautyGender } from '../profile/sex-and-gender';
import { clampBudget, planForWire, planWithinBudget, type StoredBudget } from './budget-routine';
import { normaliseBag, parseBag, type BagLine } from './beauty-bag';
import {
  beautyInsights, recommendProducts, priceBeautyOrder, CONCERN_TAGS, BEAUTY_PRODUCTS,
  type BeautyInsight,
} from './beauty-engine';
import { topicalExclusions } from '../shared/topical-sensitivities';
import { allergyNotice } from '../shared/allergen-voice';
import { buildRoutines } from './routine-engine';
import { nextReorder, reorderDueFor } from './reorder';
import { LookAnalysisService } from './look-analysis.service';
import { assessBeauty, focusOf, noteOf, type BeautyProfileInput, type BeautyAssessment } from './beauty-analysis';
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

/**
 * What is actually on file: an assessment written by whichever version of
 * beauty-analysis.ts was deployed the day it was generated. `summary` has been
 * there since the beginning; `focus` and `note` have not.
 */
type StoredAssessment =
  | ({ summary?: string; focus?: string[]; note?: string } & Record<string, unknown>)
  | null;

/** Fills in the two parts the page typesets, for rows that predate them. */
const withAssessmentParts = (a: StoredAssessment): StoredAssessment => (a
  ? { ...a, focus: focusOf(a as Parameters<typeof focusOf>[0]), note: a.note ?? noteOf(a.summary ?? '') }
  : null);

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
    const photosOnFile = safeJson<unknown[]>(row.photosJson, []);
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
       * `analyzedAt` is the record that an analysis actually happened — AND
       * the photographs it analysed must still be on file. The first fix
       * gated on the timestamp alone, and the owner's own account showed why
       * that is not enough: a row stamped 22 Jul by the RETIRED code path
       * (which used to stamp on profile save) carried analyzedAt with zero
       * photos, and seven GOOD readings kept printing for a face nobody had
       * seen. Deleting photos clears the stamp going forward; rows minted
       * before that rule carry the stamp without the evidence, and the only
       * gate that survives old data is the one that demands both. The screen
       * handles null by inviting the citizen to upload; that is the honest
       * state.
       */
      /**
       * `focus` AND `note` ARE DERIVED ON READ, NOT MIGRATED. The profile page
       * sets the summary as type — the priorities large, the qualifier in
       * italic beneath — so it needs the sentence in its parts. Assessments
       * saved before those fields existed have the parts on file anyway: the
       * findings are in `issues`, and the qualifier is the second half of the
       * summary this same module composed. Deriving them here means an old row
       * and a new one answer identically and nothing has to be rewritten in the
       * database to change a typeface.
       */
      analysis: withAssessmentParts(
        row.analyzedAt && photosOnFile.length > 0 ? safeJson<StoredAssessment>(row.analysisJson, null) : null,
      ),
      photos: photosOnFile,
      progress: safeJson<ProgressEntry[]>(row.progressJson, []),
      analyzedAt: row.analyzedAt && photosOnFile.length > 0 ? row.analyzedAt.toISOString() : null,
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
    // The same both-or-nothing rule as the read gate: a refresh is only owed
    // to an assessment that is still EVIDENCED — an analysis event and the
    // photos it read, together. Refreshing a stale pre-evidence row kept the
    // fabrication alive on every profile save; this is the door it came
    // through.
    const hasExisting = Boolean(existing?.analysisJson) && Boolean(existing?.analyzedAt) && photos.length > 0;
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
  /**
   * The monthly budget, per part of the routine.
   *
   * IT LIVES IN THE PROFILE'S OWN JSON rather than in three new columns. The
   * whole beauty profile — every answer, every goal — is already one `extras`
   * blob on this row, and a budget is a profile answer. Three columns would be
   * a migration, a second place to look, and nothing gained.
   *
   * `null` means NOT SET, and the difference from zero is the entire feature: a
   * routine is not generated until somebody has said what they want to spend,
   * and a default silently applied is the thing the owner asked us not to do.
   */
  async getBudget(userId: string): Promise<StoredBudget | null> {
    const row = await swallow(this.beauty.findUnique({ where: { userId } }), 'beauty: profile read', { userId });
    const extras = safeJson<Record<string, unknown>>(row?.extras, {});
    // `monthlyBudget`, NOT `budget` — see saveBudget for the collision this key
    // is avoiding. The second branch recovers the handful of profiles written
    // during the hour the wrong key was live.
    const raw = (extras.monthlyBudget ?? (typeof extras.budget === 'object' ? extras.budget : null)) as StoredBudget | null;
    const b = raw;
    if (!b || ![b.face, b.hair, b.body].every((n) => typeof n === 'number')) return null;
    return {
      face: clampBudget(b.face), hair: clampBudget(b.hair), body: clampBudget(b.body),
      setAt: b.setAt ?? null, currency: b.currency ?? 'INR', preference: b.preference ?? null,
    };
  }

  /**
   * Save it, clamped, with the moment it was set. Never inferred, never guessed.
   *
   * THE KEY IS `monthlyBudget` AND THAT IS THE WHOLE POINT OF THIS COMMENT.
   * `extras.budget` was already taken — it is the profile's own onboarding
   * answer, a STRING like "₹1000–2500" — and writing an object over it made
   * `recommendProducts` call `.match()` on an object, which is a TypeError, in
   * the one function every beauty screen goes through. The market, the routine
   * and the profile all returned 500 together, and the only visible symptom was
   * "we couldn't build your routine".
   *
   * The old object is also DELETED where it is found, so the string answer is
   * free to be given again rather than staying permanently occupied.
   */
  async saveBudget(userId: string, dto: { face: number; hair: number; body: number; preference?: string }) {
    const row = await swallow(this.beauty.findUnique({ where: { userId } }), 'beauty: profile read', { userId });
    const extras = safeJson<Record<string, unknown>>(row?.extras, {});
    if (typeof extras.budget === 'object' && extras.budget !== null) delete extras.budget;
    const monthlyBudget: StoredBudget = {
      face: clampBudget(dto.face), hair: clampBudget(dto.hair), body: clampBudget(dto.body),
      setAt: new Date().toISOString(), currency: 'INR', preference: dto.preference ?? null,
    };
    await swallow(this.beauty.upsert({
      where: { userId },
      update: { extras: JSON.stringify({ ...extras, monthlyBudget }) },
      create: { userId, extras: JSON.stringify({ monthlyBudget }) },
    }), 'beauty: budget write', { userId });
    return monthlyBudget;
  }

  /**
   * The routine — which does not exist until a budget does.
   *
   * `needsBudget` is returned rather than an empty routine or a default one,
   * because those are two different lies. The page shows "set your budget
   * first"; nothing is generated behind it.
   */
  async routine(userId: string) {
    const { products, personalisedBy } = await this.products(userId);
    const budget = await this.getBudget(userId);
    const disclaimer =
      'Cosmetic guidance based on your saved skin and hair profile — not medical advice. ' +
      'Stop anything that stings or reddens, and see a dermatologist for a condition that persists.';

    if (!budget) {
      // `reorder` is null here rather than computed, and it is not laziness:
      // this branch renders a gate that says "set your budget first" and has no
      // routine card to hang a countdown on. Fetching an order history to
      // decorate a page that shows none of it is a query nobody reads.
      return { needsBudget: true as const, budget: null, plan: null, routines: [], personalisedBy, productCount: 0, disclaimer, reorder: null };
    }

    // The needs the plan optimises against are the assessment's own active
    // readings — the same ones the shelf was ranked by, not a second opinion.
    // Typed at the boundary rather than trusted: `analysis` is stored JSON and
    // getProfile hands it back as `unknown`, which is the honest type for it.
    type Readings = { readings?: { key: string; level: string }[] };
    const analysis = (await this.getProfile(userId)).analysis as { skin?: Readings; hair?: Readings } | null;
    // No assessment yet means no named needs, which means the plan builds the
    // essentials and stops — the right answer, and not an error.
    const needs = [...(analysis?.skin?.readings ?? []), ...(analysis?.hair?.readings ?? [])]
      .filter((r) => r.level !== 'good').map((r) => r.key);

    const plan = planWithinBudget(products, budget, needs);
    // Only the products the budget actually bought reach the bands. This is the
    // line that makes the budget real rather than decorative: a step that did
    // not fit is not laid out and then hidden, it was never chosen.
    const chosen = new Set([...plan.face.picks, ...plan.hair.picks, ...plan.body.picks].map((x) => x.product.id));
    const routines = buildRoutines(products.filter((p) => chosen.has(p.id)));

    /**
     * WHEN TO BUY THIS AGAIN, decided here and not in the browser.
     *
     * The same rule as `lastsLabel` and `packLabel` one file over: a judgement
     * about a product — which one runs out first, how long a pack lasts, how
     * early to reorder — is made on the server, once, and travels as an answer.
     * The page turns the date into "35 days" and formats nothing else, so the
     * countdown ticks over at midnight without a refetch and there is still
     * only one copy of the arithmetic.
     *
     * IT IS COMPUTED FROM THE LAST ORDER, NOT FROM THIS ROUTINE. Somebody who
     * moves their budget the day after paying has a new routine and the same
     * ten bottles; the bottles are what run out. A routine nobody has ordered
     * yet gets null, which is the honest answer to "when is your next order" —
     * not a date.
     */
    const reorder = nextReorder(await this.orders(userId));

    return {
      // The wire shape, not the planner's own — see `planForWire`. The page
      // joins these picks to the routine steps by productId, which the internal
      // Pick_ does not have.
      needsBudget: false as const, budget, plan: planForWire(plan), routines, personalisedBy,
      productCount: chosen.size, disclaimer, reorder,
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
  /**
   * The bag — one per citizen, on the server, priced at read time.
   *
   * It is stored as ids and quantities and NOTHING ELSE. Every rupee here is
   * looked up from the shelf when the bag is read, so a bag cannot check out at
   * a price the market no longer offers, and a product withdrawn from the
   * catalogue drops out of the bag instead of becoming an unbuyable line.
   */
  async getBag(userId: string) {
    const row = await swallow(this.beauty.findUnique({ where: { userId } }), 'beauty: profile read', { userId });
    const extras = safeJson<Record<string, unknown>>(row?.extras, {});
    return this.priceBag(parseBag(extras.bag));
  }

  /** Replace the bag wholesale. The client owns the arithmetic of adding and
   *  removing; the server owns what a bag is allowed to contain. */
  async saveBag(userId: string, lines: BagLine[]) {
    const row = await swallow(this.beauty.findUnique({ where: { userId } }), 'beauty: profile read', { userId });
    const extras = safeJson<Record<string, unknown>>(row?.extras, {});
    const bag = normaliseBag(lines);
    await swallow(this.beauty.upsert({
      where: { userId },
      update: { extras: JSON.stringify({ ...extras, bag }) },
      create: { userId, extras: JSON.stringify({ bag }) },
    }), 'beauty: bag write', { userId });
    return this.priceBag(bag);
  }

  /**
   * Ids and quantities in, a bag somebody can read out.
   *
   * A LINE FOR A PRODUCT THAT NO LONGER EXISTS IS DROPPED, and `removed` says
   * how many went — silently shortening the list would leave somebody looking
   * for a bottle they are sure they added.
   */
  private priceBag(lines: BagLine[]) {
    const priced = priceBeautyOrder(lines);
    const unknown = priced.ok ? 0 : priced.unknownIds.length;
    const good = priced.ok ? priced : priceBeautyOrder(lines.filter((l) => !priced.unknownIds.includes(l.id)));
    if (!good.ok) return { lines: [], totalInr: 0, count: 0, removed: unknown };

    // The photograph travels with the line. A checkout that lists ten products
    // as ten lines of text is a receipt; the shop it came from showed pictures
    // and the last screen before paying should not be the first one that does
    // not. Joined here rather than sent up by the client, for the same reason
    // the price is: the shelf is the only thing that knows.
    const byId = new Map(BEAUTY_PRODUCTS.map((p) => [p.id, p]));
    const withArt = good.lines.map((l) => {
      const p = byId.get(l.id);
      return { ...l, image: p?.image ?? '', imageAlt: p?.imageAlt ?? '', category: p?.category ?? '' };
    });
    return {
      lines: withArt,
      totalInr: good.totalInr,
      count: withArt.reduce((n, l) => n + l.qty, 0),
      removed: unknown,
    };
  }

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
    // THE BAG IS EMPTIED BY THE ORDER, which is one of exactly two things
    // allowed to empty it — the other is the citizen. Leaving it full after
    // payment is how somebody buys the same routine twice.
    await this.saveBag(userId, []);
    return this.orders(userId).then((list) => ({ orderId, orders: list }));
  }

  async orders(userId: string) {
    const rows = await this.prisma.beautyOrder.findMany({
      where: { userId }, orderBy: { createdAt: 'desc' }, take: ORDER_HISTORY_CAP,
    });
    // EVERY ORDER CARRIES ITS OWN DUE DATE, not just the latest one. An order
    // is a supply with a life, and a history where only the top row knows when
    // it ran out is a history that cannot answer "how long did that last me".
    // The routine page picks the latest of these; this page shows each.
    return rows.map((o) => {
      const order = {
        id: o.id, totalInr: o.totalInr, status: o.status,
        items: safeParse(o.itemsJson),
        createdAt: o.createdAt.toISOString(),
      };
      return { ...order, reorder: reorderDueFor(order) };
    });
  }
}

function safeParse(json: string): { id: string; name: string; priceInr: number; qty: number }[] {
  try { return JSON.parse(json); } catch { return []; }
}
