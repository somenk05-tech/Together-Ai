import { swallow } from '../shared/swallow';
import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { checkCollectionDate } from './collection-date';
import { pageLimit } from '../shared/paging';
import { toCanonical, unitChoices } from './units';
import { informalName, salutation } from '../shared/salutation';
import { demoDataEnabled } from '../shared/demo-data';
import { createHash, randomBytes } from 'crypto';
import { PDFParse } from 'pdf-parse';
import { PrismaService } from '../shared/prisma/prisma.service';
import { ClockService } from '../shared/clock/clock.service';
import { RECORD_CAP , ORDER_HISTORY_CAP } from '../shared/paging';
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
import { BIOMARKER_SECTIONS, biomarkerDef } from './biomarker-catalog';
import { parseReportText, type PrintedRange } from './report-parser';
import { panelBand, panelScore, panelScoreBasis } from './panel-score';
import { basisFor, formatRange, inRangeSummary, panelRangeNote, statusAgainst } from './range-basis';
import { normalizeReportImage } from './image-normalize';

const cite = (ids: string[]) => ids.map((id) => CITATIONS[id]).filter(Boolean);

/** The complete, stored analysis of one blood test at one version — the single
 *  source of truth every hub reads (no hub re-runs the AI). */
interface StoredAnalysis {
  analysisVersion: string;
  model: string;
  reportHash: string;
  analyzedAt: string;
  healthScore: number;
  /** Plain-English statement of what healthScore actually counts. Shown to the
   *  citizen next to the number — a score with no stated basis is a claim. */
  scoreBasis: string;
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

/** Longitudinal biomarker trend across ≥2 dated panels. */
export type Trend = 'improving' | 'worsening' | 'stable' | 'newly-abnormal' | 'returned-normal';
export interface MarkerTrend {
  key: string; label: string; unit: string; range: string; min: number; max: number;
  points: { date: string; value: number; status: string }[];
  first: number; latest: number; deltaAbs: number; deltaLabel: string;
  direction: 'up' | 'down' | 'flat'; trend: Trend; trendLabel: string;
  latestStatus: string; severityChange: number;
}

/**
 * Classify a biomarker's trend across its chronological points by how far the
 * value sits OUTSIDE its healthy range (0 when in range). A falling "severity"
 * means the value moved toward healthy — whichever direction is the bad one — so
 * this reads correctly for "high is bad" markers (LDL, HbA1c) and "low is bad"
 * ones (vitamin D, B12) alike. A crossing into/out of range is called explicitly.
 */
export function classifyTrend(
  rule: { min: number; max: number },
  points: { value: number; status: string }[],
): { trend: Trend; severityChange: number } {
  const severity = (v: number) => (v < rule.min ? rule.min - v : v > rule.max ? v - rule.max : 0);
  const first = points[0], last = points[points.length - 1];
  const dSev = severity(last.value) - severity(first.value);
  const eps = 0.03 * Math.max(1, rule.max - rule.min);
  let trend: Trend;
  if (first.status !== 'normal' && last.status === 'normal') trend = 'returned-normal';
  else if (first.status === 'normal' && last.status !== 'normal') trend = 'newly-abnormal';
  else if (dSev < -eps) trend = 'improving';
  else if (dSev > eps) trend = 'worsening';
  else trend = 'stable';
  return { trend, severityChange: Math.round(dSev * 100) / 100 };
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
    private readonly clock: ClockService,
  ) {}

  private readonly logger = new Logger(MedicalService.name);

  /** Extract plain text from a (text-based) PDF report. `locked` marks a
   *  password-protected PDF — common for Indian lab portals — so the caller can
   *  tell the user exactly what to do instead of a generic "couldn't read". */
  private async pdfToText(buf: Buffer): Promise<{ text: string; locked: boolean }> {
    try {
      const res = await new PDFParse({ data: new Uint8Array(buf) }).getText();
      return { text: res.text ?? '', locked: false };
    } catch (e) {
      const msg = (e as Error).message ?? '';
      this.logger.warn(`PDF text extraction failed: ${msg}`);
      return { text: '', locked: /password|encrypt/i.test(msg) };
    }
  }

  /**
   * The ONE reading pipeline for an uploaded blood report, layered so a single
   * failure never sends the user to manual entry:
   *   PDF  → text extraction → AI-on-text → (0 markers?) AI vision on the PDF
   *          → (still 0?) deterministic text parser (works with AI off/failing)
   *   image→ normalise (HEIC/TIFF→JPEG, downscale >4MB) → AI vision
   * The document itself is already filed by the caller, so this never throws.
   */
  private async readReportFromVault(fileKey: string, mimeType: string): Promise<{
    values: Record<string, number>; ranges?: Record<string, PrintedRange>; lab?: string; takenOn?: string;
    via: 'ai-text' | 'ai-vision' | 'parser' | 'none'; locked: boolean;
  }> {
    let extracted: { values: Record<string, number>; ranges?: Record<string, PrintedRange>; lab?: string; takenOn?: string } = { values: {} };
    let via: 'ai-text' | 'ai-vision' | 'parser' | 'none' = 'none';
    let locked = false;
    try {
      const obj = await this.storage.getHealthObjectBase64(fileKey);
      if (!obj) return { values: {}, via, locked };
      if (mimeType === 'application/pdf') {
        const pdf = await this.pdfToText(Buffer.from(obj.base64, 'base64'));
        locked = pdf.locked;
        const text = pdf.text.trim();
        this.logger.log(`blood read: pdf textLen=${text.length} locked=${locked} aiEnabled=${this.ai.enabled}`);
        if (text && this.ai.enabled) {
          extracted = await this.ai.extractMarkersFromText(text);
          via = 'ai-text';
        }
        if (!Object.keys(extracted.values).length && this.ai.enabled && !locked) {
          // Scanned PDF, or the text came out too jumbled to read — let the
          // vision model look at the pages themselves.
          extracted = await this.ai.extractBloodMarkers(obj.base64, mimeType);
          via = 'ai-vision';
        }
        if (!Object.keys(extracted.values).length && text) {
          // AI off / out of credits / failed → deterministic parse of the text.
          const parsed = parseReportText(text);
          if (Object.keys(parsed.values).length) { extracted = parsed; via = 'parser'; }
        } else if (text && !extracted.ranges) {
          // VALUES from whichever extractor read them best; REFERENCE RANGES
          // from the parser, always, whenever there is text to parse.
          //
          // The parser is the deterministic half of this pipeline and usually
          // the half that does not run — the AI reads the values first and the
          // parser is only a fallback. But the interval is the thing the parser
          // is BETTER at: a fixed pattern on a fixed row, and the AI is
          // explicitly instructed to ignore ranges precisely so it cannot
          // confuse one with a value. So it runs anyway and contributes only
          // the intervals, and only for markers the values already cover.
          const parsed = parseReportText(text);
          if (parsed.ranges) {
            const forFound: Record<string, PrintedRange> = {};
            for (const [k, r] of Object.entries(parsed.ranges)) {
              if (extracted.values[k] !== undefined) forFound[k] = r;
            }
            if (Object.keys(forFound).length) {
              extracted = { ...extracted, ranges: forFound };
              this.logger.log(`blood read: parser supplied ${Object.keys(forFound).length} printed range(s) [${Object.keys(forFound).join(',')}]`);
            }
          }
        }
      } else {
        const img = await normalizeReportImage(obj.base64, mimeType || obj.contentType);
        if (img.changed) this.logger.log(`blood read: image normalised ${mimeType} → ${img.mediaType}`);
        extracted = await this.ai.extractBloodMarkers(img.base64, img.mediaType);
        via = 'ai-vision';
      }
    } catch (e) {
      this.logger.warn(`blood read failed (document still saved): ${(e as Error).message}`);
      extracted = { values: {} };
    }
    const count = Object.keys(extracted.values).length;
    if (count === 0) via = 'none';
    this.logger.log(`blood read: via=${via} markersFound=${count} [${Object.keys(extracted.values).join(',')}]`);
    return { ...extracted, via, locked };
  }

  /** User-facing note when a report was filed but no values could be read. */
  private unreadableNote(locked: boolean): string {
    if (locked) {
      return 'Saved to your records, but this PDF is password-protected so it can’t be read automatically. Remove the password or upload a photo of the report — or enter the values below.';
    }
    return this.ai.enabled
      ? 'Saved to your records, but we couldn’t read clear values from this file — enter them below to analyse.'
      : 'AI reading is off — enter the values from your report below to analyse.';
  }

  /** Shared 10 GB vault: total bytes = mail + health documents. */
  private readonly quotaBytes = 10 * 1024 * 1024 * 1024;

  async storageUsage(userId: string) {
    // ONE 10 GB vault per account — mail + health documents + drive files all
    // draw from the same allowance, so this must count drive usage too.
    const [mail, docs, drive] = await Promise.all([
      // unbounded: the storage meter SUMS every row — truncating undercounts the vault
      this.prisma.mailMessage.findMany({ where: { ownerId: userId }, select: { sizeBytes: true } }),
      // unbounded: same meter, the medical documents' share of it
      this.prisma.medicalRecord.findMany({ where: { userId }, select: { sizeBytes: true } }) as Promise<Array<{ sizeBytes: number }>>,
      // A failed aggregate reported 0 bytes used — an absence never
      // established, on a storage meter. Same fallback, now witnessed.
      swallow((this.prisma as unknown as {
        driveFile: { aggregate(a: unknown): Promise<{ _sum: { sizeBytes: number | null } }> };
      }).driveFile.aggregate({ where: { ownerId: userId }, _sum: { sizeBytes: true } }), 'storage meter: drive usage', { userId })
        .then((r) => r ?? { _sum: { sizeBytes: 0 } }),
    ]);
    const mailBytes = mail.reduce((s, m) => s + (m.sizeBytes ?? 0), 0);
    const healthBytes = docs.reduce((s, d) => s + (d.sizeBytes ?? 0), 0);
    const driveBytes = drive._sum.sizeBytes ?? 0;
    const usedBytes = mailBytes + healthBytes + driveBytes;
    return {
      quotaBytes: this.quotaBytes,
      usedBytes,
      mailBytes,
      healthBytes,
      driveBytes,
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
  /**
   * The key comes from the client (it is handed out by the presign route), so
   * it is checked against the caller's own vault prefix before any record is
   * filed against it. Drive's confirm() has always done this; the health vault
   * did not, which left a shape where a record could point at another
   * citizen's document and the download and delete routes would honour it.
   */
  private assertOwnHealthKey(userId: string, fileKey: string): void {
    if (!StorageProvider.isOwnHealthKey(userId, fileKey)) {
      throw new BadRequestException('That upload does not belong to your health vault.');
    }
  }

  async addDocument(userId: string, dto: {
    kind: string; title: string; detail?: string; fileKey: string; mimeType?: string; sizeBytes: number;
  }) {
    await this.assertQuota(userId, dto.sizeBytes);
    this.assertOwnHealthKey(userId, dto.fileKey);
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
      },
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
    this.assertOwnHealthKey(userId, dto.fileKey);
    if (!(await this.storage.healthObjectExists(dto.fileKey))) {
      throw new BadRequestException('Your report didn’t finish uploading — please check your connection and try again.');
    }
    // file the document in the private vault (key only, no public URL)
    const rec = await this.prisma.medicalRecord.create({
      data: {
        userId, kind: 'blood-test', title: dto.title || 'Blood report', detail: 'Uploaded blood report',
        fileUrl: null, fileKey: dto.fileKey, mimeType: dto.mimeType, sizeBytes: dto.sizeBytes,
        recordedOn: new Date(),
      },
    });

    // Read it back from the private vault via the shared layered pipeline
    // (AI text → AI vision → deterministic parser). Extraction is best-effort:
    // the document is already safely filed above, so a reading failure must
    // never fail the request — the user just enters values manually.
    const read = await this.readReportFromVault(dto.fileKey, dto.mimeType);
    const markerCount = Object.keys(read.values).length;

    return {
      recordId: rec.id,
      aiEnabled: this.ai.enabled,
      extracted: read.values,
      markerCount,
      lab: read.lab ?? null,
      takenOn: read.takenOn ?? null,
      note: markerCount
        ? 'Values read from your report — please review each before saving.'
        : this.unreadableNote(read.locked),
    };
  }

  /** Delete a health record + its stored object, freeing vault space. */
  /**
   * Delete a health document — and, when that document produced a blood panel,
   * the panel with it.
   *
   * The panel used to survive. Uploading a report creates exactly one
   * MedicalBloodTest (see upsertPanelAndAnalyze), and the ONLY way to remove a
   * report was this method, which deleted the document and the stored file and
   * left the panel behind. So a citizen who deleted a blood report still saw its
   * markers in Blood Test Analysis and still had it counted in "your health over
   * time" — with no document left anywhere in the app to explain where the
   * numbers came from, and no route by which they could ever be removed.
   *
   * Deleting the panel takes its biomarkers and cached analyses with it: both
   * cascade from MedicalBloodTest.
   */
  async deleteRecord(userId: string, id: string) {
    const rec = await this.prisma.medicalRecord.findFirst({ where: { id, userId } }) as
      ({ id: string; fileKey: string | null; fileUrl: string | null; bloodTestId: string | null } | null);
    if (!rec) throw new NotFoundException('record not found');
    if (rec.fileKey) await this.storage.deleteHealthObject(rec.fileKey);
    else if (rec.fileUrl) await this.storage.deleteObject(this.storage.keyFromUrl(rec.fileUrl));

    // One transaction: a document without its panel, or a panel without its
    // document, are both worse than either deletion not happening at all.
    await this.prisma.$transaction(async (tx) => {
      // deleteMany with the owner in the query, not delete by id: the row was
      // read scoped a few lines up, and saying so again costs nothing.
      await tx.medicalRecord.deleteMany({ where: { id, userId } });
      if (rec.bloodTestId) {
        // deleteMany, scoped by userId, so ownership is enforced by the query
        // rather than assumed from the document that pointed at it.
        await tx.medicalBloodTest.deleteMany({ where: { id: rec.bloodTestId, userId } });
      }
    });
    return this.records(userId);
  }

  /**
   * Delete a blood panel directly.
   *
   * Panels typed in by hand never had a source document, so before this there
   * was no way to remove one at all — the only delete in the hub was the
   * document delete above. The source document, if there is one, is kept and
   * simply detached: the citizen asked to remove the numbers, not the report
   * they came from.
   */
  async deleteBloodTest(userId: string, id: string): Promise<{ ok: true }> {
    const owned = await this.prisma.medicalBloodTest.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!owned) throw new NotFoundException('blood test not found');

    await this.prisma.$transaction(async (tx) => {
      await tx.medicalRecord.updateMany({ where: { userId, bloodTestId: id }, data: { bloodTestId: null } });
      await tx.medicalBloodTest.deleteMany({ where: { id, userId } });
    });
    return { ok: true };
  }

  async onModuleInit(): Promise<void> {
    await this.ensureDoctors();
  }

  // ─────────────── blood tests (dated panels, with history) ───────────────
  /**
   * The SINGLE path every panel (uploaded or hand-typed) funnels through, so
   * Blood Test Analysis and Health Records always show the same record. Given a
   * set of marker values and (optionally) the source document, it either creates
   * a new dated panel or — when that document already produced one — replaces
   * that panel's markers IN PLACE and drops the stale analysis so it re-runs.
   * There is never more than one panel per uploaded report. Returns the panel id.
   */
  private async upsertPanelAndAnalyze(
    userId: string,
    input: {
      values: Record<string, number>;
      /** The unit each value was printed in, where it is not the catalog's. */
      units?: Record<string, string> | null;
      /** The interval the citizen's own lab printed, in the same unit as the
       *  value beside it. Optional and best-effort: a panel must never fail to
       *  save because a range could not be read. */
      ranges?: Record<string, PrintedRange> | null;
      lab?: string | null; takenOn?: Date; recordId?: string | null;
    },
  ): Promise<string> {
    /**
     * Convert to the unit the reference range is stated in, and keep what was
     * printed.
     *
     * Before this, a value was stored bare and compared against a range in a
     * unit nobody had confirmed. A report in SI units — most of the world — was
     * read as if it were in the catalog's unit, so vitamin D of 30 nmol/L
     * (deficient, 12 ng/mL) came back normal and a fasting glucose of 7 mmol/L
     * (diabetic, 126 mg/dL) came back low. Those values reach the flags, the
     * health score, the narrative, and the nutrition targets.
     *
     * A unit we cannot read stops the save. Storing the number and hoping is
     * the failure above with an extra step.
     */
    const biomarkers: {
      key: string; value: number; enteredValue: number; enteredUnit: string;
      refLow?: number | null; refHigh?: number | null;
    }[] = [];
    for (const [key, raw] of Object.entries(input.values)) {
      if (typeof raw !== 'number' || Number.isNaN(raw)) continue;
      const printed = input.units?.[key];
      const conv = toCanonical(key, raw, printed);
      if (!conv.ok) {
        throw new BadRequestException(`${biomarkerDef(key)?.label ?? key}: ${conv.reason}`);
      }
      // The printed interval goes through the SAME toCanonical() call, with the
      // same unit, or it is not stored. A bound converted differently from the
      // value beside it is worse than no bound at all — it would sit on the
      // marker row looking like the citizen's own lab's opinion.
      //
      // A range that will not convert is dropped, never raised: the value is
      // the thing that must reach the record, and refusing to save a panel
      // because its reference column was unreadable would be the tail wagging.
      let refLow: number | null = null;
      let refHigh: number | null = null;
      const printedRange = input.ranges?.[key];
      if (printedRange) {
        const lo = printedRange.low === null ? null : toCanonical(key, printedRange.low, printed);
        const hi = printedRange.high === null ? null : toCanonical(key, printedRange.high, printed);
        const loOk = lo === null || lo.ok;
        const hiOk = hi === null || hi.ok;
        if (loOk && hiOk) {
          refLow = lo === null ? null : (lo as { value: number }).value;
          refHigh = hi === null ? null : (hi as { value: number }).value;
        }
      }
      biomarkers.push({
        key,
        value: conv.value,
        refLow,
        refHigh,
        // Kept whether or not a conversion happened, so a row can always say
        // what it was given rather than only when the answer was interesting.
        enteredValue: raw,
        enteredUnit: printed?.trim() || conv.unit,
      });
    }

    // A sample cannot have been drawn in the future. Checked server-side against
    // the CITIZEN'S today, because panels are ordered by collection date and a
    // future-dated one becomes "your latest" — which drives the health summary,
    // the marker flags, and through those the nutrition targets.
    const today = await this.clock.dateOnlyFor(userId);
    const when = checkCollectionDate(input.takenOn, today);
    if (!when.ok) throw new BadRequestException(when.reason);
    const takenOn = when.value;

    // Does the source document already have a panel? If so, update that one.
    let existingTestId: string | null = null;
    if (input.recordId) {
      const rec = await this.prisma.medicalRecord.findFirst({ where: { id: input.recordId, userId } }) as
        ({ id: string; bloodTestId: string | null } | null);
      if (rec?.bloodTestId) {
        const owned = await this.prisma.medicalBloodTest.findFirst({ where: { id: rec.bloodTestId, userId } });
        if (owned) existingTestId = owned.id;
      }
    }

    if (existingTestId) {
      // Replace markers atomically + clear cached analyses so the next read
      // re-analyses against the corrected values (same id → both pages stay in sync).
      await this.prisma.medicalBloodTest.update({
        where: { id: existingTestId },
        data: {
          lab: input.lab ?? undefined,
          takenOn,
          biomarkers: { deleteMany: {}, create: biomarkers },
        },
      });
      // A failed delete keeps a STALE cached interpretation alive next to the
      // new panel — the reader would show old conclusions about new numbers.
      await swallow((this.prisma as unknown as { bloodAnalysis: { deleteMany: (a: unknown) => Promise<unknown> } })
        .bloodAnalysis.deleteMany({ where: { bloodTestId: existingTestId, userId } }), 'retire stale blood analyses', { userId });
      void swallow(this.healthSummary(userId), 'pre-warm health summary', { userId });
      return existingTestId;
    }

    const test = await this.prisma.medicalBloodTest.create({
      data: {
        userId,
        // The day the sample was drawn, not the instant this row was written.
        // Defaulting to `new Date()` stored an instant, so a panel saved at
        // 01:00 in Asia/Kolkata was filed under the previous day — and the
        // column then meant two different things depending on the row.
        takenOn,
        lab: input.lab ?? null,
        biomarkers: { create: biomarkers },
      },
    });
    // Link the source document to this panel so both surfaces reference one record.
    if (input.recordId) {
      // updateMany + userId, never update-by-id: the ownership read above only
      // decides the update-in-place branch, so a recordId belonging to someone
      // else falls through to here. Scoping the write means a foreign id
      // matches nothing instead of stamping this panel onto their record.
      // If this fails the uploaded report never links to its panel and the
      // reader shows a document with no analysis — silently, until now.
      await swallow(this.prisma.medicalRecord
        .updateMany({ where: { id: input.recordId, userId }, data: { bloodTestId: test.id } }),
        'link record to blood test', { userId, recordId: input.recordId });
    }
    // Pre-warm the AI health summary so Blood Test Analysis opens instantly.
    void swallow(this.healthSummary(userId), 'pre-warm health summary', { userId });
    return test.id;
  }

  async saveBloodTest(userId: string, dto: SaveBloodTestDto & { recordId?: string }) {
    const values = Object.fromEntries(
      Object.entries(dto.values).filter(([k, v]) => typeof v === 'number' && !Number.isNaN(v) && biomarkerDef(k)),
    ) as Record<string, number>;
    const testId = await this.upsertPanelAndAnalyze(userId, {
      values, units: dto.units ?? null, lab: dto.lab ?? null,
      takenOn: dto.takenOn ? new Date(dto.takenOn) : undefined,
      recordId: dto.recordId ?? null,
    });
    return this.analyze(userId, testId);
  }

  /**
   * Upload → analyse in ONE step. Files the report once in the private vault,
   * reads its markers (text PDF or vision), and — if any were read — auto-creates
   * the linked panel and runs the analysis immediately. The same stored record is
   * referenced by both Health Records and Blood Test Analysis; the user never
   * uploads twice or triggers the analysis separately. If nothing readable is
   * found the document is still saved and the caller can collect values manually
   * (passing recordId back so the manual panel links to this same file).
   */
  async ingestBloodReport(userId: string, dto: {
    fileKey: string; mimeType: string; sizeBytes: number; title?: string; detail?: string;
  }) {
    await this.assertQuota(userId, dto.sizeBytes);
    this.assertOwnHealthKey(userId, dto.fileKey);
    if (!(await this.storage.healthObjectExists(dto.fileKey))) {
      throw new BadRequestException('Your report didn’t finish uploading — please check your connection and try again.');
    }
    const rec = await this.prisma.medicalRecord.create({
      data: {
        userId, kind: 'blood-test', title: dto.title || 'Blood report', detail: dto.detail || 'Uploaded blood report',
        fileUrl: null, fileKey: dto.fileKey, mimeType: dto.mimeType, sizeBytes: dto.sizeBytes, recordedOn: new Date(),
      },
    });

    const extracted = await this.readReportFromVault(dto.fileKey, dto.mimeType);

    const values = Object.fromEntries(
      Object.entries(extracted.values).filter(([k, v]) => typeof v === 'number' && !Number.isNaN(v as number) && biomarkerDef(k)),
    ) as Record<string, number>;
    const markerCount = Object.keys(values).length;

    if (markerCount === 0) {
      return {
        recordId: rec.id, bloodTestId: null as string | null, aiEnabled: this.ai.enabled,
        extracted: {} as Record<string, number>, markerCount: 0,
        lab: extracted.lab ?? null, takenOn: extracted.takenOn ?? null,
        analysis: null as Awaited<ReturnType<MedicalService['analyze']>> | null,
        summary: null as Awaited<ReturnType<MedicalService['healthSummary']>> | null,
        note: this.unreadableNote(extracted.locked),
      };
    }

    const takenOnDate = extracted.takenOn ? new Date(extracted.takenOn) : new Date();
    const testId = await this.upsertPanelAndAnalyze(userId, {
      values, ranges: extracted.ranges ?? null, lab: extracted.lab ?? null,
      takenOn: Number.isNaN(takenOnDate.getTime()) ? new Date() : takenOnDate,
      recordId: rec.id,
    });
    // Respond as soon as the deterministic analysis is ready. The AI narrative
    // summary takes tens of seconds on a first read — it is already pre-warming
    // in the background (kicked off inside upsertPanelAndAnalyze), and the
    // client's summary query fetches it when it lands. Blocking the upload
    // response on it pushed total time past browser/client timeouts, which
    // surfaced as "Could not reach the server" even though reading succeeded.
    const analysis = await this.analyze(userId, testId);
    return {
      recordId: rec.id, bloodTestId: testId, aiEnabled: this.ai.enabled,
      extracted: values, markerCount, lab: extracted.lab ?? null, takenOn: extracted.takenOn ?? null,
      analysis, summary: null as Awaited<ReturnType<MedicalService['healthSummary']>> | null,
      note: `Read ${markerCount} marker${markerCount === 1 ? '' : 's'} from your report and analysed it automatically.`,
    };
  }

  /** History of panels (newest first) with a compact summary of each. */
  /**
   * The citizen's panels, newest first, a page at a time (BE-5.2).
   *
   * This was an unbounded findMany that also pulled every biomarker on every
   * panel — so the response grew with the person's medical history and had no
   * point at which it stopped. shared/paging.ts already named this endpoint as
   * one that wanted real pagination rather than a ceiling; this is that.
   *
   * Ordered by [takenOn desc, id desc], and the second key is not decoration.
   * A cursor needs a total order to sit in: with takenOn alone, two panels
   * collected on the same day tie, and rows either repeat across pages or
   * vanish between them depending on how the database breaks the tie that time.
   * Two panels on one day is not an edge case — it is what a full blood workup
   * split across two labs looks like.
   *
   * `total` is returned because the count is read as a fact elsewhere ("12
   * panels", the timeline, the records header). Without it those would quietly
   * start reporting the size of the first page instead of the size of the
   * history, which is the kind of silently-wrong number this whole review is
   * about.
   */
  async bloodTests(userId: string, opts?: { cursor?: string | null; limit?: unknown }) {
    const take = pageLimit(opts?.limit, 25, 100);
    const [rows, total] = await Promise.all([
      this.prisma.medicalBloodTest.findMany({
        where: { userId },
        orderBy: [{ takenOn: 'desc' }, { id: 'desc' }],
        take: take + 1, // one extra: its existence is what says there is a next page
        ...(opts?.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
        include: { biomarkers: true },
      }),
      this.prisma.medicalBloodTest.count({ where: { userId } }),
    ]);
    const hasMore = rows.length > take;
    const tests = hasMore ? rows.slice(0, take) : rows;
    const items = tests.map((t) => {
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
    return { items, total, nextCursor: hasMore ? tests[tests.length - 1].id : null };
  }

  /** Full cited analysis of one panel + trend vs the previous panel. */
  async analyze(userId: string, testId: string) {
    const test = await this.prisma.medicalBloodTest.findFirst({
      where: { id: testId, userId }, include: { biomarkers: true },
    });
    if (!test) throw new NotFoundException('blood test not found');
    const values = Object.fromEntries(test.biomarkers.map((b) => [b.key, b.value]));
    // The interval this citizen's own lab printed, where one was stored. Absent
    // for every panel taken before BE-3.2b, which is exactly what basisFor()
    // reads as 'general-adult' — the caveat stays on those and lifts on these.
    const own = Object.fromEntries(
      (test.biomarkers as Array<{ key: string; refLow?: number | null; refHigh?: number | null }>)
        .map((b) => [b.key, { low: b.refLow ?? null, high: b.refHigh ?? null }]),
    ) as Record<string, { low: number | null; high: number | null }>;
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
        key: rule.key, label: rule.label, unit: rule.unit, value,
        // The citizen's own interval wins when there is one. It was produced by
        // the lab that ran the test, so it already accounts for their sex, their
        // age and that assay — the three things our single adult band cannot.
        range: basisFor(own[rule.key]) === 'own-report' ? formatRange(own[rule.key]) : `${rule.min}–${rule.max}`,
        rangeBasis: basisFor(own[rule.key]),
        // Judged against whichever band is shown. The advice, caveat and
        // citations still come from the clinical engine — those are about the
        // marker, not about the interval, and they do not change because the
        // boundary moved a decimal place.
        status: basisFor(own[rule.key]) === 'own-report' ? statusAgainst(value, own[rule.key]) : ev.status,
        advice: ev.advice, caveat: ev.caveat, citations: ev.citations,
        trend, previous: typeof before === 'number' ? before : null,
      };
    });

    const flags = flagsFor(values);
    return {
      testId: test.id, takenOn: test.takenOn.toISOString().slice(0, 10), lab: test.lab,
      markers,
      // What the statuses above were measured against. A band we wrote for every
      // adult is not this citizen's band, and the panel says so rather than
      // letting a green tick imply otherwise.
      rangeNote: panelRangeNote(markers.map((m) => m.rangeBasis)),
      inRangeLine: inRangeSummary({
        bases: markers.map((m) => m.rangeBasis),
        outOfRange: markers.filter((m) => m.status !== 'normal').length,
      }),
      alerts: criticalAlerts(values),
      conditions: triggeredConditions(flags).map((c) => ({ key: c.key, name: c.name, principles: c.principles, citations: cite(c.citations) })),
      disclaimer: 'Medical Hub is the source of truth for your records. This analysis is educational, grounded in established clinical-nutrition guidance — not a diagnosis. Confirm with your doctor.',
      sharesWith: 'With your consent, Nutrition, Beauty and Fitness read these biomarkers to personalise your plans.',
    };
  }

  /**
   * The Latest Panel — a UNIFIED view of the user's most-recent clinical data.
   * Rather than only the newest report's markers, it aggregates across every
   * uploaded panel: for each unique biomarker ever recorded it shows the most
   * recent value, when it was last tested, its range/status, the same AI
   * explanation, and the current-vs-previous trend. So a Vitamin D from January
   * still appears even if July's report didn't include it. Same row shape as
   * analyze() (+ lastTested / previousDate). Per-report history is unchanged.
   */
  async latest(userId: string) {
    // unbounded: most-recent value PER BIOMARKER needs every panel — a missing
    // old panel silently drops a marker nothing newer ever measured again
    const tests = await this.prisma.medicalBloodTest.findMany({
      where: { userId }, orderBy: { takenOn: 'asc' }, include: { biomarkers: true },
    });
    if (!tests.length) {
      return {
        markers: [], alerts: [], conditions: [], takenOn: null, aggregated: true,
        rangeNote: panelRangeNote([]),
        inRangeLine: inRangeSummary({ bases: [], outOfRange: 0 }),
      };
    }

    // Each biomarker's chronological (value, date) series across ALL panels.
    // The interval travels with the value it was printed beside. This view shows
    // the most recent value per marker across every panel, so the band has to be
    // the one from THAT panel — carrying the newest panel's range onto an older
    // marker would be attributing one lab's opinion to another lab's result.
    const series = new Map<string, { value: number; date: Date; own: { low: number | null; high: number | null } }[]>();
    for (const t of tests) {
      for (const b of t.biomarkers as Array<{ key: string; value: number; refLow?: number | null; refHigh?: number | null }>) {
        const arr = series.get(b.key) ?? [];
        arr.push({ value: b.value, date: t.takenOn, own: { low: b.refLow ?? null, high: b.refHigh ?? null } });
        series.set(b.key, arr);
      }
    }
    // Most-recent value per biomarker → drives flags, alerts and conditions.
    const aggValues: Record<string, number> = {};
    for (const [k, arr] of series) aggValues[k] = arr[arr.length - 1].value;
    const crp = aggValues.crp;
    // takenOn is date-only (midnight UTC, see the create above), so it reads
    // back the same calendar day in every zone. Rendering it through a local
    // zone would shift it BACKWARDS a day for negative offsets — the exact bug
    // this sweep is fixing, in reverse. Leave it on toISOString().
    const iso = (d: Date) => d.toISOString().slice(0, 10);

    const markers = [...series.entries()].map(([key, arr]) => {
      const last = arr[arr.length - 1];
      const prev = arr.length > 1 ? arr[arr.length - 2] : null;
      const trend = prev ? (last.value > prev.value ? 'up' : last.value < prev.value ? 'down' : 'flat') : null;
      const common = {
        key, value: last.value, trend, previous: prev?.value ?? null,
        lastTested: iso(last.date), previousDate: prev ? iso(prev.date) : null,
      };
      const basis = basisFor(last.own);
      const mine = basis === 'own-report';
      const rule = ruleFor(key);
      if (rule) {
        const ev = evaluateMarker(rule, last.value, crp);
        return {
          ...common, label: rule.label, unit: rule.unit,
          range: mine ? formatRange(last.own) : `${rule.min}–${rule.max}`,
          rangeBasis: basis,
          status: mine ? statusAgainst(last.value, last.own) : ev.status,
          advice: ev.advice, caveat: ev.caveat, citations: ev.citations,
        };
      }
      const def = biomarkerDef(key);
      if (!def) return null;
      const status = mine
        ? statusAgainst(last.value, last.own)
        : (last.value < def.min ? 'low' : last.value > def.max ? 'high' : 'normal');
      return {
        ...common, label: def.label, unit: def.unit,
        range: mine ? formatRange(last.own) : `${def.min}–${def.max}`,
        rangeBasis: basis, status, advice: '', caveat: null,
        citations: [] as { id: string; label: string; ref: string }[],
      };
    }).filter((m): m is NonNullable<typeof m> => m != null);
    // Abnormal first, then alphabetical — the design (rows) is unchanged.
    markers.sort((a, b) => Number(a.status === 'normal') - Number(b.status === 'normal') || a.label.localeCompare(b.label));

    const flags = flagsFor(aggValues);
    const latestTest = tests[tests.length - 1];
    return {
      testId: latestTest.id, takenOn: iso(latestTest.takenOn), lab: latestTest.lab,
      aggregated: true,
      markers,
      rangeNote: panelRangeNote(markers.map((m) => m.rangeBasis)),
      inRangeLine: inRangeSummary({
        bases: markers.map((m) => m.rangeBasis),
        outOfRange: markers.filter((m) => m.status !== 'normal').length,
      }),
      alerts: criticalAlerts(aggValues),
      conditions: triggeredConditions(flags).map((c) => ({ key: c.key, name: c.name, principles: c.principles, citations: cite(c.citations) })),
      disclaimer: 'Medical Hub is the source of truth for your records. This unified panel shows your most recent value for each biomarker across all reports. Educational, not a diagnosis — confirm with your doctor.',
      sharesWith: 'With your consent, Nutrition, Beauty and Fitness read these biomarkers to personalise your plans.',
    };
  }

  /**
   * The manual-entry biomarker catalog — sections, ranges, hub tags, and the
   * units each marker accepts with the factor to convert them.
   *
   * The factors go to the client on purpose. The entry form colours each field
   * against the reference range while somebody types, so it has to convert too,
   * and the only thing worse than one unit table is two of them drifting apart.
   * The server converts again for itself when the panel is saved: what the
   * client computes is a preview, never the record.
   */
  biomarkerCatalog() {
    return {
      sections: BIOMARKER_SECTIONS.map((s) => ({
        ...s,
        markers: s.markers.map((m) => ({ ...m, units: unitChoices(m.key) })),
      })),
    };
  }

  /**
   * Evidence-based medical-condition suggestions from the user's blood tests —
   * the SHARED source of truth every hub (Beauty, Nutrition, Fitness) reads, so
   * conditions stay consistent across the platform. Only conditions that lab data
   * can reliably support are suggested (diabetes, prediabetes, thyroid, iron &
   * vitamin deficiencies). Conditions that CANNOT be inferred from blood alone —
   * eczema, psoriasis, rosacea, seborrheic dermatitis, pregnancy/breastfeeding,
   * PCOS, alopecia — are never auto-selected here (they stay manual / photo-AI).
   * Every suggestion carries a plain reason. Re-evaluates automatically each time
   * it's read, so a normalised value drops its (unconfirmed) suggestion.
   */
  async medicalConditionSuggestions(userId: string) {
    // unbounded: clinical suggestions read the full panel history — a
    // truncated history is a wrong clinical picture, not a slow one
    const tests = await this.prisma.medicalBloodTest.findMany({
      where: { userId }, orderBy: { takenOn: 'asc' }, include: { biomarkers: true },
    });
    // Most-recent value per biomarker across all panels + when it was measured.
    const values: Record<string, number> = {};
    const dateByKey: Record<string, string> = {};
    for (const t of tests) for (const b of t.biomarkers) { values[b.key] = b.value; dateByKey[b.key] = t.takenOn.toISOString().slice(0, 10); }

    const statusOf = (key: string): 'low' | 'normal' | 'high' | null => {
      const def = biomarkerDef(key);
      if (!def || values[key] == null) return null;
      const v = values[key];
      return v < def.min ? 'low' : v > def.max ? 'high' : 'normal';
    };
    const isLow = (k: string) => statusOf(k) === 'low';
    const isAbn = (k: string) => { const s = statusOf(k); return s != null && s !== 'normal'; };
    const lbl = (k: string) => biomarkerDef(k)?.label ?? k;

    type Suggestion = { key: string; label: string; chip: string | null; reason: string; source: 'labs' };
    const out: Suggestion[] = [];
    const add = (key: string, label: string, chip: string | null, reason: string) => out.push({ key, label, chip, reason, source: 'labs' });

    // Diabetes / Prediabetes (HbA1c thresholds).
    if (values.hba1c != null) {
      if (values.hba1c >= 6.5) add('diabetes', 'Diabetes', 'Diabetes', `HbA1c is ${values.hba1c}% (≥ 6.5% is the diabetes threshold), measured ${dateByKey.hba1c}.`);
      else if (values.hba1c >= 5.7) add('prediabetes', 'Prediabetes', null, `HbA1c is ${values.hba1c}% (5.7–6.4% is the pre-diabetes range), measured ${dateByKey.hba1c}.`);
    }
    // Thyroid — any abnormal TSH / Free T3 / Free T4.
    const thyroid = ['tsh', 'ft3', 'ft4'].filter(isAbn);
    if (thyroid.length) add('thyroid', 'Thyroid Disorders', 'Thyroid Disorders', `Abnormal ${thyroid.map(lbl).join(', ')} — thyroid function looks off; confirm with your doctor.`);
    // Iron deficiency — low iron-status markers.
    const iron = ['ferritin', 'serumIron', 'hb', 'transferrinSat'].filter(isLow);
    if (iron.length) add('iron-deficiency', 'Iron Deficiency', null, `Low ${iron.map(lbl).join(', ')} — consistent with low iron stores.`);
    // Vitamin / mineral deficiencies.
    if (isLow('vitd')) add('vitd-deficiency', 'Vitamin D Deficiency', null, `Vitamin D is low (${values.vitd} ng/mL).`);
    if (isLow('b12')) add('b12-deficiency', 'Vitamin B12 Deficiency', null, `Vitamin B12 is low (${values.b12} pg/mL).`);
    if (isLow('folate')) add('folate-deficiency', 'Folate Deficiency', null, `Folate is low (${values.folate} ng/mL).`);
    if (isLow('zinc')) add('zinc-deficiency', 'Zinc Deficiency', null, `Zinc is low (${values.zinc} µg/dL).`);

    // Alopecia is NOT auto-selected from labs — but note when several hair-relevant
    // markers align, so the user (and photo AI) can consider it.
    const hairSignals = [isLow('ferritin'), isLow('vitd'), isLow('zinc'), thyroid.length > 0].filter(Boolean).length;
    const alopeciaHint = hairSignals >= 2
      ? `Several hair-relevant markers are off (${['ferritin', 'vitd', 'zinc'].filter(isLow).map(lbl).concat(thyroid.length ? ['thyroid'] : []).join(', ')}). Combined with hair-photo analysis this can point to hair-loss risk — not confirmed from blood alone.`
      : null;

    return {
      hasPanel: tests.length > 0,
      suggestions: out,
      // Conditions that map to a shared chip and should be PRE-SELECTED (editable).
      autoSelectChips: [...new Set(out.filter((s) => s.chip).map((s) => s.chip as string))],
      alopeciaHint,
      note: 'Suggested from your blood tests and re-evaluated on each new report. Review and edit anytime — conditions that can’t be judged from blood (skin conditions, pregnancy, PCOS, alopecia) stay manual.',
    };
  }

  // ─────────────── longitudinal trends (auto-runs at 2+ panels) ───────────────
  /**
   * Cross-report trend analysis, generated automatically whenever the user has
   * ≥2 saved blood panels (no button). For every biomarker present in ≥2 dated
   * panels it builds a chronological series and classifies the trend by how the
   * value's DISTANCE FROM its healthy range changed over time — so it reads
   * correctly for both "high is bad" markers (LDL, HbA1c, triglycerides) and
   * "low is bad" ones (vitamin D, B12, ferritin). Produces the timeline,
   * per-marker trends, and an executive summary (biggest improvements, biggest
   * declines, stable, newly abnormal, and markers that returned to normal).
   * Deterministic + explainable — the same inputs always give the same read.
   */
  async bloodTrends(userId: string) {
    // unbounded: the trend line IS the whole history — paging.ts's canonical
    // computation example. Truncation would fabricate a different trend.
    const tests = await this.prisma.medicalBloodTest.findMany({
      where: { userId }, orderBy: { takenOn: 'asc' }, include: { biomarkers: true },
    });
    if (tests.length < 2) {
      return {
        hasTrends: false, testCount: tests.length, timeline: [], markers: [], summary: null,
        disclaimer: 'Longitudinal trends appear once you have two or more saved blood panels.',
      };
    }

    const iso = (d: Date) => d.toISOString().slice(0, 10); // date-only column — see above
    const timeline = tests.map((t, i) => ({
      id: t.id, takenOn: iso(t.takenOn), lab: t.lab, markerCount: t.biomarkers.length,
      isLatest: i === tests.length - 1,
    }));

    // Each marker's chronological value series.
    const series = new Map<string, { date: string; value: number }[]>();
    for (const t of tests) {
      for (const b of t.biomarkers) {
        const arr = series.get(b.key) ?? [];
        arr.push({ date: iso(t.takenOn), value: b.value });
        series.set(b.key, arr);
      }
    }

    const markers: MarkerTrend[] = [];

    for (const [key, pts] of series) {
      if (pts.length < 2) continue;
      const rule = ruleFor(key);
      if (!rule) continue;
      const points = pts.map((p) => ({ date: p.date, value: p.value, status: evaluateMarker(rule, p.value).status }));
      const first = points[0], last = points[points.length - 1];
      const { trend, severityChange } = classifyTrend(rule, points);

      const deltaAbs = Math.round((last.value - first.value) * 10) / 10;
      const trendLabel = trend === 'improving' ? 'Improving'
        : trend === 'worsening' ? 'Worsening'
        : trend === 'returned-normal' ? 'Returned to normal range'
        : trend === 'newly-abnormal' ? 'Newly out of range'
        : 'Stable';
      markers.push({
        key, label: rule.label, unit: rule.unit, range: `${rule.min}–${rule.max}`,
        // The same bounds as numbers. `range` is a display string, and a chart
        // that has to parse "20–100" to draw its reference band breaks silently
        // the day that string is formatted differently — with an en dash, a
        // locale separator, or a one-sided rule. The band is the part of the
        // chart that says whether a line going up is good news.
        min: rule.min, max: rule.max,
        points, first: first.value, latest: last.value, deltaAbs,
        deltaLabel: `${deltaAbs > 0 ? '+' : ''}${deltaAbs} ${rule.unit}`,
        direction: deltaAbs > 0 ? 'up' : deltaAbs < 0 ? 'down' : 'flat',
        trend, trendLabel, latestStatus: last.status, severityChange,
      });
    }
    markers.sort((a, b) => a.label.localeCompare(b.label));

    const improved = markers.filter((m) => m.trend === 'improving' || m.trend === 'returned-normal')
      .sort((a, b) => a.severityChange - b.severityChange);          // biggest improvement first
    const declined = markers.filter((m) => m.trend === 'worsening' || m.trend === 'newly-abnormal')
      .sort((a, b) => b.severityChange - a.severityChange);          // biggest decline first
    const stable = markers.filter((m) => m.trend === 'stable');
    const newlyAbnormal = markers.filter((m) => m.trend === 'newly-abnormal');
    const returnedNormal = markers.filter((m) => m.trend === 'returned-normal');

    const labels = (arr: MarkerTrend[]) => arr.map((m) => m.label);
    const list = (arr: string[]) => arr.length <= 1 ? (arr[0] ?? '') : `${arr.slice(0, -1).join(', ')} and ${arr[arr.length - 1]}`;

    const parts: string[] = [];
    if (improved.length) parts.push(`Compared with your earlier blood tests, ${list(labels(improved))} ${improved.length > 1 ? 'have' : 'has'} improved${returnedNormal.length ? ` (${list(labels(returnedNormal))} returned to the normal range)` : ''}.`);
    else parts.push('Comparing your blood tests over time:');
    if (declined.length) parts.push(`However, ${list(labels(declined))} ${declined.length > 1 ? 'have' : 'has'} worsened${newlyAbnormal.length ? ` — ${list(labels(newlyAbnormal))} newly moved out of range` : ''}, and should be your primary focus over the coming months.`);
    if (stable.length) parts.push(`${list(labels(stable))} ${stable.length > 1 ? 'have' : 'has'} held steady.`);
    const narrative = parts.join(' ');

    const pick = (m: MarkerTrend) => ({ key: m.key, label: m.label, trendLabel: m.trendLabel, deltaLabel: m.deltaLabel, latestStatus: m.latestStatus });
    return {
      hasTrends: true, testCount: tests.length, timeline, markers,
      summary: {
        narrative,
        improvements: improved.map(pick), declines: declined.map(pick), stable: stable.map(pick),
        newlyAbnormal: newlyAbnormal.map(pick), returnedToNormal: returnedNormal.map(pick),
      },
      disclaimer: 'Trends are educational and grounded in established reference ranges — not a diagnosis. Confirm changes with your doctor.',
    };
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
    // Was `(user?.name ?? 'there').split(' ')[0]` — ?? does not catch an empty
    // string, so a citizen with no name on file was greeted "Dear ," above
    // their own lab results.
    const first = informalName(user?.name);
    const test = await this.prisma.medicalBloodTest.findFirst({ where: { userId }, orderBy: { takenOn: 'desc' }, include: { biomarkers: true } });
    if (!test) {
      return { hasPanel: false, name: first, score: null, scoreBasis: null, band: null, priorities: [], greeting: salutation(user?.name), interpretation: [], relationships: [], discuss: [], encouragement: '', aiEnabled: this.ai.enabled, takenOn: null, lab: null, disclaimer };
    }
    // Read the ONE stored analysis for this test at the current version (runs the
    // AI only if it doesn't exist yet — never on a plain page load).
    const a = await this.getOrCreateAnalysis(userId, test, user?.name ?? 'there');
    return {
      hasPanel: true, name: first, score: a.healthScore, scoreBasis: a.scoreBasis, band: a.band, priorities: a.priorities,
      greeting: a.greeting, interpretation: a.interpretation, relationships: a.relationships,
      discuss: a.discuss, encouragement: a.encouragement,
      aiEnabled: this.ai.enabled, analysisVersion: a.analysisVersion,
      takenOn: test.takenOn.toISOString().slice(0, 10), lab: test.lab, disclaimer,
    };
  }

  /** Bump when the medical prompt or model changes → forces one re-analysis and
   *  a new stored version, keeping older versions for history. */
  /**
   * Bumped whenever the analysis CHANGES, because results are stored and served
   * back rather than recomputed. v2: the health score became a weighted share of
   * in-range markers instead of a count of abnormal ones, so every v1 score was
   * computed on a scale that punished thorough panels.
   */
  private static readonly ANALYSIS_VERSION = 'v2';

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

    const exact = await swallow(bloodAnalysis.findFirst({ where: { bloodTestId: test.id, analysisVersion: V } }), 'analysis cache read (exact)', { userId });
    if (exact?.payload) { try { return JSON.parse(exact.payload) as StoredAnalysis; } catch { /* regenerate */ } }

    const values = Object.fromEntries(test.biomarkers.map((b) => [b.key, b.value]));
    const hash = this.reportHash(values);

    const twin = await swallow(bloodAnalysis.findFirst({ where: { userId, reportHash: hash, analysisVersion: V } }), 'analysis cache read (twin)', { userId });
    if (twin?.payload) {
      try {
        const payload = JSON.parse(twin.payload) as StoredAnalysis;
        await swallow(this.storeAnalysis(userId, test.id, hash, payload), 'analysis cache write (twin reuse)', { userId });
        return payload;
      } catch { /* regenerate */ }
    }

    const payload = await this.computeAnalysis(values, fullName, hash);
    await swallow(this.storeAnalysis(userId, test.id, hash, payload), 'analysis cache write', { userId });
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
    const first = informalName(fullName);
    const crp = values.crp;
    const flags = flagsFor(values);
    const markers = MARKER_RULES.filter((r) => r.key in values).map((rule) => {
      const ev = evaluateMarker(rule, values[rule.key], crp);
      return { key: rule.key, label: rule.label, unit: rule.unit, value: values[rule.key], range: `${rule.min}–${rule.max}`, status: ev.status, advice: ev.advice };
    });
    const abnormal = markers.filter((m) => m.status !== 'normal');
    const alerts = criticalAlerts(values);
    const conditions = triggeredConditions(flags).map((c) => ({ key: c.key, name: c.name }));

    const PRI: Record<string, { label: string; w: number }> = {
      hb: { label: 'Address low hemoglobin', w: 9 }, hba1c: { label: 'Optimise blood sugar control', w: 9 },
      trig: { label: 'Lower triglycerides', w: 8 }, ldl: { label: 'Lower LDL cholesterol', w: 7 },
      crp: { label: 'Reduce inflammation', w: 7 }, ferritin: { label: 'Rebuild iron stores', w: 6 },
      b12: { label: 'Correct low B12', w: 5 }, folate: { label: 'Increase folate', w: 5 }, vitd: { label: 'Improve vitamin D status', w: 4 },
    };

    // The score, its band and its stated basis all live in panel-score.ts —
    // pure, testable, and documented there rather than buried in this method.
    const score = panelScore(markers, alerts);
    const band = panelBand(score);
    const scoreBasis = panelScoreBasis(markers, alerts);
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
      + `\nSummary figure for this panel: ${score}/100 (${band}) — the weighted share of markers in range. Do not describe it as a health score or an overall measure of health.`;
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
      healthScore: score, scoreBasis, band, confidence: alerts.length ? 'Review with a doctor' : abnormal.length ? 'High' : 'High',
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
      where: { userId }, orderBy: { recordedOn: 'desc' }, take: RECORD_CAP,
    });
    // recordedOn is when the document was FILED — an instant, so which day it
    // falls on depends on the citizen's zone, not the server's.
    const tz = await this.clock.timezoneFor(userId);
    return rows.map((r) => {
      const rr = r as typeof r & { fileKey?: string | null; mimeType?: string | null; sizeBytes?: number | null; bloodTestId?: string | null };
      return {
        id: r.id, kind: r.kind, title: r.title, detail: r.detail,
        // Health docs are private: expose only whether a file exists, not a URL.
        // The client fetches a short-lived signed link from /records/:id/file.
        hasFile: Boolean(rr.fileKey || r.fileUrl),
        mimeType: rr.mimeType ?? null, sizeBytes: rr.sizeBytes ?? 0,
        // If this document produced an analysed blood panel, surface the link so
        // Health Records can jump straight to the same analysis shown on Blood Test Analysis.
        bloodTestId: rr.bloodTestId ?? null,
        analyzed: Boolean(rr.bloodTestId),
        recordedOn: this.clock.dayIn(tz, r.recordedOn),
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
      // A doctor who deleted their account is not practising here. Without this
      // they stayed in the directory as "Deleted citizen" — with a specialty, a
      // price and a Book button that opened a chat with nobody.
      where: { user: { deletedAt: null } },
      include: { user: { select: { id: true, handle: true, name: true, profileImage: true } } },
      take: RECORD_CAP, // a directory bigger than this needs search, not scroll
    });
    return rows.map((d) => ({
      id: d.id, name: d.user.name, handle: d.user.handle, specialty: d.specialty,
      hospital: d.hospital, languages: d.languages.split(',').filter(Boolean), rating: d.rating, priceInr: d.priceInr,
    }));
  }

  async consults(userId: string) {
    const rows = await this.prisma.consult.findMany({
      where: { userId }, orderBy: { createdAt: 'desc' }, take: ORDER_HISTORY_CAP,
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
    // findFirst, not findUnique, so the deleted check is part of the query
    // rather than a line after it — booking by id must fail the same way
    // browsing does.
    const doctor = await this.prisma.doctor.findFirst({
      where: { id: dto.doctorId, user: { deletedAt: null } },
    });
    if (!doctor) throw new NotFoundException('doctor not found');
    const [userOneId, userTwoId] = [userId, doctor.userId].sort();
    await this.prisma.connection.upsert({
      where: { userOneId_userTwoId_connectionType: { userOneId, userTwoId, connectionType: 'DOCTOR_PATIENT' } },
      update: { status: 'ACCEPTED' },
      create: { userOneId, userTwoId, connectionType: 'DOCTOR_PATIENT', status: 'ACCEPTED', requestedById: userId },
    });
    // Unified payment: charge the consult fee to the one city wallet.
    // The conversation is opened BEFORE the charge, deliberately. startDirect is
    // get-or-create and lives in another service that isn't transaction-aware,
    // so it can't run inside the transaction — and of the two orderings, a
    // conversation with no consult is a harmless empty chat, whereas a charge
    // with no consult is a citizen billed for care they can't reach.
    const conversation = await this.conversations.startDirect(userId, doctor.userId);
    const consultId = await this.financial.paid<string>(
      userId,
      { hub: 'Medical', category: 'medical', label: `Consult — ${doctor.specialty.split(' ·')[0]}`, amountInr: doctor.priceInr, method: dto.method },
      async (tx) => {
        const created = await tx.consult.create({
          data: {
            userId, doctorId: doctor.id, reason: dto.reason ?? null,
            scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null, conversationId: conversation.id,
          },
        });
        return created.id;
      },
    );
    return { consultId, conversationId: conversation.id };
  }

  // ─────────────── consent core ───────────────
  /** Consent per hub (defaults created granted=true the first time). */
  async consents(userId: string) {
    // unbounded: one row per hub — CONSENT_HUBS bounds this, not the citizen
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
    if (!demoDataEnabled()) return;
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
