import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../shared/prisma/prisma.service';
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
    private readonly financial: FinancialService,
  ) {}

  /** Loose accessor: the generated client may lag the schema mid-deploy. */
  private get db() {
    return this.prisma as unknown as {
      tarotReading: {
        findUnique: (a: unknown) => Promise<TarotRow | null>;
        findMany: (a: unknown) => Promise<TarotRow[]>;
        create: (a: unknown) => Promise<TarotRow>;
      };
      masterProfile: { findUnique: (a: unknown) => Promise<{ timeZone: string | null } | null> };
    };
  }

  /** The citizen's own calendar day — a Card of the Day should turn over at
   *  THEIR midnight, not the server's. */
  private async todayFor(userId: string): Promise<string> {
    const row = await this.db.masterProfile
      .findUnique({ where: { userId }, select: { timeZone: true } })
      .catch(() => null);
    const tz = row?.timeZone;
    try {
      if (tz) {
        return new Intl.DateTimeFormat('en-CA', {
          timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
        }).format(new Date());
      }
    } catch { /* unparseable zone — fall through to the server day */ }
    return new Date().toISOString().slice(0, 10);
  }

  /**
   * Card of the Day — free, and the same card all day.
   *
   * Seeded from the citizen and the date, so it is stable across reloads and
   * devices without needing to be stored first. The row is written for history;
   * losing it would not change tomorrow's card, only the record of today's.
   */
  async dailyCard(userId: string): Promise<TarotReadingOut & { saved: boolean; priceInr: number }> {
    const period = await this.todayFor(userId);
    const seed = `tarot:daily:${userId}:${period}`;

    const hit = await this.db.tarotReading
      .findUnique({ where: { userId_kind_period: { userId, kind: 'daily', period } } })
      .catch(() => null);
    if (hit) {
      try { return { ...(JSON.parse(hit.readingJson) as TarotReadingOut), saved: true, priceInr: 0 }; }
      catch { /* unreadable row — recompose below, the seed makes it identical */ }
    }

    const reading = composeTarot('daily', seed);
    await this.db.tarotReading.create({
      data: { userId, kind: 'daily', period, seed, readingJson: JSON.stringify(reading), priceInr: 0 },
    }).catch(() => undefined); // history is nice to have; the reading stands without it
    return { ...reading, saved: false, priceInr: 0 };
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
    const rows = await this.db.tarotReading
      .findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: Math.min(Math.max(limit, 1), 100) })
      .catch(() => [] as TarotRow[]);
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
