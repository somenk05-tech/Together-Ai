import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../shared/prisma/prisma.service';
import { FinancialService } from '../financial/financial.service';
import { MailService } from '../mail/mail.service';
import { orderReceipt, tableReceipt } from '../mail/receipts';
import { CUISINES, CUISINE_META, DIET_ALLOW, DIET_LABEL, RESTAURANT_SEEDS, hero, type Dish } from './restaurants.constants';
import type { PlaceOrderDto, ReserveTableDto, RestaurantQueryDto } from './dto/restaurants.dto';

type RestaurantRow = {
  id: string; name: string; cuisine: string; area: string; city: string;
  rating: number; priceForTwoInr: number; tagline: string; openHours: string;
  vegFriendly: boolean; heroUrl: string; menuJson: string;
};

const parseMenu = (json: string): Dish[] => { try { return JSON.parse(json) as Dish[]; } catch { return []; } };
const code = () => 'TC-' + randomBytes(3).toString('hex').toUpperCase();

@Injectable()
export class RestaurantsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly financial: FinancialService, // food orders flow through the one city wallet
    private readonly mail: MailService,            // confirmations land in the city inbox + primary email
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureSeeds();
  }

  cuisines() {
    return CUISINES.map((c) => ({ key: c.key, label: c.label, icon: c.icon }));
  }

  /** The user's dietary pattern from the Nutrition hub (source of truth), if they have one. */
  private async userDiet(userId: string): Promise<string | null> {
    try {
      const pref = await this.prisma.foodPref.findUnique({ where: { userId } });
      return pref?.diet ?? null;
    } catch { return null; }
  }

  private shapeCard(r: RestaurantRow) {
    const meta = CUISINE_META[r.cuisine] ?? { label: r.cuisine, icon: '🍽', hue: 0 };
    return {
      id: r.id, name: r.name, cuisine: r.cuisine, cuisineLabel: meta.label, icon: meta.icon,
      area: r.area, city: r.city, rating: r.rating, priceForTwoInr: r.priceForTwoInr,
      tagline: r.tagline, openHours: r.openHours, vegFriendly: r.vegFriendly, heroUrl: r.heroUrl,
    };
  }

  async browse(userId: string, query: RestaurantQueryDto) {
    const rows = await this.prisma.restaurant.findMany() as RestaurantRow[];
    const diet = await this.userDiet(userId);
    const allow = diet ? DIET_ALLOW[diet] ?? null : null;
    return rows
      .filter((r) => (!query.cuisine || r.cuisine === query.cuisine) && (!query.vegOnly || r.vegFriendly))
      .sort((a, b) => b.rating - a.rating)
      .map((r) => {
        const card = this.shapeCard(r);
        // Cross-hub: how much of the menu fits the diner's Nutrition diet profile.
        if (allow) {
          const menu = parseMenu(r.menuJson);
          const fit = menu.filter((d) => allow.includes(d.diet)).length;
          return { ...card, dietFitCount: fit, dietTotal: menu.length, dietLabel: DIET_LABEL[diet!] ?? diet };
        }
        return card;
      });
  }

  async detail(userId: string, id: string) {
    const r = await this.prisma.restaurant.findUnique({ where: { id } }) as RestaurantRow | null;
    if (!r) throw new NotFoundException('restaurant not found');
    const diet = await this.userDiet(userId);
    const allow = diet ? DIET_ALLOW[diet] ?? null : null;
    const menu = parseMenu(r.menuJson).map((d) => ({
      ...d,
      dietLabel: DIET_LABEL[d.diet] ?? d.diet,
      // fitsYourDiet is null when the user has no Nutrition profile yet (nothing to compare against).
      fitsYourDiet: allow ? allow.includes(d.diet) : null,
    }));
    // group by section, preserving first-seen order
    const sections: { section: string; items: typeof menu }[] = [];
    for (const d of menu) {
      let s = sections.find((x) => x.section === d.section);
      if (!s) { s = { section: d.section, items: [] }; sections.push(s); }
      s.items.push(d);
    }
    return {
      ...this.shapeCard(r),
      dietProfile: diet ? (DIET_LABEL[diet] ?? diet) : null,
      sections,
    };
  }

  /** Place a food order — charges the city wallet (Financial), then records the order. */
  async placeOrder(userId: string, restaurantId: string, dto: PlaceOrderDto) {
    const r = await this.prisma.restaurant.findUnique({ where: { id: restaurantId } }) as RestaurantRow | null;
    if (!r) throw new NotFoundException('restaurant not found');
    const menu = parseMenu(r.menuJson);
    const lines = dto.items.map((it) => {
      const dish = menu.find((d) => d.id === it.dishId);
      if (!dish) throw new BadRequestException(`unknown dish ${it.dishId}`);
      return { dishId: dish.id, name: dish.name, qty: it.qty, priceInr: dish.priceInr, lineInr: dish.priceInr * it.qty };
    });
    const subtotal = lines.reduce((s, l) => s + l.lineInr, 0);
    const packingInr = dto.mode === 'delivery' ? 40 : 0;
    const taxInr = Math.round(subtotal * 0.05); // 5% GST
    const totalInr = subtotal + packingInr + taxInr;

    // Unified payment via the Financial hub (wallet or linked card).
    await this.financial.charge(userId, { hub: 'Restaurants', category: 'dining', label: `${r.name} · ${lines.length} item(s)`, amountInr: totalInr, method: dto.method });

    const orderCode = code();
    await this.prisma.diningOrder.create({
      data: {
        userId, restaurantId, restaurantName: r.name, area: r.area, mode: dto.mode,
        itemsJson: JSON.stringify(lines), subtotalInr: subtotal, packingInr, taxInr, totalInr,
        code: orderCode, status: 'confirmed',
      },
    });
    await this.mail.deliverSystem(userId, orderReceipt({ restaurantName: r.name, area: r.area, mode: dto.mode, items: lines.map((l) => ({ name: l.name, qty: l.qty, lineInr: l.lineInr })), subtotalInr: subtotal, packingInr, taxInr, totalInr, code: orderCode })).catch(() => undefined);
    return this.myOrders(userId);
  }

  async myOrders(userId: string) {
    const rows = await this.prisma.diningOrder.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
    return rows.map((o) => ({
      id: o.id, restaurantId: o.restaurantId, restaurantName: o.restaurantName, area: o.area, mode: o.mode,
      items: (() => { try { return JSON.parse(o.itemsJson) as unknown[]; } catch { return []; } })(),
      subtotalInr: o.subtotalInr, packingInr: o.packingInr, taxInr: o.taxInr, totalInr: o.totalInr,
      code: o.code, status: o.status, placedOn: o.createdAt.toISOString().slice(0, 10),
    }));
  }

  /** Reserve a table — a free confirmed booking (pay-at-restaurant). */
  async reserve(userId: string, restaurantId: string, dto: ReserveTableDto) {
    const r = await this.prisma.restaurant.findUnique({ where: { id: restaurantId } }) as RestaurantRow | null;
    if (!r) throw new NotFoundException('restaurant not found');
    const resCode = code();
    await this.prisma.reservation.create({
      data: {
        userId, restaurantId, restaurantName: r.name, area: r.area,
        date: dto.date, time: dto.time, partySize: dto.partySize, guestName: dto.name,
        notes: dto.notes ?? '', code: resCode, status: 'confirmed',
      },
    });
    await this.mail.deliverSystem(userId, tableReceipt({ restaurantName: r.name, area: r.area, date: dto.date, time: dto.time, partySize: dto.partySize, guestName: dto.name, code: resCode })).catch(() => undefined);
    return this.myReservations(userId);
  }

  async myReservations(userId: string) {
    const rows = await this.prisma.reservation.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
    return rows.map((v) => ({
      id: v.id, restaurantId: v.restaurantId, restaurantName: v.restaurantName, area: v.area,
      date: v.date, time: v.time, partySize: v.partySize, guestName: v.guestName, notes: v.notes,
      code: v.code, status: v.status,
    }));
  }

  private async ensureSeeds(): Promise<void> {
    try {
      if ((await this.prisma.restaurant.count()) > 0) return;
    } catch { return; }
    for (const s of RESTAURANT_SEEDS) {
      const hue = CUISINE_META[s.cuisine]?.hue ?? 0;
      await this.prisma.restaurant.create({
        data: {
          id: s.id, name: s.name, cuisine: s.cuisine, area: s.area, city: s.city,
          rating: s.rating, priceForTwoInr: s.priceForTwoInr, tagline: s.tagline, openHours: s.openHours,
          vegFriendly: s.vegFriendly, heroUrl: hero(s.name, hue), menuJson: JSON.stringify(s.menu),
        },
      }).catch(() => undefined);
    }
  }
}
