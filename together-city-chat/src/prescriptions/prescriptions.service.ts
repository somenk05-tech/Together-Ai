import { swallowed } from '../shared/swallow';
import { matchesFor, type RecordedAllergy } from './allergy-notice';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import { ClockService } from '../shared/clock/clock.service';
import { NotificationsService } from '../notifications/notifications.service';
import { doseStatus, expandDoses, notifyAtFor, normaliseTimes } from './dose-schedule';
import { addDays, instantAt, wallTimeIn } from '../shared/clock/zone-time';
import {
  PrescriptionExtractor, needsReview, type ExtractedItem,
} from './prescription-extractor';
import type {
  AddItemDto, ConfirmPrescriptionDto, DoseActionDto, LogsQueryDto, ReviewItemDto, UploadPrescriptionDto,
} from './dto/prescriptions.dto';

/** How far ahead reminders are materialised. The nightly job keeps this topped up. */
export const REMINDER_HORIZON_DAYS = 14;

/** Times used when a frequency was understood but no clock times were given. */
const DEFAULT_TIMES: Record<string, string[]> = {
  once: ['09:00'],
  twice: ['09:00', '21:00'],
  thrice: ['08:00', '14:00', '21:00'],
  four: ['06:00', '12:00', '18:00', '22:00'],
};

/**
 * Read a frequency phrase into clock times.
 *
 * Deliberately conservative: it recognises the common Indian-prescription forms
 * and otherwise returns nothing, which leaves the line in review rather than
 * inventing a schedule. A wrong time is worse than an absent one.
 */
export function timesFromFrequency(frequency?: string | null): string[] {
  if (!frequency) return [];
  const f = frequency.toLowerCase();
  if (/\b1-1-1\b|thrice|three times|tds|tid|8\s*hour/.test(f)) return DEFAULT_TIMES.thrice;
  if (/\b1-0-1\b|1-1-0|twice|two times|bd|bid|12\s*hour/.test(f)) return DEFAULT_TIMES.twice;
  if (/\bqid\b|four times|1-1-1-1/.test(f)) return DEFAULT_TIMES.four;
  if (/\bod\b|once|daily|1-0-0|0-0-1|每/.test(f)) return DEFAULT_TIMES.once;
  return [];
}

@Injectable()
export class PrescriptionsService {
  private readonly logger = new Logger(PrescriptionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
    private readonly notifications: NotificationsService,
    private readonly extractor: PrescriptionExtractor,
  ) {}

  // ─────────────────────────── upload & extraction ───────────────────────────

  /**
   * Take a photographed prescription and try to read it.
   *
   * Always lands in one of two honest states: `review_required` when anything is
   * missing or unsure — which is every upload while no OCR provider is
   * configured — or `confirmed`-ready when every required field was read
   * confidently. It never lands in a state that claims to know a dosage it
   * guessed.
   */
  async upload(userId: string, dto: UploadPrescriptionDto) {
    const created = await this.prisma.prescription.create({
      data: {
        userId,
        source: 'upload',
        status: 'processing',
        fileKey: dto.fileKey,
        mimeType: dto.mimeType ?? null,
      },
    });

    let items: ExtractedItem[] = [];
    let providerJobId: string | undefined;
    let raw: unknown;
    try {
      const out = await this.extractor.extract({ fileKey: dto.fileKey, mimeType: dto.mimeType ?? null });
      items = out.items ?? [];
      providerJobId = out.providerJobId;
      raw = out.raw;
    } catch (e) {
      // A provider failure is a state the citizen can act on, not a 500.
      await this.prisma.prescription.update({
        where: { id: created.id },
        data: { status: 'failed', error: (e as Error).message.slice(0, 300) },
      });
      this.logger.warn(`extraction failed for prescription ${created.id}`);
      return this.get(userId, created.id);
    }

    await this.prisma.prescriptionItem.createMany({
      data: items.map((i) => ({
        prescriptionId: created.id,
        medicineName: i.medicineName,
        dosage: i.dosage ?? null,
        frequency: i.frequency ?? null,
        durationDays: i.durationDays ?? null,
        instructions: i.instructions ?? null,
        timesLocal: i.timesLocal?.length ? JSON.stringify(normaliseTimes(i.timesLocal)) : null,
        confidence: JSON.stringify(i.confidence ?? {}),
        needsReview: needsReview(i),
      })),
    });

    await this.prisma.prescription.update({
      where: { id: created.id },
      data: {
        status: 'review_required', // never 'confirmed' without the citizen saying so
        providerJobId: providerJobId ?? null,
        rawExtraction: raw ? JSON.stringify(raw).slice(0, 20_000) : null,
      },
    });

    return this.get(userId, created.id);
  }

  async list(userId: string) {
    const [rows, allergies] = await Promise.all([
      this.prisma.prescription.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: { items: true },
      }),
      this.recordedAllergies(userId),
    ]);
    return rows.map((p) => this.shape(p, allergies));
  }

  async get(userId: string, id: string) {
    const [p, allergies] = await Promise.all([
      this.prisma.prescription.findFirst({
        where: { id, userId },
        include: { items: true },
      }),
      this.recordedAllergies(userId),
    ]);
    if (!p) throw new NotFoundException('No such prescription.');
    return this.shape(p, allergies);
  }

  /**
   * The allergies this citizen filed under Medical → Records.
   *
   * Read straight from MedicalRecord rather than through the Medical Hub's
   * consent gate, because that gate governs sharing sensitive data with ANOTHER
   * hub's audience. Nothing is being shared here: these are the citizen's own
   * records, shown back to the citizen, on their own prescription. Routing it
   * through a consent prompt would ask them to authorise themselves.
   *
   * Failure is silent and empty on purpose — but note that an empty list is
   * never rendered as reassurance. See allergy-notice.ts.
   */
  private async recordedAllergies(userId: string): Promise<RecordedAllergy[]> {
    const rows = await this.prisma.medicalRecord.findMany({
      where: { userId, kind: 'allergy' },
      orderBy: { recordedOn: 'desc' },
      take: 50,
    }).catch(swallowed('prescriptions.recordedAllergies', null));
    return (rows ?? []).map((r) => ({
      id: r.id,
      title: r.title,
      detail: r.detail ?? null,
      recordedOn: r.recordedOn.toISOString(),
    }));
  }

  private shape(p: {
    id: string; status: string; source: string; fileKey: string | null; error: string | null;
    confirmedAt: Date | null; createdAt: Date;
    items: Array<{
      id: string; medicineName: string; dosage: string | null; frequency: string | null;
      durationDays: number | null; instructions: string | null; timesLocal: string | null;
      confidence: string | null; needsReview: boolean;
    }>;
  }, allergies: RecordedAllergy[] = []) {
    return {
      id: p.id,
      status: p.status,
      source: p.source,
      error: p.error,
      confirmedAt: p.confirmedAt ? p.confirmedAt.toISOString() : null,
      createdAt: p.createdAt.toISOString(),
      needsReview: p.items.some((i) => i.needsReview),
      // Every allergy they recorded, sent whether or not anything matched. The
      // screen shows them next to the medicines because the citizen filed them
      // and nothing has ever looked at them since; matching is a bonus, not the
      // feature. Absence of matches is never rendered as "no interactions".
      recordedAllergies: allergies,
      items: p.items.map((i) => ({
        id: i.id,
        medicineName: i.medicineName,
        dosage: i.dosage,
        frequency: i.frequency,
        durationDays: i.durationDays,
        instructions: i.instructions,
        timesLocal: this.parseTimes(i.timesLocal),
        confidence: this.parseJson<Record<string, number>>(i.confidence) ?? {},
        needsReview: i.needsReview,
        allergyMatches: matchesFor(i.medicineName, allergies),
      })),
    };
  }

  private parseTimes(raw: string | null): string[] {
    return normaliseTimes(this.parseJson<string[]>(raw) ?? []);
  }

  private parseJson<T>(raw: string | null): T | null {
    if (!raw) return null;
    try { return JSON.parse(raw) as T; } catch { return null; }
  }

  // ─────────────────────────────── review ───────────────────────────────

  /**
   * Add a line by hand.
   *
   * Not an edge case — it is the MAIN path while no OCR provider is configured,
   * since the default extractor deliberately reads nothing. Without this a
   * citizen could upload a prescription, receive an empty review, and never be
   * able to confirm it.
   *
   * Everything typed here is certain by definition, so the line does not need
   * review: a person read the paper.
   */
  async addItem(userId: string, prescriptionId: string, dto: AddItemDto) {
    const owned = await this.prisma.prescription.findFirst({
      where: { id: prescriptionId, userId },
      select: { id: true, status: true },
    });
    if (!owned) throw new NotFoundException('No such prescription.');
    if (owned.status === 'confirmed') {
      throw new BadRequestException('This prescription is already confirmed. Start a new one to add a medicine.');
    }

    const times = dto.timesLocal?.length ? normaliseTimes(dto.timesLocal) : timesFromFrequency(dto.frequency);
    await this.prisma.prescriptionItem.create({
      data: {
        prescriptionId,
        medicineName: dto.medicineName,
        dosage: dto.dosage,
        frequency: dto.frequency,
        durationDays: dto.durationDays ?? null,
        instructions: dto.instructions ?? null,
        timesLocal: times.length ? JSON.stringify(times) : null,
        confidence: JSON.stringify({ medicineName: 1, dosage: 1, frequency: 1 }),
        needsReview: false,
      },
    });

    // An upload that failed to read becomes reviewable again once a human adds
    // a line to it.
    if (owned.status === 'failed') {
      await this.prisma.prescription.update({ where: { id: prescriptionId }, data: { status: 'review_required', error: null } });
    }
    return this.get(userId, prescriptionId);
  }

  /** Remove a line before confirming — a misread the citizen would rather drop. */
  async removeItem(userId: string, prescriptionId: string, itemId: string) {
    const owned = await this.prisma.prescription.findFirst({ where: { id: prescriptionId, userId }, select: { id: true } });
    if (!owned) throw new NotFoundException('No such prescription.');
    const res = await this.prisma.prescriptionItem.deleteMany({ where: { id: itemId, prescriptionId } });
    if (res.count === 0) throw new NotFoundException('No such prescription item.');
    return this.get(userId, prescriptionId);
  }

  /** Correct one extracted line. What the citizen types is taken as certain. */
  async reviewItem(userId: string, prescriptionId: string, itemId: string, dto: ReviewItemDto) {
    const owned = await this.prisma.prescription.findFirst({ where: { id: prescriptionId, userId }, select: { id: true } });
    if (!owned) throw new NotFoundException('No such prescription.');

    const item = await this.prisma.prescriptionItem.findFirst({ where: { id: itemId, prescriptionId } });
    if (!item) throw new NotFoundException('No such prescription item.');

    const merged: ExtractedItem = {
      medicineName: dto.medicineName ?? item.medicineName,
      dosage: dto.dosage ?? item.dosage ?? undefined,
      frequency: dto.frequency ?? item.frequency ?? undefined,
      durationDays: (dto.durationDays === undefined ? item.durationDays : dto.durationDays) ?? undefined,
      instructions: (dto.instructions === undefined ? item.instructions : dto.instructions) ?? undefined,
      timesLocal: dto.timesLocal ?? this.parseTimes(item.timesLocal),
      // A field the citizen supplied is certain by definition.
      confidence: Object.fromEntries(Object.keys(dto).map((k) => [k, 1])),
    };
    const priorConfidence = this.parseJson<Record<string, number>>(item.confidence) ?? {};
    merged.confidence = { ...priorConfidence, ...merged.confidence };

    await this.prisma.prescriptionItem.update({
      where: { id: itemId },
      data: {
        medicineName: merged.medicineName,
        dosage: merged.dosage ?? null,
        frequency: merged.frequency ?? null,
        durationDays: merged.durationDays ?? null,
        instructions: merged.instructions ?? null,
        timesLocal: merged.timesLocal?.length ? JSON.stringify(normaliseTimes(merged.timesLocal)) : null,
        confidence: JSON.stringify(merged.confidence),
        needsReview: needsReview(merged),
      },
    });
    return this.get(userId, prescriptionId);
  }

  // ─────────────────────────────── confirm ───────────────────────────────

  /**
   * Turn a reviewed prescription into medicines, schedules and alarms.
   *
   * Refuses while any line still needs review. That refusal is the whole point
   * of the review state: nothing becomes an alarm telling someone to take a
   * drug until a human has confirmed what the drug and the dose are.
   */
  async confirm(userId: string, prescriptionId: string, dto: ConfirmPrescriptionDto) {
    const p = await this.prisma.prescription.findFirst({
      where: { id: prescriptionId, userId },
      include: { items: true },
    });
    if (!p) throw new NotFoundException('No such prescription.');
    if (p.items.length === 0) throw new BadRequestException('Add at least one medicine before confirming.');

    const unresolved = p.items.filter((i) => i.needsReview);
    if (unresolved.length > 0) {
      throw new BadRequestException(
        `Confirm these first: ${unresolved.map((i) => i.medicineName || 'unnamed medicine').join(', ')}.`,
      );
    }

    const timezone = dto.timezone && this.clock.validZone(dto.timezone)
      ? dto.timezone
      : await this.clock.timezoneFor(userId);
    const startDay = dto.startDate ?? this.clock.todayIn(timezone);

    const scheduleIds: string[] = [];
    for (const item of p.items) {
      const times = this.parseTimes(item.timesLocal);
      const resolved = times.length ? times : timesFromFrequency(item.frequency);
      if (!resolved.length) {
        throw new BadRequestException(`Add dose times for ${item.medicineName} before confirming.`);
      }

      const medicine = await this.prisma.medicine.create({
        data: { userId, name: item.medicineName, notes: item.instructions ?? null },
      });
      const endDate = item.durationDays
        ? new Date(`${this.addDays(startDay, item.durationDays - 1)}T00:00:00.000Z`)
        : null;

      const schedule = await this.prisma.medicineSchedule.create({
        data: {
          userId,
          medicineId: medicine.id,
          prescriptionItemId: item.id,
          timesLocal: JSON.stringify(resolved),
          daysOfWeek: null,
          startDate: new Date(`${startDay}T00:00:00.000Z`),
          endDate,
          timezone,
          dosage: item.dosage,
          instructions: item.instructions,
          active: true,
        },
      });
      scheduleIds.push(schedule.id);
      await this.expandReminders(schedule.id);
    }

    await this.prisma.prescription.update({
      where: { id: p.id },
      data: { status: 'confirmed', confirmedAt: new Date() },
    });

    return { ...(await this.get(userId, prescriptionId)), scheduleIds };
  }

  private addDays(day: string, delta: number): string {
    const at = new Date(`${day}T12:00:00Z`);
    at.setUTCDate(at.getUTCDate() + delta);
    return at.toISOString().slice(0, 10);
  }

  // ────────────────────────────── reminders ──────────────────────────────

  /**
   * Materialise this schedule's alarms for the next horizon.
   *
   * createMany + skipDuplicates against the unique (scheduleId, scheduledAtUtc)
   * key, so running this twice — a retry, an overlapping nightly job, a redeploy
   * mid-run — cannot produce a second alarm for the same dose.
   */
  async expandReminders(scheduleId: string, horizonDays = REMINDER_HORIZON_DAYS): Promise<number> {
    const s = await this.prisma.medicineSchedule.findUnique({ where: { id: scheduleId } });
    if (!s || !s.active) return 0;

    const from = this.clock.now();
    const to = new Date(from.getTime() + horizonDays * 24 * 3600 * 1000);
    const doses = expandDoses(
      {
        timesLocal: this.parseJson<string[]>(s.timesLocal) ?? [],
        daysOfWeek: this.parseJson<number[]>(s.daysOfWeek),
        startDate: s.startDate.toISOString().slice(0, 10),
        endDate: s.endDate ? s.endDate.toISOString().slice(0, 10) : null,
        timezone: s.timezone,
      },
      from,
      to,
    );
    if (!doses.length) return 0;

    const res = await this.prisma.medicineReminder.createMany({
      data: doses.map((at) => ({
        scheduleId: s.id,
        userId: s.userId,
        scheduledAtUtc: at,
        notifyAtUtc: notifyAtFor(at),
        status: 'pending',
      })),
      skipDuplicates: true,
    });
    return res.count;
  }

  /** Every alarm now due. Ordered so the oldest overdue one goes first. */
  async dueReminders(now = this.clock.now(), limit = 500) {
    return this.prisma.medicineReminder.findMany({
      where: { status: 'pending', notifyAtUtc: { lte: now } },
      orderBy: { notifyAtUtc: 'asc' },
      take: limit,
      include: { schedule: { include: { medicine: true } } },
    });
  }

  /**
   * Send one alarm, once.
   *
   * The status is moved to `sent` with a guard on it still being `pending`, so
   * two dispatchers racing the same row produce one notification: the loser
   * updates zero rows and stops.
   */
  async dispatchReminder(reminder: {
    id: string; userId: string; scheduledAtUtc: Date;
    schedule: { timezone: string; dosage: string | null; medicine: { name: string } };
  }): Promise<boolean> {
    const claimed = await this.prisma.medicineReminder.updateMany({
      where: { id: reminder.id, status: 'pending' },
      data: { status: 'sent', sentAt: new Date() },
    });
    if (claimed.count === 0) return false;

    const at = new Intl.DateTimeFormat('en-GB', {
      timeZone: reminder.schedule.timezone, hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(reminder.scheduledAtUtc);
    const dose = reminder.schedule.dosage ? ` (${reminder.schedule.dosage})` : '';

    await this.notifications.create({
      userId: reminder.userId,
      kind: 'medicine_reminder',
      title: `${reminder.schedule.medicine.name} at ${at}`,
      body: `Time to take your ${reminder.schedule.medicine.name}${dose} in 5 minutes.`,
      href: '/medical/medicines',
      entityId: reminder.id,
    });
    return true;
  }

  // ──────────────────────────── medicines & doses ────────────────────────────

  async medicines(userId: string) {
    const rows = await this.prisma.medicine.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { schedules: { where: { active: true } } },
    });
    return rows.map((m) => ({
      id: m.id,
      name: m.name,
      form: m.form,
      strength: m.strength,
      notes: m.notes,
      schedules: m.schedules.map((s) => ({
        id: s.id,
        timesLocal: this.parseTimes(s.timesLocal),
        timezone: s.timezone,
        dosage: s.dosage,
        startDate: s.startDate.toISOString().slice(0, 10),
        endDate: s.endDate ? s.endDate.toISOString().slice(0, 10) : null,
        active: s.active,
      })),
    }));
  }

  /**
   * Record what happened at a dose.
   *
   * Upsert on (schedule, dose instant): tapping "taken" twice, or a retried
   * request, updates the one row rather than writing a second history entry
   * that would make adherence look better than it was.
   */
  async recordDose(userId: string, dto: DoseActionDto) {
    const schedule = await this.prisma.medicineSchedule.findFirst({
      where: { id: dto.scheduleId, userId },
      select: { id: true },
    });
    if (!schedule) throw new NotFoundException('No such medicine schedule.');

    const scheduledAtUtc = new Date(dto.scheduledAtUtc);
    const row = await this.prisma.doseLog.upsert({
      where: { scheduleId_scheduledAtUtc: { scheduleId: dto.scheduleId, scheduledAtUtc } },
      create: {
        scheduleId: dto.scheduleId,
        userId,
        scheduledAtUtc,
        action: dto.action,
        actedAtUtc: new Date(),
        dosageTaken: dto.dosageTaken ?? null,
        note: dto.note ?? null,
      },
      update: {
        action: dto.action,
        actedAtUtc: new Date(),
        dosageTaken: dto.dosageTaken ?? null,
        note: dto.note ?? null,
      },
    });
    return { id: row.id, action: row.action, scheduledAtUtc: row.scheduledAtUtc.toISOString() };
  }

  /**
   * Today's doses, in the citizen's own day (FE-6.2).
   *
   * This exists because until now there was NO WAY IN THE APP TO SAY YOU HAD
   * TAKEN A MEDICINE. The endpoint to record it has been there, the model has
   * been there, and `useRecordDose` has been sitting in the client unimported.
   * Meanwhile a job runs every hour and writes `action: 'missed'` for any dose
   * two hours past its time with no log against it. So the app reminded people
   * to take their medicine, gave them no way to answer, and then filed a missed
   * dose in their medical record — for every dose, forever, however faithfully
   * they were actually taking it.
   *
   * Built here rather than in the client because the client would have to
   * re-derive the dose instants to know what to send back, and a second copy of
   * the expander is a second answer to "when is this dose". The expander that
   * schedules the alarm is the one that lists the day.
   *
   * A dose stays in the list once its time has passed. It is the ones already
   * behind you that you need to answer for, and recordDose upserts, so a dose
   * the sweep already called missed can still be corrected to taken while the
   * day is yours to correct.
   */
  async today(userId: string, at = this.clock.now()) {
    const timezone = await this.clock.timezoneFor(userId);
    const day = this.clock.todayIn(timezone, at);
    const schedules = await this.prisma.medicineSchedule.findMany({
      where: { userId, active: true },
      include: { medicine: { select: { name: true, form: true, strength: true } } },
      take: 200,
    });

    const doses: {
      scheduleId: string; scheduledAtUtc: string; timeLocal: string;
      medicine: string; form: string | null; strength: string | null;
      dosage: string | null; instructions: string | null;
      status: 'taken' | 'skipped' | 'missed' | 'due' | 'upcoming';
      actedAtUtc: string | null;
    }[] = [];

    // The citizen's calendar day, bounded by its own local start and end — not
    // by a UTC day, which for anywhere east of Greenwich is a different set of
    // doses entirely.
    const dayStart = instantAt(timezone, day, '00:00');
    const dayEnd = new Date(instantAt(timezone, addDays(day, 1), '00:00').getTime() - 1);

    for (const s of schedules) {
      const instants = expandDoses({
        timesLocal: this.parseTimes(s.timesLocal),
        daysOfWeek: this.parseJson<number[]>(s.daysOfWeek),
        startDate: s.startDate.toISOString().slice(0, 10),
        endDate: s.endDate ? s.endDate.toISOString().slice(0, 10) : null,
        // The schedule's own zone, not the profile's. Someone who set a course
        // up in Delhi and is now in London still takes it on the clock the
        // course was written against until they change it.
        timezone: s.timezone,
      }, dayStart, dayEnd);

      for (const at of instants) {
        doses.push({
          scheduleId: s.id,
          scheduledAtUtc: at.toISOString(),
          timeLocal: wallTimeIn(s.timezone, at),
          medicine: s.medicine.name,
          form: s.medicine.form,
          strength: s.medicine.strength,
          dosage: s.dosage,
          instructions: s.instructions,
          status: 'upcoming',
          actedAtUtc: null,
        });
      }
    }
    if (!doses.length) return { day, timezone, doses: [], answered: 0, total: 0 };

    // One query for the whole day rather than one per dose.
    // unbounded: one day's window bounds it — the date range is the cap
    const logs = await this.prisma.doseLog.findMany({
      where: { userId, scheduledAtUtc: { gte: dayStart, lte: dayEnd } },
      select: { scheduleId: true, scheduledAtUtc: true, action: true, actedAtUtc: true },
    });
    const logged = new Map(logs.map((l) => [`${l.scheduleId}@${l.scheduledAtUtc.toISOString()}`, l] as const));

    for (const d of doses) {
      const hit = logged.get(`${d.scheduleId}@${d.scheduledAtUtc}`);
      d.status = doseStatus(new Date(d.scheduledAtUtc), at, hit);
      d.actedAtUtc = hit?.actedAtUtc ? hit.actedAtUtc.toISOString() : null;
    }
    doses.sort((a, b) => a.scheduledAtUtc.localeCompare(b.scheduledAtUtc));

    return {
      day,
      timezone,
      doses,
      // Answered BY THE CITIZEN. A dose the sweep called missed is not an
      // answer, it is the absence of one.
      answered: doses.filter((d) => d.actedAtUtc).length,
      total: doses.length,
    };
  }

  /** The medicine log: what was prescribed, when it was due, what happened. */
  async logs(userId: string, dto: LogsQueryDto) {
    const take = dto.limit ?? 50;
    const rows = await this.prisma.doseLog.findMany({
      where: {
        userId,
        ...(dto.from || dto.to
          ? { scheduledAtUtc: { ...(dto.from ? { gte: new Date(dto.from) } : {}), ...(dto.to ? { lte: new Date(dto.to) } : {}) } }
          : {}),
      },
      orderBy: { scheduledAtUtc: 'desc' },
      take: take + 1,
      ...(dto.cursor ? { cursor: { id: dto.cursor }, skip: 1 } : {}),
      include: { schedule: { include: { medicine: true } } },
    });
    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;
    return {
      items: page.map((d) => ({
        id: d.id,
        medicine: d.schedule.medicine.name,
        dosage: d.dosageTaken ?? d.schedule.dosage,
        scheduledAtUtc: d.scheduledAtUtc.toISOString(),
        actedAtUtc: d.actedAtUtc ? d.actedAtUtc.toISOString() : null,
        action: d.action,
        note: d.note,
      })),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  }

  /**
   * Mark past doses nobody acted on as missed.
   *
   * A dose is only missed once its moment has properly passed — the grace window
   * stops a dose being called missed while the citizen is still walking to the
   * cupboard.
   */
  async markMissed(graceMinutes = 120, now = this.clock.now()): Promise<number> {
    const cutoff = new Date(now.getTime() - graceMinutes * 60_000);
    const due = await this.prisma.medicineReminder.findMany({
      where: { scheduledAtUtc: { lt: cutoff }, status: { in: ['sent', 'pending'] } },
      select: { scheduleId: true, scheduledAtUtc: true, userId: true },
      take: 1000,
    });
    let missed = 0;
    for (const r of due) {
      const existing = await this.prisma.doseLog.findUnique({
        where: { scheduleId_scheduledAtUtc: { scheduleId: r.scheduleId, scheduledAtUtc: r.scheduledAtUtc } },
      });
      if (existing) continue; // taken, skipped, or already marked
      await this.prisma.doseLog.create({
        data: {
          scheduleId: r.scheduleId,
          userId: r.userId,
          scheduledAtUtc: r.scheduledAtUtc,
          action: 'missed',
          actedAtUtc: null,
        },
      }).catch(swallowed('prescriptions.markMissed', undefined)); // a race that lost is fine: the row exists
      missed++;
    }
    return missed;
  }

  /** Top every active schedule's reminders back up to the horizon. */
  async extendHorizon(): Promise<number> {
    const schedules = await this.prisma.medicineSchedule.findMany({
      where: { active: true },
      select: { id: true },
      take: 5000,
    });
    let created = 0;
    for (const s of schedules) created += await this.expandReminders(s.id);
    return created;
  }
}
