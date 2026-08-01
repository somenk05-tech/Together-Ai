import { swallow } from '../shared/swallow';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../shared/prisma/prisma.service';
import { ClockService } from '../shared/clock/clock.service';
import { FinancialService } from '../financial/financial.service';
import { composeTarot, spreadSize, SPREAD_NAME, DISCLAIMER, type SpreadKind, type TarotReadingOut } from './tarot-content';

/** Card of the Day is free; a spread you ask a question of is not. */
export const SPREAD_PRICE_INR: Record<SpreadKind, number> = {
  daily: 0,
  three: 49,
  celtic: 149,
};

export interface DrawSpreadDto {
  kind: 'three' | 'celtic';
  question: string;
  method?: 'wallet' | 'card';
}

interface TarotRow {
  id: string; kind: string; period: string | null; question: string | null;
  seed: string; readingJson: string; priceInr: number; createdAt: Date;
}

/**
 * Tarot — the fourth surface of the Astrology Zone.
 *
 * Deliberately independent of the birth chart. Tarot is not astrology: it needs
 * no birth time, no place, no ascendant, and gating it behind the birth-details
 * profile the way the horoscopes are gated would be inventing a requirement the
 * practice doesn't have. A citizen who has never filled in their birth details
 * can still draw a card.
 *
 * Every reading is reproducible. The seed is stored with it, so the same draw
 * can be regenerated and verified later — see tarot-content.ts.
 */
@Injectable()
export class TarotService {
  private readonly logger = new Logger('TarotService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
    private readonly financial: FinancialService,
  ) {}

  /** Loose accessor: the generated client may lag the schema mid-deploy. */
  private get db() {
    return this.prisma as unknown as {
      tarotReading: {
        findUnique: (a: unknown) => Promise<TarotRow | null>;
        findFirst: (a: unknown) => Promise<TarotRow | null>;
        findMany: (a: unknown) => Promise<TarotRow[]>;
        upsert: (a: unknown) => Promise<TarotRow>;
      };
    };
  }

  /** A stored row's reading, or null if the JSON is unreadable. */
  private static parseRow(row: TarotRow): TarotReadingOut | null {
    try { return JSON.parse(row.readingJson) as TarotReadingOut; } catch { return null; }
  }

  /**
   * Card of the Day — free, one per citizen per day, and not re-drawable.
   *
   * `@@unique([userId, kind, period])` already makes a second row for the same
   * day impossible. The work here is making sure `period` names the same day on
   * every request, because a unique key is only as stable as the value you put
   * in it. Three things could previously shift it and hand out a fresh card:
   *
   *  - a failed timezone lookup fell back to the SERVER's day, which for a
   *    citizen in Asia/Kolkata is a different date for five and a half hours out
   *    of every twenty-four. Reloading in that window dealt a second card. The
   *    ClockService fallback is the city's own zone, so a transient database
   *    error can no longer change which day it is;
   *  - editing the timezone on your profile re-dated today and dealt again. Now
   *    the card records the zone it was drawn in and stays current until the day
   *    ends THERE, so changing zones (or flying somewhere) never re-deals;
   *  - two simultaneous requests both missed the read and both inserted. The
   *    write is now a single upsert, so the loser gets the winner's row back
   *    instead of an error that was being swallowed.
   *
   * The seed is derived from the citizen and the period, so a card is stable
   * across reloads and devices even before it is stored — the row records which
   * day was drawn, it doesn't decide what the card is.
   */
  async dailyCard(userId: string): Promise<TarotReadingOut & { saved: boolean; priceInr: number }> {
    const tz = await this.clock.timezoneFor(userId);
    const period = this.clock.todayIn(tz);

    // Today's card, if it has already been dealt.
    const hit = await swallow(this.db.tarotReading
      .findUnique({ where: { userId_kind_period: { userId, kind: 'daily', period } } }), 'tarot: today-card read', { userId });
    if (hit) {
      const stored = TarotService.parseRow(hit);
      if (stored) return { ...stored, saved: true, priceInr: 0 };
      // Unreadable row — recompose. Same period, same seed, same card.
    }

    // No row under today's date. That does NOT mean a new day: the citizen may
    // have changed timezone since drawing, which re-dates "today" underneath
    // them. Ask the last card whether its own day has actually ended, measured
    // in the zone it was drawn in.
    if (!hit) {
      const last = await swallow(this.db.tarotReading
        .findFirst({ where: { userId, kind: 'daily' }, orderBy: { createdAt: 'desc' } }), 'tarot: last-card read', { userId });
      const prev = last ? TarotService.parseRow(last) : null;
      if (last?.period && prev?.tz && this.clock.todayIn(prev.tz) === last.period) {
        return { ...prev, saved: true, priceInr: 0 };
      }
    }

    const seed = `tarot:daily:${userId}:${period}`;
    const reading: TarotReadingOut = { ...composeTarot('daily', seed), tz };

    // Upsert, not create: two requests racing for the first card of the day both
    // succeed, and both end up looking at the same row. `update: {}` is
    // deliberate — a card that has been dealt is never rewritten.
    const saved = await this.db.tarotReading.upsert({
      where: { userId_kind_period: { userId, kind: 'daily', period } },
      create: { userId, kind: 'daily', period, seed, readingJson: JSON.stringify(reading), priceInr: 0 },
      update: {},
    }).then((r) => r, () => null); // optional-by-design: history is nice to have; the reading stands without it

    // Whoever won the race owns the card. Same period means the same seed and
    // therefore the same draw, so this only matters for the recorded zone.
    const stored = saved ? TarotService.parseRow(saved) : null;
    return { ...(stored ?? reading), saved: !!saved, priceInr: 0 };
  }

  /**
   * A paid spread, drawn against a question.
   *
   * The draw happens BEFORE the charge and the charge happens with the save, so
   * a failure anywhere leaves the citizen either un-charged or holding the
   * reading — never charged with nothing to show. Composing is pure computation,
   * so doing it first costs nothing if the payment then fails.
   */
  async drawSpread(userId: string, dto: DrawSpreadDto): Promise<TarotReadingOut & { id: string; priceInr: number }> {
    const kind: SpreadKind = dto.kind === 'celtic' ? 'celtic' : 'three';
    const question = (dto.question ?? '').trim();
    if (question.length < 5) throw new BadRequestException('Ask a question the cards can answer — a few words at least.');
    if (question.length > 300) throw new BadRequestException('Keep the question under 300 characters.');

    const price = SPREAD_PRICE_INR[kind];
    // Fail fast on an empty wallet rather than after the draw.
    await this.financial.assertCanPay(userId, price, dto.method);

    // Fresh entropy per draw: two identical questions must not deal identical
    // cards. Stored, so this specific reading stays reproducible forever.
    const seed = `tarot:${kind}:${userId}:${randomBytes(8).toString('hex')}`;
    const reading = composeTarot(kind, seed, question);

    const row = await this.financial.paid<{ id: string }>(
      userId,
      {
        hub: 'Astrology', category: 'astrology',
        label: `Tarot · ${SPREAD_NAME[kind]}`,
        amountInr: price, method: dto.method,
      },
      // Cast for the same reason the `db` accessor above exists: a newly added
      // model isn't in the generated client until someone regenerates it, and a
      // deploy shouldn't fail to compile on that. The runtime client has it.
      (tx) => (tx as unknown as {
        tarotReading: { create(a: unknown): Promise<{ id: string }> };
      }).tarotReading.create({
        data: {
          userId, kind, period: null, question, seed,
          readingJson: JSON.stringify(reading), priceInr: price,
        },
      }),
    );

    this.logger.log(`Tarot ${kind} for ${userId} · ₹${price} · ${spreadSize(kind)} cards`);
    return { ...reading, id: row.id, priceInr: price };
  }

  /** Past readings, newest first. */
  async history(userId: string, limit = 50) {
    // [] on a failed read showed an empty history page — absence never
    // established.
    const rows = (await swallow(this.db.tarotReading
      .findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: Math.min(Math.max(limit, 1), 100) }), 'tarot: history read', { userId })) ?? ([] as TarotRow[]);
    return rows.map((r) => {
      let reading: TarotReadingOut | null = null;
      try { reading = JSON.parse(r.readingJson) as TarotReadingOut; } catch { reading = null; }
      return {
        id: r.id, kind: r.kind, question: r.question, priceInr: r.priceInr,
        createdAt: r.createdAt, seed: r.seed,
        spreadName: reading?.spreadName ?? SPREAD_NAME[(r.kind as SpreadKind)] ?? r.kind,
        cards: reading?.cards ?? [],
        summary: reading?.summary ?? '',
        disclaimer: DISCLAIMER,
      };
    });
  }

  /** What each spread costs and how many cards it deals — drives the UI. */
  spreads() {
    return {
      disclaimer: DISCLAIMER,
      spreads: (['daily', 'three', 'celtic'] as SpreadKind[]).map((k) => ({
        kind: k, name: SPREAD_NAME[k], cards: spreadSize(k), priceInr: SPREAD_PRICE_INR[k],
      })),
    };
  }
}
