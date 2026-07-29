import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import { ClockService } from '../shared/clock/clock.service';
import { NotificationsService } from '../notifications/notifications.service';
import { expandDoses, notifyAtFor, normaliseTimes } from './dose-schedule';
import {
  PrescriptionExtractor, needsReview, type ExtractedItem,
} from './prescription-extractor';
import type {
  ConfirmPrescriptionDto, DoseActionDto, LogsQueryDto, ReviewItemDto, UploadPrescriptionDto,
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
    const rows = await this.prisma.prescription.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { items: true },
    });
    return rows.map((p) => this.shape(p));
  }

  async get(userId: string, id: string) {
    const p = await this.prisma.prescription.findFirst({
      where: { id, userId },
      include: { items: true },
    });
    if (!p) throw new NotFoundException('No such prescription.');
    return this.shape(p);
  }

  private shape(p: {
    id: string; status: string; source: string; fileKey: string | null; error: string | null;
    confirmedAt: Date | null; createdAt: Date;
    items: Array<{
      id: string; medicineName: string; dosage: string | null; frequency: string | null;
      durationDays: number | null; instructions: string | null; timesLocal: string | null;
      confidence: string | null; needsReview: boolean;
    }>;
  }) {
    return {
      id: p.id,
      status: p.status,
      source: p.source,
      error: p.error,
      confirmedAt: p.confirmedAt ? p.confirmedAt.toISOString() : null,
      createdAt: p.createdAt.toISOString(),
      needsReview: p.items.some((i) => i.needsReview),
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
      }).catch(() => undefined); // a race that lost is fine: the row exists
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
