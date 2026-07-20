import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { PDFParse } from 'pdf-parse';
import { PrismaService } from '../shared/prisma/prisma.service';
import { ConversationsService } from '../conversations/conversations.service';
import { FinancialService } from '../financial/financial.service';
import { AiService } from '../ai/ai.service';
import { StorageProvider } from '../media/storage.provider';
// The Medical Hub is the source of truth for health data, but the *interpretation*
// logic is the shared, cited clinical engine — so Nutrition, Beauty and Fitness all
// reason from the same evidence base.
import {
  CITATIONS, MARKER_RULES, criticalAlerts, evaluateMarker, flagsFor,
  supplementKit, triggeredConditions, ruleFor,
} from '../nutrition/clinical-engine';
import type { SaveBloodTestDto } from './dto/medical.dto';

const cite = (ids: string[]) => ids.map((id) => CITATIONS[id]).filter(Boolean);

/** The complete, stored analysis of one blood test at one version — the single
 *  source of truth every hub reads (no hub re-runs the AI). */
interface StoredAnalysis {
  analysisVersion: string;
  model: string;
  reportHash: string;
  analyzedAt: string;
  healthScore: number;
  band: string;
  confidence: string;
  priorities: string[];
  markers: { key: string; label: string; unit: string; value: number; range: string; status: string; advice: string }[];
  conditions: { key: string; name: string }[];
  mealRestrictions: string[];
  greeting: string;
  interpretation: string[];
  relationships: string[];
  discuss: string[];
  encouragement: string;
}

/** Hubs that may read Medical biomarkers, and what each uses them for. */
export const CONSENT_HUBS = [
  { hub: 'nutrition', label: 'Nutrition', reads: 'Personalises meal plans, targets and supplements from your markers.' },
  { hub: 'beauty', label: 'Beauty', reads: 'Tailors skin/hair advice (e.g. vitamin D, ferritin, B12).' },
  { hub: 'fitness', label: 'Fitness', reads: 'Adjusts training load and recovery from iron, glucose and inflammation.' },
] as const;

@Injectable()
export class MedicalService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly conversations: ConversationsService,
    private readonly financial: FinancialService,
    private readonly ai: AiService,
    private readonly storage: StorageProvider,
  ) {}

  private readonly logger = new Logger(MedicalService.name);

  /** Extract plain text from a (text-based) PDF report. */
  private async pdfToText(buf: Buffer): Promise<string> {
    try {
      const res = await new PDFParse({ data: new Uint8Array(buf) }).getText();
      return res.text ?? '';
    } catch (e) {
      this.logger.warn(`PDF text extraction failed: ${(e as Error).message}`);
      return '';
    }
  }

  /** Shared 10 GB vault: total bytes = mail + health documents. */
  private readonly quotaBytes = 10 * 1024 * 1024 * 1024;

  async storageUsage(userId: string) {
    const [mail, docs] = await Promise.all([
      this.prisma.mailMessage.findMany({ where: { ownerId: userId }, select: { sizeBytes: true } }),
      this.prisma.medicalRecord.findMany({ where: { userId }, select: { sizeBytes: true } as never }) as Promise<Array<{ sizeBytes: number }>>,
    ]);
    const mailBytes = mail.reduce((s, m) => s + (m.sizeBytes ?? 0), 0);
    const healthBytes = docs.reduce((s, d) => s + (d.sizeBytes ?? 0), 0);
    const usedBytes = mailBytes + healthBytes;
    return {
      quotaBytes: this.quotaBytes,
      usedBytes,
      mailBytes,
      healthBytes,
      usedPct: Math.min(100, +((usedBytes / this.quotaBytes) * 100).toFixed(2)),
      remainingBytes: Math.max(0, this.quotaBytes - usedBytes),
    };
  }

  private async assertQuota(userId: string, incomingBytes: number): Promise<void> {
    const { remainingBytes } = await this.storageUsage(userId);
    if (incomingBytes > remainingBytes) {
      throw new ForbiddenException('Storage full — this file exceeds your remaining 10 GB vault space. Delete some documents and try again.');
    }
  }

  /** Record a health document already uploaded to the PRIVATE vault. We store the
   *  object key only — never a public URL — so it's reachable solely via a
   *  short-lived signed link handed to the authenticated owner. */
  async addDocument(userId: string, dto: {
    kind: string; title: string; detail?: string; fileKey: string; mimeType?: string; sizeBytes: number;
  }) {
    await this.assertQuota(userId, dto.sizeBytes);
    // Never file a record for a file that didn't actually land in the vault —
    // otherwise the record shows but the document is "missing" when opened.
    if (!(await this.storage.healthObjectExists(dto.fileKey))) {
      throw new BadRequestException('Your file didn’t finish uploading — please check your connection and try again.');
    }
    await this.prisma.medicalRecord.create({
      data: {
        userId, kind: dto.kind, title: dto.title, detail: dto.detail ?? null,
        fileUrl: null, fileKey: dto.fileKey, mimeType: dto.mimeType ?? null,
        sizeBytes: dto.sizeBytes, recordedOn: new Date(),
      } as never,
    });
    return this.records(userId);
  }

  /** A short-lived signed URL to view one health document (owner-checked). */
  async recordFileUrl(userId: string, id: string): Promise<{ url: string | null; expiresInSec: number }> {
    const rec = await this.prisma.medicalRecord.findFirst({ where: { id, userId } }) as
      ({ fileKey: string | null; fileUrl: string | null } | null);
    if (!rec) throw new NotFoundException('record not found');
    if (rec.fileKey) return { url: await this.storage.presignHealthDownload(rec.fileKey), expiresInSec: 300 };
    return { url: rec.fileUrl ?? null, expiresInSec: 0 }; // legacy public rows, if any
  }

  /**
   * Read an uploaded blood report (already in R2) and extract its marker values
   * via AI vision — extraction only; the user reviews before the cited engine
   * analyses. Also files the report in the vault. Returns the values to pre-fill
   * the review form (empty when AI is off — the user just types them in).
   */
  async extractBloodReport(userId: string, dto: {
    fileKey: string; mimeType: string; sizeBytes: number; title?: string;
  }) {
    await this.assertQuota(userId, dto.sizeBytes);
    if (!(await this.storage.healthObjectExists(dto.fileKey))) {
      throw new BadRequestException('Your report didn’t finish uploading — please check your connection and try again.');
    }
    // file the document in the private vault (key only, no public URL)
    const rec = await this.prisma.medicalRecord.create({
      data: {
        userId, kind: 'blood-test', title: dto.title || 'Blood report', detail: 'Uploaded blood report',
        fileUrl: null, fileKey: dto.fileKey, mimeType: dto.mimeType, sizeBytes: dto.sizeBytes,
        recordedOn: new Date(),
      } as never,
    });

    // read it back from the private vault → AI extraction. Text-based PDFs are
    // read via extracted text (cheaper + more reliable); images use vision.
    let extracted: { values: Record<string, number>; lab?: string; takenOn?: string } = { values: {} };
    const obj = await this.storage.getHealthObjectBase64(dto.fileKey);
    this.logger.log(`blood extract: node=${process.version} mime=${dto.mimeType} objRead=${!!obj} aiEnabled=${this.ai.enabled}`);
    // Extraction is best-effort: the document is already safely filed above, so
    // a reading failure (e.g. a HEIC/format the vision model rejects) must never
    // fail the request — the user just enters values manually.
    try {
      if (obj) {
        if (dto.mimeType === 'application/pdf') {
          const text = await this.pdfToText(Buffer.from(obj.base64, 'base64'));
          this.logger.log(`blood extract: pdf textLen=${text.length}`);
          extracted = text.trim()
            ? await this.ai.extractMarkersFromText(text)
            : await this.ai.extractBloodMarkers(obj.base64, dto.mimeType); // scanned PDF → vision
        } else {
          extracted = await this.ai.extractBloodMarkers(obj.base64, dto.mimeType);
        }
      }
    } catch (e) {
      this.logger.warn(`blood extract failed (document still saved): ${(e as Error).message}`);
      extracted = { values: {} };
    }
    this.logger.log(`blood extract: markersFound=${Object.keys(extracted.values).length} [${Object.keys(extracted.values).join(',')}]`);

    return {
      recordId: rec.id,
      aiEnabled: this.ai.enabled,
      extracted: extracted.values,
      markerCount: Object.keys(extracted.values).length,
      lab: extracted.lab ?? null,
      takenOn: extracted.takenOn ?? null,
      note: this.ai.enabled
        ? (Object.keys(extracted.values).length
            ? 'Values read from your report — please review each before saving.'
            : 'We could not read clear values from this file. Enter them manually below.')
        : 'AI reading is off — enter the values from your report manually below.',
    };
  }

  /** Delete a health record + its stored object, freeing vault space. */
  async deleteRecord(userId: string, id: string) {
    const rec = await this.prisma.medicalRecord.findFirst({ where: { id, userId } }) as
      ({ id: string; fileKey: string | null; fileUrl: string | null } | null);
    if (!rec) throw new NotFoundException('record not found');
    if (rec.fileKey) await this.storage.deleteHealthObject(rec.fileKey);
    else if (rec.fileUrl) await this.storage.deleteObject(this.storage.keyFromUrl(rec.fileUrl));
    await this.prisma.medicalRecord.delete({ where: { id } });
    return this.records(userId);
  }

  async onModuleInit(): Promise<void> {
    await this.ensureDoctors();
  }

  // ─────────────── blood tests (dated panels, with history) ───────────────
  async saveBloodTest(userId: string, dto: SaveBloodTestDto) {
    const test = await this.prisma.medicalBloodTest.create({
      data: {
        userId,
        takenOn: dto.takenOn ? new Date(dto.takenOn) : new Date(),
        lab: dto.lab ?? null,
        biomarkers: {
          create: Object.entries(dto.values)
            .filter(([, v]) => typeof v === 'number')
            .map(([key, value]) => ({ key, value: value as number })),
        },
      },
      include: { biomarkers: true },
    });
    // Pre-warm the AI health summary in the background so it's already cached by
    // the time the user opens Blood Test Analysis (loads instantly there).
    void this.healthSummary(userId).catch(() => undefined);
    return this.analyze(userId, test.id);
  }

  /** History of panels (newest first) with a compact summary of each. */
  async bloodTests(userId: string) {
    const tests = await this.prisma.medicalBloodTest.findMany({
      where: { userId }, orderBy: { takenOn: 'desc' }, include: { biomarkers: true },
    });
    return tests.map((t) => {
      const values = Object.fromEntries(t.biomarkers.map((b) => [b.key, b.value]));
      const flags = flagsFor(values);
      const abnormal = Object.entries(flags).filter(([, s]) => s !== 'normal');
      return {
        id: t.id, takenOn: t.takenOn.toISOString().slice(0, 10), lab: t.lab,
        markerCount: t.biomarkers.length,
        flagged: abnormal.map(([key, status]) => ({ key, label: ruleFor(key)?.label ?? key, status })),
        alertCount: criticalAlerts(values).length,
      };
    });
  }

  /** Full cited analysis of one panel + trend vs the previous panel. */
  async analyze(userId: string, testId: string) {
    const test = await this.prisma.medicalBloodTest.findFirst({
      where: { id: testId, userId }, include: { biomarkers: true },
    });
    if (!test) throw new NotFoundException('blood test not found');
    const values = Object.fromEntries(test.biomarkers.map((b) => [b.key, b.value]));
    const crp = values.crp;

    // previous panel for trend arrows
    const prev = await this.prisma.medicalBloodTest.findFirst({
      where: { userId, takenOn: { lt: test.takenOn } },
      orderBy: { takenOn: 'desc' }, include: { biomarkers: true },
    });
    const prevValues = prev ? Object.fromEntries(prev.biomarkers.map((b) => [b.key, b.value])) : {};

    const markers = MARKER_RULES.filter((r) => r.key in values).map((rule) => {
      const value = values[rule.key];
      const ev = evaluateMarker(rule, value, crp);
      const before = prevValues[rule.key];
      const trend = typeof before === 'number'
        ? (value > before ? 'up' : value < before ? 'down' : 'flat')
        : null;
      return {
        key: rule.key, label: rule.label, unit: rule.unit, value, range: `${rule.min}–${rule.max}`,
        status: ev.status, advice: ev.advice, caveat: ev.caveat, citations: ev.citations,
        trend, previous: typeof before === 'number' ? before : null,
      };
    });

    const flags = flagsFor(values);
    return {
      testId: test.id, takenOn: test.takenOn.toISOString().slice(0, 10), lab: test.lab,
      markers,
      alerts: criticalAlerts(values),
      conditions: triggeredConditions(flags).map((c) => ({ key: c.key, name: c.name, principles: c.principles, citations: cite(c.citations) })),
      disclaimer: 'Medical Hub is the source of truth for your records. This analysis is educational, grounded in established clinical-nutrition guidance — not a diagnosis. Confirm with your doctor.',
      sharesWith: 'With your consent, Nutrition, Beauty and Fitness read these biomarkers to personalise your plans.',
    };
  }

  /** Latest panel analysed (or empty). */
  async latest(userId: string) {
    const test = await this.prisma.medicalBloodTest.findFirst({
      where: { userId }, orderBy: { takenOn: 'desc' },
    });
    if (!test) return { markers: [], alerts: [], conditions: [], takenOn: null };
    return this.analyze(userId, test.id);
  }

  // ─────────────── AI Health Summary (deterministic score + AI narrative) ───────────────
  /**
   * A personal health report from the latest panel: a deterministic 0–100 score
   * and priority ranking (from the cited engine, so they're stable), plus a warm,
   * AI-written interpretation addressed to the person by name. Educational only.
   */
  async healthSummary(userId: string) {
    const disclaimer = 'An educational summary grounded in established clinical-nutrition guidance — not a diagnosis. Please review any flagged findings with your doctor.';
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
    const first = (user?.name ?? 'there').split(' ')[0];
    const test = await this.prisma.medicalBloodTest.findFirst({ where: { userId }, orderBy: { takenOn: 'desc' }, include: { biomarkers: true } });
    if (!test) {
      return { hasPanel: false, name: first, score: null, band: null, priorities: [], greeting: `Dear ${first},`, interpretation: [], relationships: [], discuss: [], encouragement: '', aiEnabled: this.ai.enabled, takenOn: null, lab: null, disclaimer };
    }
    // Read the ONE stored analysis for this test at the current version (runs the
    // AI only if it doesn't exist yet — never on a plain page load).
    const a = await this.getOrCreateAnalysis(userId, test, user?.name ?? 'there');
    return {
      hasPanel: true, name: first, score: a.healthScore, band: a.band, priorities: a.priorities,
      greeting: a.greeting, interpretation: a.interpretation, relationships: a.relationships,
      discuss: a.discuss, encouragement: a.encouragement,
      aiEnabled: this.ai.enabled, analysisVersion: a.analysisVersion,
      takenOn: test.takenOn.toISOString().slice(0, 10), lab: test.lab, disclaimer,
    };
  }

  /** Bump when the medical prompt or model changes → forces one re-analysis and
   *  a new stored version, keeping older versions for history. */
  private static readonly ANALYSIS_VERSION = 'v1';

  /** SHA-256 of the biomarker values — identical reports produce the same hash,
   *  so a re-upload of the same data reuses an existing analysis. */
  private reportHash(values: Record<string, number>): string {
    const canonical = Object.keys(values).sort().map((k) => `${k}:${values[k]}`).join('|');
    return createHash('sha256').update(canonical).digest('hex');
  }

  /**
   * The event-driven core: return the single stored analysis for this blood test
   * at the current version. The AI runs at most ONCE per (test, version):
   *   1. exact record for this test+version exists      → return it (no AI);
   *   2. an identical report (same hash+version) exists  → clone it (no AI);
   *   3. otherwise                                       → analyse once, store, return.
   */
  private async getOrCreateAnalysis(userId: string, test: { id: string; biomarkers: { key: string; value: number }[] }, fullName: string): Promise<StoredAnalysis> {
    const V = MedicalService.ANALYSIS_VERSION;
    const bloodAnalysis = (this.prisma as unknown as { bloodAnalysis: { findFirst: (a: unknown) => Promise<{ payload: string } | null>; create: (a: unknown) => Promise<unknown> } }).bloodAnalysis;

    const exact = await bloodAnalysis.findFirst({ where: { bloodTestId: test.id, analysisVersion: V } }).catch(() => null);
    if (exact?.payload) { try { return JSON.parse(exact.payload) as StoredAnalysis; } catch { /* regenerate */ } }

    const values = Object.fromEntries(test.biomarkers.map((b) => [b.key, b.value]));
    const hash = this.reportHash(values);

    const twin = await bloodAnalysis.findFirst({ where: { userId, reportHash: hash, analysisVersion: V } }).catch(() => null);
    if (twin?.payload) {
      try {
        const payload = JSON.parse(twin.payload) as StoredAnalysis;
        await this.storeAnalysis(userId, test.id, hash, payload).catch(() => undefined);
        return payload;
      } catch { /* regenerate */ }
    }

    const payload = await this.computeAnalysis(values, fullName, hash);
    await this.storeAnalysis(userId, test.id, hash, payload).catch(() => undefined);
    return payload;
  }

  private async storeAnalysis(userId: string, bloodTestId: string, reportHash: string, payload: StoredAnalysis): Promise<void> {
    const bloodAnalysis = (this.prisma as unknown as { bloodAnalysis: { create: (a: unknown) => Promise<unknown> } }).bloodAnalysis;
    await bloodAnalysis.create({
      data: {
        bloodTestId, userId, analysisVersion: payload.analysisVersion, model: payload.model,
        reportHash, healthScore: payload.healthScore, band: payload.band, payload: JSON.stringify(payload),
      },
    });
  }

  /** The single, complete analysis of one panel: deterministic score/priorities/
   *  markers/conditions/restrictions + the AI narrative. Runs the AI exactly once. */
  private async computeAnalysis(values: Record<string, number>, fullName: string, hash: string): Promise<StoredAnalysis> {
    const first = fullName.split(' ')[0];
    const crp = values.crp;
    const flags = flagsFor(values);
    const markers = MARKER_RULES.filter((r) => r.key in values).map((rule) => {
      const ev = evaluateMarker(rule, values[rule.key], crp);
      return { key: rule.key, label: rule.label, unit: rule.unit, value: values[rule.key], range: `${rule.min}–${rule.max}`, status: ev.status, advice: ev.advice };
    });
    const abnormal = markers.filter((m) => m.status !== 'normal');
    const alerts = criticalAlerts(values);
    const conditions = triggeredConditions(flags).map((c) => ({ key: c.key, name: c.name }));

    let score = 100 - abnormal.length * 8;
    for (const al of alerts) score -= al.urgent ? 18 : 12;
    score = Math.max(5, Math.min(100, Math.round(score)));
    const band = score >= 85 ? 'Excellent' : score >= 70 ? 'Good' : score >= 55 ? 'Fair' : 'Needs attention';

    const PRI: Record<string, { label: string; w: number }> = {
      hb: { label: 'Address low hemoglobin', w: 9 }, hba1c: { label: 'Optimise blood sugar control', w: 9 },
      trig: { label: 'Lower triglycerides', w: 8 }, ldl: { label: 'Lower LDL cholesterol', w: 7 },
      crp: { label: 'Reduce inflammation', w: 7 }, ferritin: { label: 'Rebuild iron stores', w: 6 },
      b12: { label: 'Correct low B12', w: 5 }, folate: { label: 'Increase folate', w: 5 }, vitd: { label: 'Improve vitamin D status', w: 4 },
    };
    const priorities = abnormal
      .map((m) => ({ label: PRI[m.key]?.label ?? `Review ${m.label}`, w: (PRI[m.key]?.w ?? 3) + (m.status === 'high' ? 1 : 0) }))
      .sort((a, b) => b.w - a.w).slice(0, 5).map((p) => p.label);

    // Meal restrictions for the recipe engine to consume (derived from flags).
    const REST: Record<string, string[]> = {
      hba1c: ['limit added sugar', 'fewer refined carbs', 'lower glycemic load'],
      ldl: ['limit saturated fat', 'more soluble fibre'],
      trig: ['limit added sugar & alcohol', 'more omega-3'],
      crp: ['anti-inflammatory pattern', 'less ultra-processed food'],
    };
    const mealRestrictions = [...new Set(abnormal.flatMap((m) => REST[m.key] ?? []))];

    // The one AI call — with deterministic fallbacks if AI is off / returns empty.
    const prompt = `Person: ${first}.\nMarkers:\n`
      + markers.map((m) => `- ${m.label}: ${m.value} ${m.unit} (ref ${m.range}) → ${m.status.toUpperCase()}`).join('\n')
      + (alerts.length ? `\nCritical alerts: ${alerts.map((al) => `${al.label} ${al.value}`).join('; ')}` : '')
      + (conditions.length ? `\nCondition patterns detected: ${conditions.map((c) => c.name).join(', ')}` : '')
      + `\nComputed overall score: ${score}/100 (${band}).`;
    const ai = await this.ai.clinicalInterpretation(prompt, fullName);

    const interpretation = ai.interpretation.length
      ? ai.interpretation
      : abnormal.length
        ? abnormal.map((m) => `${m.label} is ${m.status} at ${m.value} ${m.unit} (reference ${m.range}). ${m.advice}`)
        : ['All measured markers are within their reference ranges — a great baseline to maintain.'];
    const encouragement = ai.encouragement || (abnormal.length
      ? `These are all things you can move in the right direction, ${first}. Small, steady changes add up — and you've already taken the most important step by looking closely.`
      : `Lovely results, ${first} — everything's in range. Keep doing what you're doing.`);

    return {
      analysisVersion: MedicalService.ANALYSIS_VERSION,
      model: this.ai.enabled ? this.ai.bloodModelId : 'deterministic',
      reportHash: hash,
      analyzedAt: new Date().toISOString(),
      healthScore: score, band, confidence: alerts.length ? 'Review with a doctor' : abnormal.length ? 'High' : 'High',
      priorities, markers, conditions, mealRestrictions,
      greeting: ai.greeting || `Dear ${first},`,
      interpretation, relationships: ai.relationships,
      discuss: ai.discuss.length ? ai.discuss : (alerts.length ? alerts.map((al) => `${al.label} (${al.value})`) : []),
      encouragement,
    };
  }

  // ─────────────── per-user supplementation (transparent reasoning) ───────────────
  /**
   * How supplementation is suggested for a single user: take the latest panel →
   * derive flags → the cited engine proposes a goal-matched kit, upgraded by each
   * abnormal marker. We return the full reasoning chain (basis → items with the exact
   * trigger + citation) so the recommendation is explainable, not a black box.
   */
  async supplementPlan(userId: string) {
    const pref = await this.prisma.foodPref.findUnique({ where: { userId } });
    const goal = pref?.goal ?? 'maintain';

    const latest = await this.prisma.medicalBloodTest.findFirst({
      where: { userId }, orderBy: { takenOn: 'desc' }, include: { biomarkers: true },
    });
    const values = latest ? Object.fromEntries(latest.biomarkers.map((b) => [b.key, b.value])) : {};
    const flags = flagsFor(values);

    // Human-readable trigger for each flag-driven supplement.
    const triggerFor = (name: string): string => {
      const low = (k: string) => flags[k] === 'low';
      if (name.startsWith('Vitamin D3')) return low('vitd') ? `Low vitamin D (${values.vitd} ng/mL)` : '';
      if (name.startsWith('Vitamin B12')) return low('b12') ? `Low B12 (${values.b12} pg/mL)` : '';
      if (name.startsWith('Folate')) return low('folate') ? `Low folate (${values.folate} ng/mL)` : '';
      if (name.startsWith('Iron')) return (low('ferritin') || low('hb')) ? `Low iron stores (ferritin ${values.ferritin ?? '—'} ng/mL)` : '';
      if (name.startsWith('Omega-3')) return flags.trig === 'high' || flags.ldl === 'high' ? `Raised lipids (LDL ${values.ldl ?? '—'})` : 'General cardiometabolic support';
      return '';
    };
    const foodFirst: Record<string, string> = {
      'Vitamin D3': 'Food-first: oily fish, fortified dairy, 15 min midday sun.',
      'Vitamin B12': 'Food-first: eggs, dairy, fish; essential to supplement if plant-based.',
      'Folate (with B12)': 'Food-first: fresh dark-green vegetables and legumes (heat destroys folate).',
      'Iron + Vitamin C': 'Food-first: lean red meat, liver, legumes + a vitamin-C source; avoid tea/coffee with meals.',
    };

    const kit = supplementKit(goal, flags);
    const items = kit.map((s) => {
      const trigger = triggerFor(s.name) || (goal !== 'maintain' ? `Goal: ${goal === 'lose' ? 'weight loss' : 'muscle gain'}` : 'Everyday baseline');
      const ffKey = Object.keys(foodFirst).find((k) => s.name.startsWith(k));
      return {
        name: s.name, purpose: s.purpose, dose: s.dose, timing: s.timing, priceInr: s.priceInr,
        trigger, foodFirst: ffKey ? foodFirst[ffKey] : null, reference: s.reference ?? null,
        citations: cite(s.citations),
      };
    });

    const abnormal = Object.entries(flags).filter(([, s]) => s !== 'normal');
    return {
      basis: {
        goal,
        hasBloodTest: Boolean(latest),
        takenOn: latest ? latest.takenOn.toISOString().slice(0, 10) : null,
        flags: abnormal.map(([key, status]) => ({ key, label: ruleFor(key)?.label ?? key, status, value: values[key] })),
      },
      items,
      totalInr: items.reduce((sum, i) => sum + i.priceInr, 0),
      safety: 'Suggestions are food-first and consumer-level, grounded in established clinical-nutrition guidance — not a prescription. Confirm doses with your doctor, especially with medication, pregnancy, or a diagnosed condition. Do not take iron if ferritin is high.',
    };
  }

  // ─────────────── medical records ───────────────
  async records(userId: string) {
    const rows = await this.prisma.medicalRecord.findMany({
      where: { userId }, orderBy: { recordedOn: 'desc' },
    });
    return rows.map((r) => {
      const rr = r as typeof r & { fileKey?: string | null; mimeType?: string | null; sizeBytes?: number | null };
      return {
        id: r.id, kind: r.kind, title: r.title, detail: r.detail,
        // Health docs are private: expose only whether a file exists, not a URL.
        // The client fetches a short-lived signed link from /records/:id/file.
        hasFile: Boolean(rr.fileKey || r.fileUrl),
        mimeType: rr.mimeType ?? null, sizeBytes: rr.sizeBytes ?? 0,
        recordedOn: r.recordedOn.toISOString().slice(0, 10),
      };
    });
  }

  async addRecord(userId: string, dto: {
    kind: string; title: string; detail?: string; fileUrl?: string; recordedOn?: string;
  }) {
    await this.prisma.medicalRecord.create({
      data: {
        userId, kind: dto.kind, title: dto.title, detail: dto.detail ?? null, fileUrl: dto.fileUrl ?? null,
        recordedOn: dto.recordedOn ? new Date(dto.recordedOn) : new Date(),
      },
    });
    return this.records(userId);
  }

  // ─────────────── consults (book a doctor → real chat) ───────────────
  async doctors() {
    const rows = await this.prisma.doctor.findMany({
      include: { user: { select: { id: true, handle: true, name: true, profileImage: true } } },
    });
    return rows.map((d) => ({
      id: d.id, name: d.user.name, handle: d.user.handle, specialty: d.specialty,
      hospital: d.hospital, languages: d.languages.split(',').filter(Boolean), rating: d.rating, priceInr: d.priceInr,
    }));
  }

  async consults(userId: string) {
    const rows = await this.prisma.consult.findMany({
      where: { userId }, orderBy: { createdAt: 'desc' },
      include: { doctor: { include: { user: { select: { name: true } } } } },
    });
    return rows.map((c) => ({
      id: c.id, doctorName: c.doctor.user.name, specialty: c.doctor.specialty,
      reason: c.reason, status: c.status, conversationId: c.conversationId,
      scheduledAt: c.scheduledAt ? c.scheduledAt.toISOString() : null,
      createdAt: c.createdAt.toISOString(),
    }));
  }

  /** Booking creates an ACCEPTED DOCTOR_PATIENT connection and opens the chat. */
  async bookConsult(userId: string, dto: { doctorId: string; reason?: string; scheduledAt?: string; method?: 'wallet' | 'card' }) {
    const doctor = await this.prisma.doctor.findUnique({ where: { id: dto.doctorId } });
    if (!doctor) throw new NotFoundException('doctor not found');
    const [userOneId, userTwoId] = [userId, doctor.userId].sort();
    await this.prisma.connection.upsert({
      where: { userOneId_userTwoId_connectionType: { userOneId, userTwoId, connectionType: 'DOCTOR_PATIENT' } },
      update: { status: 'ACCEPTED' },
      create: { userOneId, userTwoId, connectionType: 'DOCTOR_PATIENT', status: 'ACCEPTED', requestedById: userId },
    });
    // Unified payment: charge the consult fee to the one city wallet.
    await this.financial.charge(userId, { hub: 'Medical', category: 'medical', label: `Consult — ${doctor.specialty.split(' ·')[0]}`, amountInr: doctor.priceInr, method: dto.method });
    const conversation = await this.conversations.startDirect(userId, doctor.userId);
    const consult = await this.prisma.consult.create({
      data: {
        userId, doctorId: doctor.id, reason: dto.reason ?? null,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null, conversationId: conversation.id,
      },
    });
    return { consultId: consult.id, conversationId: conversation.id };
  }

  // ─────────────── consent core ───────────────
  /** Consent per hub (defaults created granted=true the first time). */
  async consents(userId: string) {
    const existing = await this.prisma.medicalConsent.findMany({ where: { userId } });
    const byHub = new Map(existing.map((c) => [c.hub, c]));
    const out = [];
    for (const h of CONSENT_HUBS) {
      let row = byHub.get(h.hub);
      if (!row) row = await this.prisma.medicalConsent.create({ data: { userId, hub: h.hub, granted: true } });
      out.push({ hub: h.hub, label: h.label, reads: h.reads, granted: row.granted, updatedAt: row.updatedAt.toISOString() });
    }
    return out;
  }

  async setConsent(userId: string, hub: string, granted: boolean) {
    await this.prisma.medicalConsent.upsert({
      where: { userId_hub: { userId, hub } },
      update: { granted },
      create: { userId, hub, granted },
    });
    return this.consents(userId);
  }

  /** The consent gate other hubs call: returns biomarkers only if the hub is permitted. */
  async sharedBiomarkers(userId: string, hub: string) {
    const consent = await this.prisma.medicalConsent.findUnique({ where: { userId_hub: { userId, hub } } });
    const granted = consent ? consent.granted : true; // default-allow same-app hubs until revoked
    if (!granted) throw new ForbiddenException(`${hub} does not have consent to read your medical biomarkers`);
    const latest = await this.prisma.medicalBloodTest.findFirst({
      where: { userId }, orderBy: { takenOn: 'desc' }, include: { biomarkers: true },
    });
    return {
      hub, granted: true,
      takenOn: latest ? latest.takenOn.toISOString().slice(0, 10) : null,
      values: latest ? Object.fromEntries(latest.biomarkers.map((b) => [b.key, b.value])) : {},
    };
  }

  private async ensureDoctors(): Promise<void> {
    // Demo doctors are fake people (real User accounts). Off by default so the
    // consult list is empty until real providers are added. Set SEED_DEMO=true to restore.
    if (process.env.SEED_DEMO !== 'true') return;
    try {
      if ((await this.prisma.doctor.count()) > 0) return;
    } catch { return; }
    const seed = [
      { handle: 'dr_narang', name: 'Dr. Anjali Narang', specialty: 'General physician · internal medicine', hospital: 'Fortis', languages: 'English,Hindi', rating: 4.9, priceInr: 699 },
      { handle: 'dr_iyer', name: 'Dr. Rohan Iyer', specialty: 'Endocrinology · diabetes & thyroid', hospital: 'Apollo', languages: 'English,Hindi,Tamil', rating: 4.8, priceInr: 1199 },
      { handle: 'dr_khan', name: 'Dr. Sara Khan', specialty: 'Haematology · anaemia & iron', hospital: 'Manipal', languages: 'English,Hindi,Urdu', rating: 4.9, priceInr: 1099 },
    ];
    for (const d of seed) {
      const user = await this.prisma.user.upsert({
        where: { handle: d.handle }, update: {},
        create: { handle: d.handle, name: d.name, passwordHash: randomBytes(24).toString('hex') },
      });
      await this.prisma.doctor.create({
        data: { userId: user.id, specialty: d.specialty, hospital: d.hospital, languages: d.languages, rating: d.rating, priceInr: d.priceInr },
      });
    }
  }
}
