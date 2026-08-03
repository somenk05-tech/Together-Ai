import { swallow } from '../shared/swallow';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../shared/prisma/prisma.service';
import { ClockService } from '../shared/clock/clock.service';
import { FinancialService } from '../financial/financial.service';
import { composeTarot, spreadSize, SPREAD_NAME, DISCLAIMER, type SpreadKind, type TarotReadingOut } from './tarot-content';

/**
 * What a spread costs. ALL THREE ARE FREE FOR NOW.
 *
 * The Celtic Cross was ₹149 and Past·Present·Future ₹49. The paywall came down
 * across the whole hub — see the free path in drawSpread(), which does not call
 * the financial service at all rather than calling it with a zero.
 *
 * These stay a Record rather than becoming a deleted concept: the prices are a
 * product decision that has already changed once and will change again, and
 * `spreads()` hands them to the client so a screen never holds its own opinion
 * about what something costs.
 */
export const SPREAD_PRICE_INR: Record<SpreadKind, number> = {
  daily: 0,
  three: 0,
  celtic: 0,
};

/**
 * What the daily surface returns.
 *
 * Two shapes, and the discriminant is the honest part: `chosen: false` means
 * NOTHING HAS BEEN DEALT AND NOTHING HAS BEEN STORED — there is no card yet,
 * only a number of face-down ones to pick from. It is not an empty state and it
 * is not an error; it is the moment before the choice.
 */
export type DailyCardOut =
  | { chosen: false; fan: number; priceInr: 0; disclaimer: string }
  | (TarotReadingOut & { chosen: true; saved: boolean; priceInr: 0 });

export interface DrawSpreadDto {
  kind: 'three' | 'celtic';
  question: string;
  /** Which face-down cards were turned, in the order they were turned. Required. */
  picks: number[];
  method?: 'wallet' | 'card';
}

/**
 * How many face-down cards each spread lays out to choose from.
 *
 * Enough that choosing is choosing, few enough to lay on a phone. The Celtic
 * Cross needs ten of them, so its table has to be wider than the three-card
 * table or the last pick would be the only card left — a choice with one option
 * is not one.
 *
 * These are part of the API, not a stylesheet detail: the client draws exactly
 * this many backs, and the server refuses a pick outside the range, so the two
 * cannot disagree about what was on the table.
 */
export const SPREAD_FAN: Record<'three' | 'celtic', number> = {
  three: 12,
  celtic: 24,
};

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
        create: (a: unknown) => Promise<{ id: string }>;
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
   * How many face-down cards the daily fan offers.
   *
   * Seven because it has to be enough that choosing feels like choosing, and few
   * enough to lay out on a phone without becoming a grid. The number is part of
   * the API — the client draws exactly this many backs — so it lives here rather
   * than in a stylesheet.
   */
  static readonly DAILY_FAN = 7;

  /** The widest table any spread lays out — the outer bound a route can check. */
  static readonly MAX_FAN = Math.max(SPREAD_FAN.three, SPREAD_FAN.celtic, 7);

  /**
   * Card of the Day — free, one per citizen per day, and CHOSEN rather than dealt.
   *
   * WHAT CHANGED AND WHY IT HAD TO. This used to deal the card the moment the
   * page loaded. The screen then grew a spread of face-down cards to pick from,
   * and that would have been theatre: the card was already decided, so whichever
   * back you clicked, the same card turned over. A citizen finds that out by
   * reloading and picking a different one, and what they learn is that the
   * choice they were offered was not one.
   *
   * So the choice is real. Nothing is dealt on load and NOTHING IS STORED on
   * load; the position is part of the seed, so each of the seven backs is a
   * different card; and the first choice is written with `update: {}`, so it
   * cannot be re-rolled by choosing again.
   *
   * Everything that made the old version stable is kept, because all of it was
   * about which DAY it is and none of it was about which card:
   *
   *  - `@@unique([userId, kind, period])` still makes a second row for the same
   *    day impossible;
   *  - a failed timezone lookup still falls back to the city's own zone rather
   *    than the server's, so a transient database error cannot change the date;
   *  - a card records the zone it was drawn in and stays current until the day
   *    ends THERE, so changing zones (or flying somewhere) never re-deals;
   *  - two simultaneous choices still resolve to one row, and the loser is
   *    handed the winner's card rather than an error.
   */
  async dailyCard(userId: string): Promise<DailyCardOut> {
    const already = await this.todaysCard(userId);
    if (already) return { ...already.reading, chosen: true as const, saved: true, priceInr: 0 };
    return {
      chosen: false as const,
      fan: TarotService.DAILY_FAN,
      priceInr: 0,
      // The disclaimer is on the empty state too. It is not a footnote to a
      // reading, it is a statement about what this surface is, and somebody
      // deciding whether to turn a card should have read it before they do.
      disclaimer: DISCLAIMER,
    };
  }

  /**
   * Turn one of today's face-down cards.
   *
   * THE FIRST CHOICE WINS AND THE REQUESTED POSITION IS IGNORED IF ONE EXISTS.
   * That is not a courtesy to double-clicks; it is the whole point. A choice you
   * can retake until you like the answer is not a choice, and this is the only
   * place a citizen could otherwise reroll their day.
   */
  async chooseDailyCard(userId: string, position: number): Promise<DailyCardOut> {
    if (!Number.isInteger(position) || position < 0 || position >= TarotService.DAILY_FAN) {
      throw new BadRequestException('That is not one of the cards on the table.');
    }
    const already = await this.todaysCard(userId);
    if (already) return { ...already.reading, chosen: true as const, saved: true, priceInr: 0 };

    const tz = await this.clock.timezoneFor(userId);
    const period = this.clock.todayIn(tz);
    // The position is IN the seed, which is what makes the choice real: seven
    // positions are seven different shuffles and therefore seven different
    // cards. It is also why a reading stays reproducible — the seed is stored
    // with it, and it now records the choice as well as the day.
    const seed = `tarot:daily:${userId}:${period}:${position}`;
    const reading: TarotReadingOut = { ...composeTarot('daily', seed), tz, position };

    // Upsert, not create: two requests racing for the first card of the day both
    // succeed and both end up looking at the same row. `update: {}` is
    // deliberate — a card that has been turned is never turned again.
    const saved = await this.db.tarotReading.upsert({
      where: { userId_kind_period: { userId, kind: 'daily', period } },
      create: { userId, kind: 'daily', period, seed, readingJson: JSON.stringify(reading), priceInr: 0 },
      update: {},
    }).then((r) => r, () => null); // optional-by-design: history is nice to have; the reading stands without it

    // Whoever won the race owns the card, and it may not be the one composed
    // above — so the stored row is preferred over the local draw.
    const stored = saved ? TarotService.parseRow(saved) : null;
    return { ...(stored ?? reading), chosen: true as const, saved: !!saved, priceInr: 0 };
  }

  /**
   * The card this citizen has already turned today, or null.
   *
   * The second half is the timezone-drift guard, and it is the reason this is a
   * function rather than one findUnique. No row under today's date does NOT mean
   * a new day: the citizen may have changed zone since choosing, which re-dates
   * "today" underneath them. So the last card is asked whether its OWN day has
   * ended, measured in the zone it was drawn in.
   */
  private async todaysCard(userId: string): Promise<{ reading: TarotReadingOut } | null> {
    const tz = await this.clock.timezoneFor(userId);
    const period = this.clock.todayIn(tz);

    const hit = await swallow(this.db.tarotReading
      .findUnique({ where: { userId_kind_period: { userId, kind: 'daily', period } } }), 'tarot: today-card read', { userId });
    if (hit) {
      const stored = TarotService.parseRow(hit);
      // An unreadable row still means a card was turned today. Recomposing it
      // from the stored seed is exact; guessing a new one would deal twice.
      if (stored) return { reading: stored };
      if (hit.seed) return { reading: { ...composeTarot('daily', hit.seed), tz } };
    }

    const last = await swallow(this.db.tarotReading
      .findFirst({ where: { userId, kind: 'daily' }, orderBy: { createdAt: 'desc' } }), 'tarot: last-card read', { userId });
    const prev = last ? TarotService.parseRow(last) : null;
    if (last?.period && prev?.tz && this.clock.todayIn(prev.tz) === last.period) {
      return { reading: prev };
    }
    return null;
  }

  /**
   * A spread, drawn against a question, from cards the citizen turned themselves.
   *
   * NOTHING IS DEALT UNTIL EVERY POSITION HAS BEEN CHOSEN, which is the same
   * rule the Card of the Day already keeps and for the same reason. This used
   * to deal all ten the moment the button was pressed; laying backs out in front
   * of a reading that has already happened is theatre, and a citizen finds out
   * the first time they notice their choice changed nothing.
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

    /**
     * The picks are checked here and not only at the controller, because this
     * is the rule and the controller is a door. Three separate things can go
     * wrong and they are three different sentences to a person:
     *
     *  · not enough turned — the reading is incomplete, and dealing the rest
     *    ourselves is precisely what this change removed;
     *  · the same card twice — the Tower cannot sit in two positions;
     *  · a card that was not on the table — a client out of step with
     *    SPREAD_FAN, which must fail rather than silently wrap.
     */
    const need = spreadSize(kind);
    const fan = SPREAD_FAN[kind === 'celtic' ? 'celtic' : 'three'];
    const picks = Array.isArray(dto.picks) ? dto.picks : [];
    if (picks.length !== need) {
      throw new BadRequestException(`Turn all ${need} cards before the reading is drawn.`);
    }
    if (new Set(picks).size !== need) {
      throw new BadRequestException('Each position takes a different card — one of these was turned twice.');
    }
    if (picks.some((p) => !Number.isInteger(p) || p < 0 || p >= fan)) {
      throw new BadRequestException('One of those is not a card on the table.');
    }

    const price = SPREAD_PRICE_INR[kind];
    // Fail fast on an empty wallet rather than after the draw — but only when
    // there is something to pay.
    if (price > 0) await this.financial.assertCanPay(userId, price, dto.method);

    // Fresh entropy per draw: two identical questions must not deal identical
    // cards. Stored, so this specific reading stays reproducible forever — and
    // the picks ride in the seed for the same reason, so the whole draw is
    // regenerable from one string. See picksIn() in tarot-content.ts.
    const seed = `tarot:${kind}:${userId}:${randomBytes(8).toString('hex')}:picks:${picks.join('-')}`;
    const reading = composeTarot(kind, seed, question);
    const data = {
      userId, kind, period: null, question, seed,
      readingJson: JSON.stringify(reading), priceInr: price,
    };

    /**
     * A FREE SPREAD DOES NOT TOUCH THE WALLET AT ALL.
     *
     * Not `paid(..., amountInr: 0)`, which would be the smaller diff and the
     * wrong one: assertCanPay still demands a linked card when the method is
     * `card`, so a citizen with no card would be refused a free reading; and
     * charge() would write a ₹0 line into the ledger, so every free draw would
     * leave a transaction in the Financial hub that moved no money. A statement
     * full of zero-rupee entries is a worse record than no entry.
     */
    if (price === 0) {
      const free = await this.db.tarotReading.create({ data });
      this.logger.log(`Tarot ${kind} for ${userId} · free · ${spreadSize(kind)} cards`);
      return { ...reading, id: free.id, priceInr: 0 };
    }

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
      }).tarotReading.create({ data }),
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
        // How many backs to lay out. The daily card has its own fan, which is a
        // different number for a different surface.
        fan: k === 'daily' ? TarotService.DAILY_FAN : SPREAD_FAN[k],
      })),
    };
  }
}
