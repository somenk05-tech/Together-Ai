import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { demoDataEnabled } from '../shared/demo-data';
import { randomBytes } from 'crypto';
import { PrismaService } from '../shared/prisma/prisma.service';
import { FinancialService } from '../financial/financial.service';
import { MailService } from '../mail/mail.service';
import { ticketReceipt } from '../mail/receipts';
import { CATEGORY_META, CATEGORIES } from './entertainment.constants';
import type { BookTicketDto, EventQueryDto, SaveWatchDto } from './dto/entertainment.dto';

type Tier = { name: string; priceInr: number; available: number };
type EventRow = { id: string; title: string; category: string; venue: string; city: string; date: string; time: string; description: string; posterUrl: string; priceFromInr: number; tiersJson: string };

/** One saved Watchlist title (stored as JSON on the user). */
export interface WatchItem {
  id: number; type: 'movie' | 'tv'; title: string;
  posterUrl: string | null; rating: number | null; releaseDate: string | null;
  language: string; genres: string[]; platform: string | null; savedAt: string;
}

const parseTiers = (json: string): Tier[] => { try { return JSON.parse(json) as Tier[]; } catch { return []; } };

@Injectable()
export class EntertainmentService implements OnModuleInit {
  private readonly logger = new Logger('EntertainmentService');

  /** Ids the deleted EVENT_SEEDS constant used to create. See entertainment.constants.ts. */
  private static readonly RETIRED_SEED_EVENT_IDS = [
    'ev_arijit', 'ev_dune', 'ev_zakir', 'ev_mughal', 'ev_rcbmi', 'ev_hotair', 'ev_indie', 'ev_kunal',
  ];

  /**
   * Clear invented events left by an earlier deploy. The seed constant is gone,
   * but rows it created would still be listed and still bookable — real money
   * for a concert that was never scheduled. Bookings block the delete, and that
   * is the case an operator most needs to hear about, so it is logged loudly.
   */
  async onModuleInit(): Promise<void> {
    if (demoDataEnabled()) return;
    const ids = EntertainmentService.RETIRED_SEED_EVENT_IDS;
    const gone = await this.prisma.event.deleteMany({ where: { id: { in: ids } } }).catch(() => null);
    if (gone === null) {
      this.logger.warn(
        `Could not remove retired seed events (${ids.join(', ')}) — a citizen has almost certainly booked one. Those tickets are for events that do not exist and need refunding.`,
      );
    }
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly financial: FinancialService, // ticket payments flow through the one city wallet
    private readonly mail: MailService,            // confirmations land in the city inbox + primary email
  ) {}

  categories() {
    return CATEGORIES.map((c) => ({ key: c.key, label: c.label, icon: c.icon }));
  }

  private shapeCard(e: EventRow) {
    const meta = CATEGORY_META[e.category] ?? { label: e.category, icon: '🎟', hue: 0 };
    return {
      id: e.id, title: e.title, category: e.category, categoryLabel: meta.label, icon: meta.icon,
      venue: e.venue, city: e.city, date: e.date, time: e.time, posterUrl: e.posterUrl, priceFromInr: e.priceFromInr,
    };
  }

  async events(query: EventQueryDto) {
    const rows = await this.prisma.event.findMany({ orderBy: { date: 'asc' } }) as EventRow[];
    return rows
      .filter((e) => (!query.category || e.category === query.category) && (!query.city || e.city.toLowerCase() === query.city.toLowerCase()))
      .map((e) => this.shapeCard(e));
  }

  async detail(id: string) {
    const e = await this.prisma.event.findUnique({ where: { id } }) as EventRow | null;
    if (!e) throw new NotFoundException('event not found');
    return { ...this.shapeCard(e), description: e.description, tiers: parseTiers(e.tiersJson) };
  }

  /** Book tickets — charges the city wallet (Financial), then issues a pass. */
  async book(userId: string, eventId: string, dto: BookTicketDto) {
    const e = await this.prisma.event.findUnique({ where: { id: eventId } }) as EventRow | null;
    if (!e) throw new NotFoundException('event not found');
    const tier = parseTiers(e.tiersJson).find((t) => t.name === dto.tier);
    if (!tier) throw new BadRequestException('unknown ticket tier');
    if (tier.available < dto.qty) throw new BadRequestException('not enough tickets in that tier');

    const totalInr = tier.priceInr * dto.qty;
    // Unified payment via the Financial hub (wallet or linked card).
    await this.financial.charge(userId, { hub: 'Entertainment', category: 'entertainment', label: `${e.title} · ${dto.tier} ×${dto.qty}`, amountInr: totalInr, method: dto.method });

    const code = 'TC-' + randomBytes(3).toString('hex').toUpperCase();
    await this.prisma.ticketBooking.create({
      data: { userId, eventId, title: e.title, tier: dto.tier, qty: dto.qty, totalInr, code, status: 'confirmed', eventDate: e.date, eventTime: e.time, venue: e.venue, city: e.city, category: e.category },
    });
    await this.mail.deliverSystem(userId, ticketReceipt({ title: e.title, tier: dto.tier, qty: dto.qty, totalInr, venue: e.venue, city: e.city, date: e.date, time: e.time, code })).catch(() => undefined);
    return this.myTickets(userId);
  }

  async myTickets(userId: string) {
    const rows = await this.prisma.ticketBooking.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
    return rows.map((t) => ({
      id: t.id, eventId: t.eventId, title: t.title, tier: t.tier, qty: t.qty, totalInr: t.totalInr, code: t.code, status: t.status,
      date: t.eventDate, time: t.eventTime, venue: t.venue, city: t.city,
      icon: CATEGORY_META[t.category]?.icon ?? '🎟', bookedOn: t.createdAt.toISOString().slice(0, 10),
    }));
  }

  // ─────────────── personal Watchlist (saved movies & series) ───────────────

  private async readWatchlist(userId: string): Promise<WatchItem[]> {
    const u = await this.prisma.user.findUnique({ where: { id: userId } }) as ({ watchlistJson?: string | null } | null);
    if (!u?.watchlistJson) return [];
    try { return JSON.parse(u.watchlistJson) as WatchItem[]; } catch { return []; }
  }

  private async writeWatchlist(userId: string, items: WatchItem[]): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { watchlistJson: JSON.stringify(items) } as never });
  }

  async watchlist(userId: string) {
    return { items: await this.readWatchlist(userId) };
  }

  /** Save a title — newest first, de-duplicated, capped at 300. */
  async addToWatchlist(userId: string, dto: SaveWatchDto) {
    const items = await this.readWatchlist(userId);
    const rest = items.filter((i) => !(i.id === dto.id && i.type === dto.type));
    const next: WatchItem[] = [{ ...dto, savedAt: new Date().toISOString() }, ...rest].slice(0, 300);
    await this.writeWatchlist(userId, next);
    return { items: next };
  }

  async removeFromWatchlist(userId: string, type: string, id: string) {
    const numId = Number(id);
    if (!Number.isInteger(numId) || (type !== 'movie' && type !== 'tv')) throw new BadRequestException('bad watchlist ref');
    const items = await this.readWatchlist(userId);
    const next = items.filter((i) => !(i.id === numId && i.type === type));
    await this.writeWatchlist(userId, next);
    return { items: next };
  }
}
