import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { demoDataEnabled, DEMO_DISABLED_REASON } from '../shared/demo-data';
import { randomBytes } from 'crypto';
import { PrismaService } from '../shared/prisma/prisma.service';
import { ORDER_HISTORY_CAP } from '../shared/paging';
import { FinancialService } from '../financial/financial.service';
import { MailService } from '../mail/mail.service';
import { packageReceipt, flightReceipt } from '../mail/receipts';
import { CATEGORIES, CATEGORY_META, PACKAGE_SEEDS, hero } from './travel.constants';
import { searchFlights, findFlight, airportOptions, type SearchInput } from './travel-flights';
import type { PackageQueryDto, BookPackageDto, FlightSearchDto, BookFlightDto } from './dto/travel.dto';

type PkgRow = { id: string; title: string; destination: string; country: string; category: string; nights: number; days: number; priceFromInr: number; summary: string; heroUrl: string; highlightsJson: string; inclusionsJson: string; itineraryJson: string; tiersJson: string };
const parse = <T>(json: string, fb: T): T => { try { return JSON.parse(json) as T; } catch { return fb; } };
const code = () => 'TC-' + randomBytes(3).toString('hex').toUpperCase();

@Injectable()
export class TravelService implements OnModuleInit {
  private readonly logger = new Logger('TravelService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly financial: FinancialService, // bookings pay through the one city wallet
    private readonly mail: MailService,            // confirmations land in the city inbox + primary email
  ) {}

  async onModuleInit(): Promise<void> { await this.ensureSeeds(); }

  categories() { return CATEGORIES.map((c) => ({ key: c.key, label: c.label, icon: c.icon })); }

  // ─────────────── curated packages ───────────────
  private card(p: PkgRow) {
    const meta = CATEGORY_META[p.category] ?? { label: p.category, icon: '🧳', hue: 0 };
    return { id: p.id, title: p.title, destination: p.destination, country: p.country, category: p.category, categoryLabel: meta.label, icon: meta.icon, nights: p.nights, days: p.days, priceFromInr: p.priceFromInr, summary: p.summary, heroUrl: p.heroUrl };
  }

  async packages(query: PackageQueryDto) {
    const rows = await this.prisma.travelPackage.findMany({ orderBy: { priceFromInr: 'asc' } }) as PkgRow[];
    return rows.filter((p) => !query.category || p.category === query.category).map((p) => this.card(p));
  }

  async packageDetail(id: string) {
    const p = await this.prisma.travelPackage.findUnique({ where: { id } }) as PkgRow | null;
    if (!p) throw new NotFoundException('package not found');
    return {
      ...this.card(p),
      highlights: parse<string[]>(p.highlightsJson, []),
      inclusions: parse<string[]>(p.inclusionsJson, []),
      itinerary: parse<{ day: number; title: string; detail: string }[]>(p.itineraryJson, []),
      tiers: parse<{ name: string; priceInr: number; perks: string }[]>(p.tiersJson, []),
    };
  }

  async bookPackage(userId: string, id: string, dto: BookPackageDto) {
    const p = await this.prisma.travelPackage.findUnique({ where: { id } }) as PkgRow | null;
    if (!p) throw new NotFoundException('package not found');
    const tier = parse<{ name: string; priceInr: number }[]>(p.tiersJson, []).find((t) => t.name === dto.tier);
    if (!tier) throw new BadRequestException('unknown tier');
    const totalInr = tier.priceInr * dto.pax;
    const bookingCode = code();
    // Charge and booking in one transaction — a failure between them used to
    // take the money and leave no trip.
    await this.financial.paid(
      userId,
      { hub: 'Travel', category: 'travel', label: `${p.title} · ${dto.tier} ×${dto.pax}`, amountInr: totalInr, method: dto.method },
      (tx) => tx.tripBooking.create({
        data: {
          userId, kind: 'package', title: p.title, subtitle: `${p.nights}N/${p.days}D · ${p.destination}`, tier: dto.tier, pax: dto.pax,
          totalInr, code: bookingCode, status: 'confirmed', category: p.category,
          detailJson: JSON.stringify({ destination: p.destination, startDate: dto.startDate ?? null, nights: p.nights }),
        },
      }),
    );
    await this.mail.deliverSystem(userId, packageReceipt({ title: p.title, destination: p.destination, nights: p.nights, days: p.days, tier: dto.tier, pax: dto.pax, totalInr, code: bookingCode, startDate: dto.startDate ?? null })).catch(() => undefined);
    return this.myTrips(userId);
  }

  // ─────────────── flights (Skyscanner-style, no API) ───────────────
  airports() { return airportOptions(); }

  flightSearch(dto: FlightSearchDto) {
    const input: SearchInput = { from: dto.from.toUpperCase(), to: dto.to.toUpperCase(), date: dto.date, pax: dto.pax, cabin: dto.cabin };
    // searchFlights synthesises schedules and fares and attributes them to real
    // carriers. Without a booking provider behind it, the honest answer is that
    // there are no flights to show — not a plausible-looking list.
    if (!demoDataEnabled()) {
      return {
        from: input.from, to: input.to, date: dto.date, pax: dto.pax, cabin: dto.cabin,
        count: 0, flights: [], available: false, reason: DEMO_DISABLED_REASON,
      };
    }
    const { flights, from, to } = searchFlights(input);
    return { from, to, date: dto.date, pax: dto.pax, cabin: dto.cabin, count: flights.length, flights, available: true };
  }

  async bookFlight(userId: string, dto: BookFlightDto) {
    if (!demoDataEnabled()) {
      throw new BadRequestException('Flight booking is not available — no airline provider is connected.');
    }
    const input: SearchInput = { from: dto.from.toUpperCase(), to: dto.to.toUpperCase(), date: dto.date, pax: dto.pax, cabin: dto.cabin };
    const flight = findFlight(input, dto.flightId);
    if (!flight) throw new BadRequestException('flight no longer available — search again');
    const totalInr = flight.priceInr * dto.pax;
    const bookingCode = code();
    await this.financial.paid(
      userId,
      { hub: 'Travel', category: 'travel', label: `Flight ${flight.from}→${flight.to} · ${flight.airline} ×${dto.pax}`, amountInr: totalInr, method: dto.method },
      (tx) => tx.tripBooking.create({
        data: {
          userId, kind: 'flight', title: `${flight.from} → ${flight.to}`, subtitle: `${flight.airline} ${flight.flightNo} · ${dto.date}`, tier: flight.cabin, pax: dto.pax,
          totalInr, code: bookingCode, status: 'confirmed', category: 'flight',
          detailJson: JSON.stringify({ airline: flight.airline, flightNo: flight.flightNo, departTime: flight.departTime, arriveTime: flight.arriveTime, durationLabel: flight.durationLabel, stopLabel: flight.stopLabel, date: dto.date }),
        },
      }),
    );
    await this.mail.deliverSystem(userId, flightReceipt({ from: flight.from, to: flight.to, airline: flight.airline, flightNo: flight.flightNo, departTime: flight.departTime, arriveTime: flight.arriveTime, durationLabel: flight.durationLabel, stopLabel: flight.stopLabel, cabin: flight.cabin, date: dto.date, pax: dto.pax, totalInr, code: bookingCode })).catch(() => undefined);
    return this.myTrips(userId);
  }

  // ─────────────── my trips ───────────────
  async myTrips(userId: string) {
    const rows = await this.prisma.tripBooking.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: ORDER_HISTORY_CAP });
    return rows.map((t) => ({
      id: t.id, kind: t.kind, title: t.title, subtitle: t.subtitle, tier: t.tier, pax: t.pax,
      totalInr: t.totalInr, code: t.code, status: t.status,
      icon: t.kind === 'flight' ? '✈️' : CATEGORY_META[t.category]?.icon ?? '🧳',
      detail: parse<Record<string, unknown>>(t.detailJson, {}), bookedOn: t.createdAt.toISOString().slice(0, 10),
    }));
  }

  private async ensureSeeds(): Promise<void> {
    // PACKAGE_SEEDS are invented tours — full itineraries and three price tiers,
    // bookable at up to ₹148,000 a head, with an emailed receipt. Off a demo
    // deployment they must not exist, and any left by an earlier deploy go too.
    if (!demoDataEnabled()) {
      const ids = PACKAGE_SEEDS.map((s) => s.id);
      const gone = await this.prisma.travelPackage.deleteMany({ where: { id: { in: ids } } })
        .catch(() => null);
      if (gone === null) {
        this.logger.warn(
          `Could not remove seeded travel packages (${ids.join(', ')}) — most likely a real booking references one. Resolve those bookings, then restart.`,
        );
      }
      return;
    }
    try { if ((await this.prisma.travelPackage.count()) > 0) return; } catch { return; }
    for (const s of PACKAGE_SEEDS) {
      const hue = CATEGORY_META[s.category]?.hue ?? 0;
      await this.prisma.travelPackage.create({
        data: {
          id: s.id, title: s.title, destination: s.destination, country: s.country, category: s.category,
          nights: s.nights, days: s.days, priceFromInr: s.priceFromInr, summary: s.summary, heroUrl: hero(s.title, hue),
          highlightsJson: JSON.stringify(s.highlights), inclusionsJson: JSON.stringify(s.inclusions),
          itineraryJson: JSON.stringify(s.itinerary), tiersJson: JSON.stringify(s.tiers),
        },
      }).catch(() => undefined);
    }
  }
}
