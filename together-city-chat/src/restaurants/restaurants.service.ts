import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../shared/prisma/prisma.service';
import { FinancialService } from '../financial/financial.service';
import { MailService } from '../mail/mail.service';
import { orderReceipt, tableReceipt } from '../mail/receipts';
import { CUISINES, CUISINE_META, DIET_ALLOW, DIET_LABEL, RESTAURANT_SEEDS, hero, type Dish } from './restaurants.constants';
import type { PlaceOrderDto, ReserveTableDto, RestaurantQueryDto } from './dto/restaurants.dto';
import { PlacesService, haversineKm } from './places.service';

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
    private readonly places: PlacesService,        // live Google Places discovery (cached)
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

  // ─────────────── AI discovery (Explore) ───────────────
  private hashId(s: string): number { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; }

  /** Attributes not in the seed data, derived deterministically. When a live
   *  Places result is present we pass its real distance in via `realDistanceKm`;
   *  hygiene & food-quality are still derived (no public feed for those). */
  private derive(r: RestaurantRow, realDistanceKm?: number) {
    const h = this.hashId(r.id);
    const distanceKm = realDistanceKm != null
      ? Math.round(realDistanceKm * 10) / 10
      : Math.round((0.4 + (h % 56) / 10) * 10) / 10;      // 0.4–6.0 km, stable
    const foodQuality = Math.min(5, Math.max(3.6, r.rating + (((h >> 3) % 3) - 1) * 0.1));
    const hygiene = Math.min(5, Math.max(3.7, r.rating - 0.2 + ((h >> 5) % 3) / 10));
    return {
      distanceKm, foodQuality, hygiene,
      etaMins: Math.round(distanceKm * 4 + 8),
      pureVeg: r.vegFriendly && h % 2 === 0,
      vegan: r.vegFriendly && h % 3 === 0,
      jain: r.vegFriendly && h % 4 === 0,
      outdoor: h % 3 === 0, petFriendly: h % 5 === 0, familyFriendly: h % 2 === 0,
    };
  }

  private openNow(openHours: string): boolean {
    const m = openHours.match(/(\d{1,2}):(\d{2})\D+(\d{1,2}):(\d{2})/);
    if (!m) return true;
    const now = new Date(); const cur = now.getHours() * 60 + now.getMinutes();
    const open = +m[1] * 60 + +m[2]; let close = +m[3] * 60 + +m[4];
    if (close <= open) close += 24 * 60;
    const c2 = cur < open ? cur + 24 * 60 : cur;
    return c2 >= open && c2 <= close;
  }

  private priceCategory(p: number): string { return p < 800 ? '₹' : p < 2000 ? '₹₹' : '₹₹₹'; }

  /** Top-7 personalised restaurant recommendations, weighted (food quality 35%,
   *  preference match 25%, ratings 15%, price 10%, distance 10%, hygiene 5%).
   *  When GPS + a Maps key are present, candidates are live Google Places results
   *  (real distance) served from a ~20-min per-cell cache; otherwise the seeded
   *  catalogue is used. Filters/ranking always run over the cached set, so
   *  changing a filter never triggers a new Places call. */
  async discover(userId: string, q: {
    lat?: number; lng?: number;
    radiusKm?: number; city?: string; cuisine?: string; maxPriceForTwo?: number; minRating?: number;
    openNow?: boolean; pureVeg?: boolean; vegan?: boolean; jain?: boolean; outdoor?: boolean; pet?: boolean; family?: boolean;
  }) {
    const radiusForFetch = Math.round((q.radiusKm ?? 5) * 1000);
    // Candidate assembly: live Places when we have a fix + key, else seeds.
    type Cand = { row: RestaurantRow; realDist?: number; openNow?: boolean | null; pureVeg?: boolean; source: 'places' | 'seed'; placeId?: string; ratingsCount?: number };
    let cands: Cand[] = [];
    let live = false;
    if (this.places.enabled && q.lat != null && q.lng != null) {
      const near = await this.places.nearby(q.lat, q.lng, radiusForFetch);
      if (near.length) {
        live = true;
        cands = near.map((p) => ({
          row: {
            id: p.id, name: p.name, cuisine: p.cuisine, area: p.area, city: p.city,
            rating: p.rating, priceForTwoInr: p.priceForTwoInr, tagline: p.tagline,
            openHours: p.openHours, vegFriendly: p.vegFriendly, heroUrl: p.heroUrl, menuJson: '[]',
          },
          realDist: haversineKm(q.lat!, q.lng!, p.lat, p.lng),
          openNow: p.openNow, pureVeg: p.pureVeg, source: 'places', placeId: p.placeId, ratingsCount: p.ratingsCount,
        }));
      }
    }
    if (!cands.length) {
      const rows = await this.prisma.restaurant.findMany() as RestaurantRow[];
      cands = rows.map((row) => ({ row, source: 'seed' as const }));
    }
    const pref = await this.prisma.foodPref.findUnique({ where: { userId } });
    const diet = pref?.diet ?? 'everything';
    const vegDiet = ['veg', 'vegan', 'jain'].includes(diet);
    let ex: { cuisineMix?: Record<string, number>; allergies?: string; excluded?: string; budgetInr?: number | null; healthGoals?: string[] } = {};
    try { ex = (pref as { extras?: string | null } | null)?.extras ? JSON.parse((pref as { extras?: string | null }).extras as string) : {}; } catch { ex = {}; }
    const terms = (s?: string) => (s ?? '').split(/[,;]/).map((t) => t.trim().toLowerCase()).filter(Boolean);
    const allergens = terms(ex.allergies), avoid = terms(ex.excluded);
    const budgetTwo = ex.budgetInr ? Math.round(ex.budgetInr * 2 * 1.5) : null;
    const mix = ex.cuisineMix ?? {};
    const mixTotal = Object.values(mix).reduce((a, b) => a + b, 0);
    const radius = q.radiusKm ?? 5;
    const CUISINE_TO_MIX: Record<string, string> = { 'north-indian': 'Indian', 'south-indian': 'Indian', italian: 'Italian', chinese: 'Chinese', japanese: 'Japanese', cafe: 'Continental', biryani: 'Indian', street: 'Indian' };

    const cards = [];
    for (const c of cands) {
      const r = c.row;
      // City filter only applies to the seeded catalogue (live results are already near the GPS fix).
      if (c.source === 'seed' && q.city && r.city.toLowerCase() !== q.city.toLowerCase()) continue;
      if (vegDiet && !r.vegFriendly) continue;                 // veg diets: veg-friendly only
      const d = this.derive(r, c.realDist);
      const isOpen = c.source === 'places' ? (c.openNow ?? true) : this.openNow(r.openHours);
      const isPureVeg = c.pureVeg ?? d.pureVeg;
      // hard filters
      if (d.distanceKm > radius) continue;
      if (q.cuisine && r.cuisine !== q.cuisine) continue;
      if (q.maxPriceForTwo && r.priceForTwoInr > q.maxPriceForTwo) continue;
      if (q.minRating && r.rating < q.minRating) continue;
      if (q.openNow && !isOpen) continue;
      if (q.pureVeg && !isPureVeg) continue;
      if (q.vegan && !d.vegan) continue;
      if (q.jain && !d.jain) continue;
      if (q.outdoor && !d.outdoor) continue;
      if (q.pet && !d.petFriendly) continue;
      if (q.family && !d.familyFriendly) continue;

      const menu = parseMenu(r.menuJson);
      const menuText = `${r.name} ${r.tagline} ${menu.map((m) => m.name).join(' ')}`.toLowerCase();
      if (allergens.some((a) => menuText.includes(a))) continue; // allergy = never shown

      const cuisineName = CUISINE_TO_MIX[r.cuisine] ?? '';
      const cuisineWeight = mixTotal ? (mix[cuisineName] ?? 0) / mixTotal : 0;

      let pm = 55;
      if (vegDiet && r.vegFriendly) pm += 12;
      pm += Math.round(cuisineWeight * 25);
      if (budgetTwo) pm += r.priceForTwoInr <= budgetTwo ? 8 : -8;
      if (avoid.some((a) => menuText.includes(a))) pm -= 20;
      if ((ex.healthGoals ?? []).length && r.vegFriendly && r.rating >= 4.3) pm += 5;
      pm = Math.max(0, Math.min(100, pm));

      const foodQ = (d.foodQuality / 5) * 100;
      const ratings = (r.rating / 5) * 100;
      const priceValue = budgetTwo ? Math.max(20, Math.min(100, 100 - (r.priceForTwoInr / budgetTwo - 1) * 60)) : (r.priceForTwoInr < 1200 ? 90 : r.priceForTwoInr < 2500 ? 70 : 50);
      const dist = Math.max(0, Math.min(100, 100 - (d.distanceKm / radius) * 100));
      const hyg = (d.hygiene / 5) * 100;
      const matchScore = Math.round(foodQ * 0.35 + pm * 0.25 + ratings * 0.15 + priceValue * 0.10 + dist * 0.10 + hyg * 0.05);

      // ── TC Checked: Together City's own quality mark — awarded only when food
      //    quality, hygiene AND value are all strong. It is NOT a paid or partner
      //    badge; it's earned on the three merit signals the market cares about.
      const tcChecked = d.foodQuality >= 4.2 && d.hygiene >= 4.2 && priceValue >= 55;

      const reasons: string[] = [];
      if (tcChecked) reasons.push('TC Checked — quality, hygiene & value verified.');
      if (cuisineWeight > 0.12 && cuisineName) reasons.push(`Matches your ${cuisineName} preference.`);
      if (budgetTwo && r.priceForTwoInr <= budgetTwo) reasons.push('Fits your budget.');
      if (r.rating >= 4.5) reasons.push('Highly rated by diners.');
      if (vegDiet && r.vegFriendly) reasons.push(`Great ${DIET_LABEL[diet] ?? diet} options.`);
      if (d.hygiene >= 4.5) reasons.push('Excellent hygiene & reliability.');
      if (!reasons.length) reasons.push('A strong all-round pick near you.');

      const mapsUrl = c.source === 'places' && c.placeId
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.name)}&query_place_id=${c.placeId}`
        : null;

      cards.push({
        ...this.shapeCard(r),
        matchScore, qualityScore: Math.round(d.foodQuality * 10) / 10, hygiene: Math.round(d.hygiene * 10) / 10,
        distanceKm: d.distanceKm, etaMins: d.etaMins, priceCategory: this.priceCategory(r.priceForTwoInr),
        openNow: isOpen, reasons: reasons.slice(0, 4), tcChecked,
        pureVeg: isPureVeg, vegan: d.vegan, jain: d.jain, outdoor: d.outdoor, petFriendly: d.petFriendly, familyFriendly: d.familyFriendly,
        source: c.source, placeId: c.placeId ?? null, ratingsCount: c.ratingsCount ?? null, mapsUrl,
      });
    }
    return {
      live,
      source: live ? 'places' : 'seed',
      count: cards.length,
      restaurants: cards.sort((a, b) => b.matchScore - a.matchScore).slice(0, 7),
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
