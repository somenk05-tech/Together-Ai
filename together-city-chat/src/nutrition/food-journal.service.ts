import { swallowed } from '../shared/swallow';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import { ClockService, DEFAULT_TIMEZONE } from '../shared/clock/clock.service';
import { AiService } from '../ai/ai.service';
import { NutritionService } from './nutrition.service';
import type { JournalItemDto, LogMealDto } from './dto/food-journal.dto';

/**
 * The AI Food Journal (Nutrition · 06).
 *
 * A citizen photographs (or describes) a meal; the AI identifies the items and
 * ESTIMATES their nutrition; the citizen reviews — and can change — every
 * quantity before anything is written. Three honesty rules hold throughout:
 *
 *   • Estimates are never presented as measurements. Every item carries the
 *     AI's confidence, the analysis note travels with the entry, and the day's
 *     totals are labelled as built from estimates.
 *
 *   • Totals are summed SERVER-side from the items at write time. A client
 *     cannot log totals that disagree with the items beneath them.
 *
 *   • The coach line is deterministic arithmetic against the citizen's own
 *     targets (computeTargets, with its published bases). No number in it is
 *     invented; when targets rest on assumed inputs, the summary says so —
 *     the same disclosure the targets screen already makes.
 *
 * When the AI key is off, analyze() says so plainly and the journal still
 * works: the citizen types items and their own numbers. Degraded, not fake.
 */

export interface JournalTotals {
  kcal: number; proteinG: number; carbG: number; fatG: number;
  fibreG: number; sugarG: number; sodiumMg: number; waterMl: number;
}

type EntryRow = {
  id: string; userId: string; at: Date; mealType: string; source: string;
  itemsJson: string; totalsJson: string; photoUrl: string | null; note: string | null; createdAt: Date;
};

const ZERO: JournalTotals = { kcal: 0, proteinG: 0, carbG: 0, fatG: 0, fibreG: 0, sugarG: 0, sodiumMg: 0, waterMl: 0 };

const parse = <T>(json: string | null, fallback: T): T => { try { return json ? JSON.parse(json) as T : fallback; } catch { return fallback; } };

export function sumItems(items: JournalItemDto[]): JournalTotals {
  const t = { ...ZERO };
  for (const it of items) {
    t.kcal += it.kcal; t.proteinG += it.proteinG; t.carbG += it.carbG; t.fatG += it.fatG;
    t.fibreG += it.fibreG ?? 0; t.sugarG += it.sugarG ?? 0; t.sodiumMg += it.sodiumMg ?? 0; t.waterMl += it.waterMl ?? 0;
  }
  for (const k of Object.keys(t) as (keyof JournalTotals)[]) t[k] = Math.round(t[k]);
  return t;
}

/**
 * The after-meal summary: plain arithmetic against the day's targets, phrased
 * once. Exported pure so the spec can pin every sentence.
 */
export function coachLines(totals: JournalTotals, target: { kcal: number; protein: number; fiber: number; sodiumMaxMg?: number }, personalised: boolean): string[] {
  const out: string[] = [];
  if (target.kcal > 0) {
    const left = target.kcal - totals.kcal;
    out.push(left >= 0
      ? `You're at ${Math.round((totals.kcal / target.kcal) * 100)}% of today's ${target.kcal.toLocaleString('en-IN')} kcal target — ${left.toLocaleString('en-IN')} kcal remaining.`
      : `You're ${Math.abs(left).toLocaleString('en-IN')} kcal over today's target — a lighter next meal brings the day back.`);
  }
  if (target.protein > 0) {
    const pct = Math.round((totals.proteinG / target.protein) * 100);
    out.push(pct >= 100 ? `Protein target met (${totals.proteinG} g of ${target.protein} g).`
      : `Protein: ${totals.proteinG} g of ${target.protein} g (${pct}%).`);
  }
  if (target.fiber > 0 && totals.fibreG < target.fiber * 0.5 && totals.kcal > target.kcal * 0.6) {
    out.push(`Fibre is behind (${totals.fibreG} g of ${target.fiber} g) — vegetables, fruit or whole grains later today would help.`);
  }
  if (target.sodiumMaxMg && totals.sodiumMg > target.sodiumMaxMg) {
    out.push(`Sodium is past today's ${target.sodiumMaxMg.toLocaleString('en-IN')} mg ceiling — lighter seasoning at the next meal helps.`);
  }
  if (!personalised) out.push('These targets rest partly on assumed inputs — complete your Food Preference Profile to make them yours.');
  return out;
}

@Injectable()
export class FoodJournalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly clock: ClockService,
    private readonly nutrition: NutritionService,
  ) {}

  private get entries() {
    return (this.prisma as unknown as {
      foodJournalEntry: {
        create(a: unknown): Promise<EntryRow>;
        findMany(a: unknown): Promise<EntryRow[]>;
        findUnique(a: unknown): Promise<EntryRow | null>;
        update(a: unknown): Promise<EntryRow>;
        delete(a: unknown): Promise<EntryRow>;
      };
    }).foodJournalEntry;
  }

  /** AI identification + estimation. Nothing is written — the citizen reviews first. */
  async analyze(userId: string, input: { photo?: string; mediaType?: string; text?: string }) {
    const hasPhoto = Boolean(input.photo);
    if (!hasPhoto && !(input.text ?? '').trim()) {
      throw new BadRequestException('Add a photo or describe the meal first.');
    }
    if (!this.ai.enabled) {
      return {
        available: false, items: [], note:
          'AI recognition is off right now — add the items and their numbers yourself below; your journal still works.',
      };
    }
    const result = await this.ai.analyzeMeal({
      ...(hasPhoto ? { image: { base64: this.stripDataUrl(input.photo as string), mediaType: input.mediaType || this.mediaTypeOf(input.photo as string) } } : {}),
      ...(input.text?.trim() ? { text: input.text } : {}),
    });
    if (!result) {
      return { available: false, items: [], note: 'Couldn’t read this one — try a clearer photo, or add the items yourself below.' };
    }
    return { available: true, items: result.items, note: result.note, totals: sumItems(result.items as JournalItemDto[]) };
  }

  /** Log a reviewed meal. Totals are recomputed here, never trusted. */
  async log(userId: string, dto: LogMealDto) {
    if (!dto.items.length) throw new BadRequestException('A meal needs at least one item.');
    const at = dto.at ? new Date(dto.at) : new Date();
    if (isNaN(at.getTime())) throw new BadRequestException('That time isn’t readable.');
    const totals = sumItems(dto.items);
    const row = await this.entries.create({
      data: {
        userId, at, mealType: dto.mealType, source: dto.source,
        itemsJson: JSON.stringify(dto.items), totalsJson: JSON.stringify(totals),
        photoUrl: dto.photoUrl ?? null, note: (dto.note ?? '').slice(0, 400) || null,
      },
    });
    const day = await this.day(userId, this.clock.dayIn(await this.tz(userId), at));
    return { entry: this.shape(row), day };
  }

  /** Adjust an entry's items (quantities corrected after the fact). */
  async update(userId: string, id: string, items: JournalItemDto[]) {
    const row = await this.entries.findUnique({ where: { id } });
    if (!row || row.userId !== userId) throw new NotFoundException('entry not found');
    if (!items.length) throw new BadRequestException('A meal needs at least one item — delete the entry instead.');
    const totals = sumItems(items);
    const next = await this.entries.update({
      where: { id }, data: { itemsJson: JSON.stringify(items), totalsJson: JSON.stringify(totals) },
    });
    return this.shape(next);
  }

  async remove(userId: string, id: string) {
    const row = await this.entries.findUnique({ where: { id } });
    if (!row || row.userId !== userId) throw new NotFoundException('entry not found');
    await this.entries.delete({ where: { id } });
    return { ok: true as const };
  }

  /**
   * One day of the journal: the timeline, its totals, the citizen's targets,
   * and the coach's read of where the day stands. `date` is the citizen's OWN
   * calendar day (their timezone), defaulting to today.
   */
  async day(userId: string, date?: string) {
    const tz = await this.tz(userId);
    const dayKey = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : this.clock.dayIn(tz, new Date());
    const { start, end } = this.dayBounds(dayKey, tz);
    // unbounded: one citizen's meals in one day — human-scale
    const rows = await this.entries.findMany({
      where: { userId, at: { gte: start, lt: end } }, orderBy: { at: 'asc' },
    }).catch(swallowed('nutrition.journal.day', [] as EntryRow[]));

    const totals = { ...ZERO };
    for (const r of rows) {
      const t = parse<JournalTotals>(r.totalsJson, ZERO);
      for (const k of Object.keys(totals) as (keyof JournalTotals)[]) totals[k] += t[k] ?? 0;
    }

    const target = await this.nutrition.targets(userId);
    const lines = coachLines(totals, target as { kcal: number; protein: number; fiber: number; sodiumMaxMg?: number }, (target as { personalised?: boolean }).personalised ?? false);
    return {
      date: dayKey,
      entries: rows.map((r) => this.shape(r)),
      totals,
      target: {
        kcal: target.kcal, proteinG: target.protein, carbG: target.carb, fatG: target.fat,
        fibreG: target.fiber, waterMl: (target as { waterMl?: number }).waterMl ?? 0,
        sodiumMaxMg: (target as { sodiumMaxMg?: number }).sodiumMaxMg,
        personalised: (target as { personalised?: boolean }).personalised ?? false,
        assumed: (target as { assumed?: string[] }).assumed ?? [],
      },
      remainingKcal: Math.max(0, target.kcal - totals.kcal),
      coach: lines,
      basis: 'Totals are built from AI estimates you reviewed (and anything you adjusted). Estimates, not measurements.',
    };
  }

  /** The last seven days, oldest first — the week strip and its averages. */
  async week(userId: string) {
    const tz = await this.tz(userId);
    const today = this.clock.dayIn(tz, new Date());
    const days: string[] = [];
    for (let i = 6; i >= 0; i--) days.push(this.addDays(today, -i));
    const { start } = this.dayBounds(days[0], tz);
    const { end } = this.dayBounds(days[6], tz);
    // unbounded: one citizen's meals in one week — human-scale
    const rows = await this.entries.findMany({
      where: { userId, at: { gte: start, lt: end } }, orderBy: { at: 'asc' },
    }).catch(swallowed('nutrition.journal.week', [] as EntryRow[]));

    const byDay = new Map<string, JournalTotals & { meals: number }>(days.map((d) => [d, { ...ZERO, meals: 0 }]));
    for (const r of rows) {
      const key = this.clock.dayIn(tz, r.at);
      const bucket = byDay.get(key);
      if (!bucket) continue;
      const t = parse<JournalTotals>(r.totalsJson, ZERO);
      for (const k of Object.keys(ZERO) as (keyof JournalTotals)[]) bucket[k] += t[k] ?? 0;
      bucket.meals += 1;
    }
    const target = await this.nutrition.targets(userId);
    const logged = days.filter((d) => (byDay.get(d)?.meals ?? 0) > 0);
    const avg = (k: keyof JournalTotals) =>
      logged.length ? Math.round(logged.reduce((s, d) => s + (byDay.get(d)?.[k] ?? 0), 0) / logged.length) : 0;
    return {
      days: days.map((d) => ({ date: d, ...(byDay.get(d) as JournalTotals & { meals: number }) })),
      targetKcal: target.kcal,
      // Averages over LOGGED days only — an empty day is "not recorded", never
      // "ate nothing". Absence and zero mean opposite things here.
      loggedDays: logged.length,
      avg: { kcal: avg('kcal'), proteinG: avg('proteinG'), carbG: avg('carbG'), fatG: avg('fatG'), fibreG: avg('fibreG'), waterMl: avg('waterMl') },
    };
  }

  // ─── helpers ───

  private shape(r: EntryRow) {
    return {
      id: r.id, at: r.at.toISOString(), mealType: r.mealType, source: r.source,
      items: parse<JournalItemDto[]>(r.itemsJson, []), totals: parse<JournalTotals>(r.totalsJson, ZERO),
      photoUrl: r.photoUrl, note: r.note,
    };
  }

  private async tz(userId: string): Promise<string> {
    return this.clock.timezoneFor(userId).catch(() => DEFAULT_TIMEZONE);
  }

  /** UTC instants bounding the citizen's own calendar day. */
  private dayBounds(dayKey: string, tz: string): { start: Date; end: Date } {
    // Find the instant local midnight falls on by scanning around UTC midnight
    // in 15-minute steps — offsets run to ±14h and include :30 and :45 zones
    // (IST, Nepal, Chatham), which is exactly why an hourly scan would clip
    // the first half hour of an Indian day. Dependency-free on purpose: the
    // repo carries no tz library.
    const STEP = 900_000; // 15 min
    const utcMidnight = new Date(`${dayKey}T00:00:00Z`).getTime();
    let start = utcMidnight;
    for (let s = -14 * 4; s <= 14 * 4; s++) {
      const t = utcMidnight - s * STEP;
      if (this.clock.dayIn(tz, new Date(t)) === dayKey && this.clock.dayIn(tz, new Date(t - STEP)) !== dayKey) {
        start = t;
        break;
      }
    }
    return { start: new Date(start), end: new Date(start + 24 * 3600_000) };
  }

  private addDays(dayKey: string, delta: number): string {
    const d = new Date(`${dayKey}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + delta);
    return d.toISOString().slice(0, 10);
  }

  private stripDataUrl(s: string): string {
    const i = s.indexOf('base64,');
    return i >= 0 ? s.slice(i + 7) : s;
  }

  private mediaTypeOf(s: string): string {
    const m = s.match(/^data:([\w/+.-]+);base64,/);
    return m?.[1] ?? 'image/jpeg';
  }
}
