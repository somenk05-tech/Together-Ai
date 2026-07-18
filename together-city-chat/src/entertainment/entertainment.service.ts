import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../shared/prisma/prisma.service';
import { FinancialService } from '../financial/financial.service';
import { MailService } from '../mail/mail.service';
import { ticketReceipt } from '../mail/receipts';
import { CATEGORY_META, CATEGORIES, EVENT_SEEDS, poster } from './entertainment.constants';
import type { BookTicketDto, EventQueryDto } from './dto/entertainment.dto';

type Tier = { name: string; priceInr: number; available: number };
type EventRow = { id: string; title: string; category: string; venue: string; city: string; date: string; time: string; description: string; posterUrl: string; priceFromInr: number; tiersJson: string };

const parseTiers = (json: string): Tier[] => { try { return JSON.parse(json) as Tier[]; } catch { return []; } };

@Injectable()
export class EntertainmentService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly financial: FinancialService, // ticket payments flow through the one city wallet
    private readonly mail: MailService,            // confirmations land in the city inbox + primary email
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureSeeds();
  }

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

  private async ensureSeeds(): Promise<void> {
    try {
      if ((await this.prisma.event.count()) > 0) return;
    } catch { return; }
    for (const s of EVENT_SEEDS) {
      const hue = CATEGORY_META[s.category]?.hue ?? 0;
      await this.prisma.event.create({
        data: { id: s.id, title: s.title, category: s.category, venue: s.venue, city: s.city, date: s.date, time: s.time, description: s.description, posterUrl: poster(s.title, hue), priceFromInr: s.priceFromInr, tiersJson: JSON.stringify(s.tiers) },
      }).catch(() => undefined);
    }
  }
}
