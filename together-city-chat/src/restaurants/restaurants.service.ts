import { medicalFoodAllergenTerms } from '../shared/medical-allergies';
import { swallowed } from '../shared/swallow';
import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { demoDataEnabled } from '../shared/demo-data';
import { randomBytes } from 'crypto';
import { PrismaService } from '../shared/prisma/prisma.service';
import { ClockService } from '../shared/clock/clock.service';
import { ORDER_HISTORY_CAP } from '../shared/paging';
import { FinancialService } from '../financial/financial.service';
import { AiService } from '../ai/ai.service';
import { MailService } from '../mail/mail.service';
import { orderReceipt, tableReceipt } from '../mail/receipts';
import { CUISINES, CUISINE_META, DIET_ALLOW, DIET_LABEL, RESTAURANT_SEEDS, hero, type Dish } from './restaurants.constants';
import { recipeServings } from '../nutrition/nutrition.service';
import { findAllergen } from '../shared/allergens';
import { MasterProfileService } from '../profile/master-profile.service';

const SLOT_LABEL: Record<string, string> = { b: 'Breakfast', l: 'Lunch', s: 'Snack', d: 'Dinner' };
import type { PlaceOrderDto, ReserveTableDto, RestaurantQueryDto, DiscoverDto } from './dto/restaurants.dto';
import { PlacesService, haversineKm } from './places.service';

type RestaurantRow = {
  id: string; name: string; cuisine: string; area: string; city: string;
  rating: number; priceForTwoInr: number; tagline: string; openHours: string;
  vegFriendly: boolean; heroUrl: string; menuJson: string;
};

/** A ranking candidate — a live Places result (with real distance) or a seed row. */
type RCand = { row: RestaurantRow; realDist?: number; openNow?: boolean | null; pureVeg?: boolean; source: 'places' | 'seed'; placeId?: string; ratingsCount?: number };

const parseMenu = (json: string): Dish[] => { try { return JSON.parse(json) as Dish[]; } catch { return []; } };
const code = () => 'TC-' + randomBytes(3).toString('hex').toUpperCase();

@Injectable()
export class RestaurantsService implements OnModuleInit {
  private readonly logger = new Logger('RestaurantsService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly financial: FinancialService, // food orders flow through the one city wallet
    private readonly mail: MailService,            // confirmations land in the city inbox + primary email
    private readonly places: PlacesService,        // live Google Places discovery (cached)
    private readonly ai: AiService,                // AI editorial overviews (with deterministic fallback)
    private readonly clock: ClockService,
    // Allergens are declared in Nutrition and read here. See the union below.
    private readonly masterProfile: MasterProfileService,
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
      // unbounded: the seeded catalogue — city-curated; ranking scans all of it
      const rows = await this.prisma.restaurant.findMany() as RestaurantRow[];
      cands = rows.map((row) => ({ row, source: 'seed' as const }));
    }
    const pref = await this.prisma.foodPref.findUnique({ where: { userId } });
    const diet = pref?.diet ?? 'everything';
    const vegDiet = ['veg', 'vegan', 'jain'].includes(diet);
    let ex: { cuisineMix?: Record<string, number>; allergies?: string; excluded?: string; budgetInr?: number | null; healthGoals?: string[] } = {};
    try { ex = (pref as { extras?: string | null } | null)?.extras ? JSON.parse((pref as { extras?: string | null }).extras as string) : {}; } catch { ex = {}; }
    const terms = (s?: string) => (s ?? '').split(/[,;]/).map((t) => t.trim().toLowerCase()).filter(Boolean);
    // FoodPref AND the master, unioned — not the master alone.
    //
    // Reading only the master would be the tidier §3 answer and would silently
    // remove protection from every citizen who declared an allergen before the
    // column existed, until the next time they happened to re-save their food
    // preferences. get() back-fills them, but a read that fails or a row that
    // has not been touched yet must not be the difference between a filtered
    // menu and an unfiltered one.
    const master = await this.masterProfile.get(userId).catch(swallowed('restaurants.discover', null));
    const allergens = [...new Set([
      ...terms(ex.allergies),
      ...terms((master as { foodAllergens?: string | null } | null)?.foodAllergens ?? ''),
      // P1-5: Medical's allergy records, food families only — the same fact
      // about the same person, read at match time, never written back.
      ...await medicalFoodAllergenTerms(this.prisma, userId),
    ])];
    const avoid = terms(ex.excluded);
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
      // allergy = never shown.
      //
      // This was `menuText.includes(declaredTerm)` against that concatenated
      // blob, which is the substring test allergens.ts was written to replace —
      // "nuts" does not appear in "Kaju Curry" or "Badam Halwa", and this is a
      // menu, so the miss puts a dish in front of somebody rather than a serum.
      // Dish names go in as separate candidates because that is what they are,
      // and because it lets the matcher say which one.
      if (findAllergen(r.name, menu.map((m) => m.name), allergens)) continue;

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

  // ─────────────── Curated food discovery (Top 25 + collections + search) ───────────────

  /** Candidate assembly shared by the curated surfaces: live Google Places (real
   *  distance) when a key + GPS are present, otherwise the seeded catalogue. */
  private async assembleCandidates(q: { lat?: number; lng?: number; radiusKm?: number }): Promise<{ cands: RCand[]; live: boolean }> {
    let cands: RCand[] = [];
    let live = false;
    if (this.places.enabled && q.lat != null && q.lng != null) {
      const near = await this.places.nearby(q.lat, q.lng, Math.round((q.radiusKm ?? 5) * 1000));
      if (near.length) {
        live = true;
        cands = near.map((p) => ({
          row: { id: p.id, name: p.name, cuisine: p.cuisine, area: p.area, city: p.city, rating: p.rating, priceForTwoInr: p.priceForTwoInr, tagline: p.tagline, openHours: p.openHours, vegFriendly: p.vegFriendly, heroUrl: p.heroUrl, menuJson: '[]' },
          realDist: haversineKm(q.lat!, q.lng!, p.lat, p.lng), openNow: p.openNow, pureVeg: p.pureVeg, source: 'places', placeId: p.placeId, ratingsCount: p.ratingsCount,
        }));
      }
    }
    if (!cands.length) {
      // unbounded: the seeded catalogue — city-curated; ranking scans all of it
      const rows = await this.prisma.restaurant.findMany() as RestaurantRow[];
      cands = rows.map((row) => ({ row, source: 'seed' as const }));
    }
    return { cands, live };
  }

  /** Food & beverage category shown on cards (spec: Restaurant / Café / Bakery / Dessert). */
  private category(r: RestaurantRow): string {
    const t = `${r.cuisine} ${r.name} ${r.tagline}`.toLowerCase();
    if (/bakery|patisserie|boulanger/.test(t)) return 'Bakery';
    if (/dessert|ice cream|gelato|sweet|chocolat/.test(t)) return 'Dessert';
    if (r.cuisine === 'cafe' || /caf[eé]|coffee|brew|tea room/.test(t)) return 'Café';
    if (r.cuisine === 'street' || /street|chaat|tikki/.test(t)) return 'Street Food';
    return 'Restaurant';
  }

  private valueScore(price: number): number {
    return price < 600 ? 95 : price < 1000 ? 88 : price < 1500 ? 78 : price < 2500 ? 66 : 52;
  }
  private menuCompleteness(menu: Dish[]): number {
    if (!menu.length) return 40; // no online menu → lower weight (spec: online-menu priority)
    const breadth = Math.min(60, menu.length * 6);
    const bestsellers = menu.some((d) => d.bestseller) ? 20 : 0;
    const sections = new Set(menu.map((d) => d.section)).size >= 3 ? 20 : 10;
    return Math.min(100, breadth + bestsellers + sections);
  }
  /** The Together City Score — a blended, quality-first ranking (food quality,
   *  rating, hygiene, value, online-menu completeness, veg options). */
  private tcScore(r: RestaurantRow, d: { foodQuality: number; hygiene: number }, menu: Dish[]): number {
    const foodQ = (d.foodQuality / 5) * 100;
    const rating = (r.rating / 5) * 100;
    const hygiene = (d.hygiene / 5) * 100;
    const value = this.valueScore(r.priceForTwoInr);
    const menuC = this.menuCompleteness(menu);
    const veg = r.vegFriendly ? 100 : 60;
    return Math.round(foodQ * 0.32 + rating * 0.26 + hygiene * 0.14 + value * 0.10 + menuC * 0.13 + veg * 0.05);
  }

  private reasonsFor(r: RestaurantRow, d: ReturnType<RestaurantsService['derive']>, menu: Dish[], area: string | null, tcChecked: boolean): string[] {
    const meta = CUISINE_META[r.cuisine];
    const reasons: string[] = [];
    reasons.push(area ? `One of the Top 25 in ${area}.` : 'One of the top food spots near you.');
    if (tcChecked) reasons.push('TC Checked — quality, hygiene & value verified.');
    if (r.rating >= 4.5) reasons.push(`Exceptional ${meta?.label ?? r.cuisine} — loved by diners.`);
    else if (r.rating >= 4.2) reasons.push(`Strong ${meta?.label ?? r.cuisine} reputation.`);
    if (d.hygiene >= 4.5) reasons.push('Excellent hygiene score.');
    if (d.familyFriendly) reasons.push('Loved by families.');
    if (menu.length) reasons.push('Full menu available online.');
    if (this.valueScore(r.priceForTwoInr) >= 85) reasons.push('Strong value for money.');
    return reasons.slice(0, 5);
  }

  /** Shape a candidate into a curated card with the TC score, category and signals. */
  private curatedCard(c: RCand) {
    const r = c.row;
    const d = this.derive(r, c.realDist);
    const menu = parseMenu(r.menuJson);
    const isOpen = c.source === 'places' ? (c.openNow ?? true) : this.openNow(r.openHours);
    const tcChecked = d.foodQuality >= 4.2 && d.hygiene >= 4.2 && this.valueScore(r.priceForTwoInr) >= 55;
    return {
      card: {
        ...this.shapeCard(r),
        category: this.category(r),
        tcScore: this.tcScore(r, d, menu),
        qualityScore: Math.round(d.foodQuality * 10) / 10,
        hygiene: Math.round(d.hygiene * 10) / 10,
        valueScore: this.valueScore(r.priceForTwoInr),
        distanceKm: d.distanceKm, etaMins: d.etaMins,
        priceCategory: this.priceCategory(r.priceForTwoInr),
        openNow: isOpen, menuAvailable: menu.length > 0, ordersOnline: true, reservations: true,
        pureVeg: c.pureVeg ?? d.pureVeg, vegan: d.vegan, jain: d.jain,
        outdoor: d.outdoor, petFriendly: d.petFriendly, familyFriendly: d.familyFriendly,
        tcChecked, ratingsCount: c.ratingsCount ?? null, placeId: c.placeId ?? null, source: c.source,
        reasons: this.reasonsFor(r, d, menu, null, tcChecked),
      },
      r, d, menu, isOpen,
    };
  }

  private passesFilters(x: { r: RestaurantRow; d: ReturnType<RestaurantsService['derive']>; isOpen: boolean; card: { pureVeg: boolean } }, q: DiscoverDto & { maxPriceForTwo?: number }): boolean {
    const { r, d, isOpen } = x;
    if (q.cuisine && r.cuisine !== q.cuisine) return false;
    if (q.maxPriceForTwo && r.priceForTwoInr > q.maxPriceForTwo) return false;
    if (q.minRating && r.rating < q.minRating) return false;
    if (q.openNow && !isOpen) return false;
    if (q.pureVeg && !x.card.pureVeg) return false;
    if (q.vegan && !d.vegan) return false;
    if (q.jain && !d.jain) return false;
    if (q.outdoor && !d.outdoor) return false;
    if (q.pet && !d.petFriendly) return false;
    if (q.family && !d.familyFriendly) return false;
    return true;
  }

  /** Top 25 food & café destinations for a locality, ranked by the TC Score. */
  async topByLocality(userId: string, q: DiscoverDto & { area?: string; limit?: number }) {
    const { cands, live } = await this.assembleCandidates(q);
    const diet = await this.userDiet(userId);
    const vegDiet = diet ? ['veg', 'vegan', 'jain'].includes(diet) : false;
    const radius = q.radiusKm ?? 5;
    const built = cands
      .filter((c) => !(vegDiet && !c.row.vegFriendly))
      .filter((c) => !(c.source === 'seed' && q.city && c.row.city.toLowerCase() !== q.city.toLowerCase()))
      .filter((c) => !(q.area && c.source === 'seed' && c.row.area.toLowerCase() !== q.area!.toLowerCase()))
      .map((c) => this.curatedCard(c))
      .filter((x) => x.d.distanceKm <= radius)
      .filter((x) => this.passesFilters(x, q));
    built.sort((a, b) => b.card.tcScore - a.card.tcScore);
    const top = built.slice(0, q.limit ?? 25).map((x, i) => ({ ...x.card, rank: i + 1, reasons: this.reasonsFor(x.r, x.d, x.menu, q.area ?? x.r.area, x.card.tcChecked) }));
    return { live, source: live ? 'places' : 'seed', locality: q.area ?? null, count: top.length, restaurants: top };
  }

  /** Curated discovery collections (Top 25, Cafés, Best Coffee, Under ₹500, Date Night, …). */
  async collections(userId: string, q: DiscoverDto) {
    const { cands, live } = await this.assembleCandidates(q);
    const diet = await this.userDiet(userId);
    const vegDiet = diet ? ['veg', 'vegan', 'jain'].includes(diet) : false;
    const radius = q.radiusKm ?? 8;
    const all = cands
      .filter((c) => !(vegDiet && !c.row.vegFriendly))
      .map((c) => this.curatedCard(c))
      .filter((x) => x.d.distanceKm <= radius);
    all.sort((a, b) => b.card.tcScore - a.card.tcScore);

    // Trending: real signal from the last 30 days of orders + reservations.
    const since = new Date(Date.now() - 30 * 864e5);
    const [ord, res] = await Promise.all([
      this.prisma.diningOrder.groupBy({ by: ['restaurantId'], where: { createdAt: { gt: since } }, _count: { restaurantId: true } }).catch(swallowed('restaurants.collections', [] as { restaurantId: string; _count: { restaurantId: number } }[])),
      this.prisma.reservation.groupBy({ by: ['restaurantId'], where: { createdAt: { gt: since } }, _count: { restaurantId: true } }).catch(swallowed('restaurants.collections', [] as { restaurantId: string; _count: { restaurantId: number } }[])),
    ]);
    const trend = new Map<string, number>();
    for (const o of ord) trend.set(o.restaurantId, (trend.get(o.restaurantId) ?? 0) + o._count.restaurantId);
    for (const v of res) trend.set(v.restaurantId, (trend.get(v.restaurantId) ?? 0) + v._count.restaurantId);

    const pick = (pred: (x: typeof all[number]) => boolean, n = 10) => all.filter(pred).slice(0, n).map((x) => x.card);
    const isCafe = (x: typeof all[number]) => x.card.category === 'Café';
    const isDessert = (x: typeof all[number]) => x.card.category === 'Dessert' || x.card.category === 'Bakery';

    const defs = [
      { key: 'top25', title: 'Top 25 Near You', subtitle: 'The best food destinations around you', items: all.slice(0, 25).map((x) => x.card) },
      { key: 'cafes', title: 'Top 25 Cafés', subtitle: 'Coffee, brunch & all-day cafés', items: all.filter(isCafe).slice(0, 25).map((x) => x.card) },
      { key: 'trending', title: 'Trending This Week', subtitle: 'Most ordered & reserved lately', items: all.filter((x) => trend.has(x.r.id)).sort((a, b) => (trend.get(b.r.id)! - trend.get(a.r.id)!)).slice(0, 10).map((x) => x.card) },
      { key: 'coffee', title: 'Best Coffee', subtitle: '', items: pick((x) => isCafe(x) && x.r.rating >= 4.2) },
      { key: 'desserts', title: 'Best Desserts & Bakeries', subtitle: '', items: pick(isDessert) },
      { key: 'northindian', title: 'Best North Indian', subtitle: '', items: pick((x) => x.r.cuisine === 'north-indian') },
      { key: 'southindian', title: 'Best South Indian', subtitle: '', items: pick((x) => x.r.cuisine === 'south-indian') },
      { key: 'chinese', title: 'Best Chinese', subtitle: '', items: pick((x) => x.r.cuisine === 'chinese') },
      { key: 'street', title: 'Best Street Food', subtitle: '', items: pick((x) => x.card.category === 'Street Food') },
      { key: 'under500', title: 'Best Under ₹500', subtitle: "Great food that won't break the bank", items: pick((x) => x.r.priceForTwoInr <= 500) },
      { key: 'finedining', title: 'Best Fine Dining', subtitle: 'Premium dining experiences', items: pick((x) => x.r.priceForTwoInr >= 2000) },
      { key: 'datenight', title: 'Best for Date Night', subtitle: '', items: pick((x) => x.d.outdoor && x.r.rating >= 4.3) },
      { key: 'family', title: 'Best Family Restaurants', subtitle: '', items: pick((x) => x.d.familyFriendly) },
      { key: 'veg', title: 'Best Vegetarian', subtitle: '', items: pick((x) => x.r.vegFriendly && x.r.rating >= 4.2) },
      { key: 'latenight', title: 'Late Night Eats', subtitle: 'Open late', items: pick((x) => /(2[2-3]|0[0-3]):\d\d\s*$/.test(x.r.openHours) || /late|24|midnight/i.test(x.r.openHours)) },
      { key: 'hiddengems', title: 'Hidden Gems', subtitle: 'Lesser-known spots worth the trip', items: pick((x) => x.r.rating >= 4.4 && x.r.priceForTwoInr < 1200) },
    ];
    return { live, source: live ? 'places' : 'seed', collections: defs.filter((d) => d.items.length) };
  }

  /** Search the FULL catalogue (browse shows only curated Top 25; search reaches everything). */
  async search(userId: string, term: string) {
    const q = (term ?? '').trim().toLowerCase();
    if (q.length < 2) return { query: term ?? '', results: [] as unknown[] };
    // unbounded: the seeded catalogue — city-curated; ranking scans all of it
    const rows = await this.prisma.restaurant.findMany() as RestaurantRow[];
    const hits = rows.filter((r) =>
      r.name.toLowerCase().includes(q) || r.cuisine.toLowerCase().includes(q) ||
      r.area.toLowerCase().includes(q) || r.city.toLowerCase().includes(q) ||
      (CUISINE_META[r.cuisine]?.label ?? '').toLowerCase().includes(q));
    const results = hits
      .map((row) => this.curatedCard({ row, source: 'seed' }).card)
      .sort((a, b) => b.tcScore - a.tcScore)
      .slice(0, 40);
    return { query: term ?? '', results };
  }

  /** AI editorial "what to expect" overview — from real signals + menu, never fabricated reviews. */
  async overview(userId: string, id: string) {
    const r = await this.prisma.restaurant.findUnique({ where: { id } }) as RestaurantRow | null;
    if (!r) throw new NotFoundException('restaurant not found');
    const menu = parseMenu(r.menuJson);
    const d = this.derive(r);
    const bestsellers = menu.filter((x) => x.bestseller).map((x) => x.name);
    const meta = CUISINE_META[r.cuisine];
    const fallback = {
      highlights: [
        `${meta?.label ?? r.cuisine} done well`,
        r.rating >= 4.4 ? 'Consistently high ratings' : 'Reliable quality',
        d.hygiene >= 4.4 ? 'Strong hygiene standards' : 'Clean & well-run',
        this.valueScore(r.priceForTwoInr) >= 85 ? 'Great value for money' : 'Fair pricing',
      ],
      tryThese: (bestsellers.length ? bestsellers : menu.map((x) => x.name)).slice(0, 5),
      bestFor: r.priceForTwoInr >= 2000 ? 'Special occasions & date nights' : d.familyFriendly ? 'Family meals & casual dining' : 'Everyday dining & quick bites',
      note: `A Together City editorial overview based on ${r.name}'s quality signals and menu — not diner reviews.`,
    };
    if (!this.ai.enabled) return { aiPowered: false, ...fallback };
    const sys = 'You write concise, factual overviews for a curated food-discovery guide. Use ONLY the provided facts (cuisine, price, rating, hygiene, menu). NEVER invent diner quotes, review counts, or star breakdowns. Return strict JSON.';
    const user = `Venue: ${r.name}\nCategory/Cuisine: ${this.category(r)} · ${meta?.label ?? r.cuisine}\nArea: ${r.area}, ${r.city}\nRating: ${r.rating}/5\nPrice for two: ₹${r.priceForTwoInr}\nTagline: ${r.tagline}\nMenu: ${menu.slice(0, 12).map((x) => x.name).join(', ') || '(no online menu)'}\nBestsellers: ${bestsellers.join(', ') || '—'}\n\nReturn JSON: {"highlights":[3-4 short phrases],"tryThese":[3-5 dish names from the menu above],"bestFor":"one short occasion phrase","note":"one factual sentence"}`;
    const out = await this.ai.json(sys, user, fallback);
    return { aiPowered: true, highlights: out.highlights ?? fallback.highlights, tryThese: out.tryThese ?? fallback.tryThese, bestFor: out.bestFor ?? fallback.bestFor, note: out.note ?? fallback.note };
  }

  // ─────────────── Intelligent eating decision engine (meal-plan dish matching) ───────────────

  private currentSlot(): string {
    const h = new Date().getHours();
    return h < 11 ? 'b' : h < 16 ? 'l' : h < 19 ? 's' : 'd';
  }

  /** Estimate a dish's macros from its name/section/diet — labelled `estimated`,
   *  since menus don't carry nutrition. Deterministic (no per-request AI cost). */
  private estimateDishMacros(d: Dish): { kcal: number; protein: number; carbs: number; fat: number; estimated: true } {
    const n = `${d.name} ${d.desc}`.toLowerCase();
    const sec = d.section.toLowerCase();
    const both = `${sec} ${n}`;
    const nonveg = d.diet === 'nonveg' || d.diet === 'pesc' || /chicken|mutton|lamb|fish|prawn|egg|meat|kebab|keema|tikka/.test(n);
    let protein = nonveg ? 26 : /paneer|dal|chana|rajma|tofu|soya|lentil|sprout|egg|chickpea/.test(n) ? 15 : /rice|biryani|pulao/.test(n) ? 10 : 8;
    if (/thali|combo|bowl|platter|meal/.test(n)) protein += 6;
    let fat = /fried|butter|cream|cheese|makhani|malai|ghee|pizza|burger|mayo/.test(n) ? 24 : nonveg ? 18 : 12;
    if (/dessert|cake|gulab|halwa|ice.?cream|sweet/.test(both)) fat = 16;
    let kcal = /dessert|sweet|cake|halwa|gulab|ice.?cream|chocolat/.test(both) ? 380
      : /rice|biryani|pulao/.test(both) ? 560
      : /bread|naan|roti|paratha|kulcha/.test(both) ? 220
      : /starter|snack|tikki|chaat|roll|momo/.test(both) ? 300
      : /beverage|drink|lassi|juice|coffee|tea|shake|smoothie/.test(both) ? 160
      : /main|curry|thali|bowl|combo|platter/.test(both) ? 480
      : 360;
    kcal = Math.round(kcal * (0.85 + Math.min(0.5, d.priceInr / 800)));
    let carbs = Math.max(6, Math.round((kcal - protein * 4 - fat * 9) / 4));
    kcal = protein * 4 + carbs * 4 + fat * 9; // keep internally consistent
    return { kcal, protein, carbs, fat, estimated: true };
  }

  /**
   * Decision engine — "Follow my meal plan". Reads today's planned meal target
   * (per serving) and ranks individual DISHES from nearby menus by nutritional
   * similarity, so the recommendation is the best MEAL, not just a restaurant.
   */
  async mealMatch(userId: string, q: { lat?: number; lng?: number; slot?: string; limit?: number }) {
    const slot = ['b', 'l', 's', 'd'].includes(q.slot ?? '') ? q.slot! : this.currentSlot();
    const plan = await this.prisma.mealPlan.findFirst({ where: { userId, mode: 'individual' }, orderBy: { createdAt: 'desc' } });
    if (!plan) return { hasPlan: false, slot, slotLabel: SLOT_LABEL[slot], target: null, matches: [] as unknown[] };

    const dayIndex = (new Date().getDay() + 6) % 7;
    const where = (s?: string) => ({ skipped: false, ...(s ? { slot: s } : {}), day: { dayIndex, plan: { id: plan.id } } });
    let meal = await this.prisma.meal.findFirst({ where: where(slot), include: { recipe: true } });
    if (!meal) meal = await this.prisma.meal.findFirst({ where: where(), include: { recipe: true } });
    if (!meal) return { hasPlan: true, slot, slotLabel: SLOT_LABEL[slot], target: null, matches: [] };

    const rc = meal.recipe;
    const srv = Math.max(1, recipeServings({ slot: rc.slot, kcal: rc.kcal, gramsPerServing: rc.gramsPerServing, servings: (rc as unknown as { servings?: number }).servings ?? 0 }));
    const target = {
      slot, slotLabel: SLOT_LABEL[slot],
      kcal: Math.round(rc.kcal / srv), protein: Math.round(rc.protein / srv),
      carbs: Math.round(rc.carbs / srv), fat: Math.round(rc.fat / srv),
      cuisine: rc.country, diet: rc.diet, recipeName: rc.name,
    };

    const diet = await this.userDiet(userId);
    const allow = diet ? DIET_ALLOW[diet] ?? null : null;
    const vegDiet = diet ? ['veg', 'vegan', 'jain'].includes(diet) : false;
    // unbounded: the seeded catalogue — city-curated; ranking scans all of it
    const rows = await this.prisma.restaurant.findMany() as RestaurantRow[]; // catalogue = the menus we can read

    type Match = { matchScore: number } & Record<string, unknown>;
    const matches: Match[] = [];
    for (const r of rows) {
      if (vegDiet && !r.vegFriendly) continue;
      const d = this.derive(r);
      for (const dish of parseMenu(r.menuJson)) {
        if (vegDiet && dish.diet === 'nonveg') continue;
        const m = this.estimateDishMacros(dish);
        const calPct = Math.abs(m.kcal - target.kcal) / Math.max(target.kcal, 1);
        const calScore = Math.max(0, 100 - calPct * 160);
        const proteinScore = Math.min(100, (m.protein / Math.max(target.protein, 1)) * 100);
        const dietFit = !allow ? 70 : allow.includes(dish.diet) ? 100 : 45;
        const value = this.valueScore(dish.priceInr * 2);
        const distScore = Math.max(0, 100 - (d.distanceKm / 8) * 100);
        const matchScore = Math.min(100, Math.round(calScore * 0.42 + proteinScore * 0.30 + dietFit * 0.16 + value * 0.07 + distScore * 0.05));

        const why: string[] = [];
        if (calPct <= 0.05) why.push('Calories within 5% of your target');
        else if (calPct <= 0.12) why.push('Calories close to your target');
        if (m.protein >= target.protein * 0.9) why.push('Hits your protein target');
        if (m.fat <= 14) why.push('Lower in fat');
        if (allow && allow.includes(dish.diet) && diet) why.push(`Matches your ${DIET_LABEL[diet] ?? diet} preference`);
        why.push(`${d.distanceKm} km away`);

        matches.push({
          dishId: dish.id, dishName: dish.name, desc: dish.desc, priceInr: dish.priceInr,
          diet: dish.diet, dietLabel: DIET_LABEL[dish.diet] ?? dish.diet, bestseller: !!dish.bestseller,
          ...m, matchScore, why: why.slice(0, 4),
          restaurantId: r.id, restaurantName: r.name, area: r.area, heroUrl: r.heroUrl,
          icon: CUISINE_META[r.cuisine]?.icon ?? '🍽', cuisineLabel: CUISINE_META[r.cuisine]?.label ?? r.cuisine,
          distanceKm: d.distanceKm, etaMins: d.etaMins,
        });
      }
    }
    matches.sort((a, b) => b.matchScore - a.matchScore);
    return { hasPlan: true, slot, slotLabel: SLOT_LABEL[slot], target, matches: matches.slice(0, q.limit ?? 12) };
  }

  async browse(userId: string, query: RestaurantQueryDto) {
    // unbounded: the seeded catalogue — city-curated; ranking scans all of it
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
    const d = this.derive(r);
    const rawMenu = parseMenu(r.menuJson);
    const bestsellers = rawMenu.filter((x) => x.bestseller);
    const popularDishes = (bestsellers.length ? bestsellers : rawMenu).slice(0, 8).map((x) => ({
      name: x.name, priceInr: x.priceInr, diet: x.diet, dietLabel: DIET_LABEL[x.diet] ?? x.diet, desc: x.desc, bestseller: !!x.bestseller,
    }));
    const amenities = [
      ...(d.outdoor ? ['Outdoor seating'] : []),
      ...(d.familyFriendly ? ['Family friendly'] : []),
      ...(d.petFriendly ? ['Pet friendly'] : []),
      ...(r.vegFriendly ? ['Vegetarian options'] : []),
      ...(d.pureVeg ? ['Pure veg'] : []),
      ...(d.vegan ? ['Vegan options'] : []),
      ...(d.jain ? ['Jain options'] : []),
      'Dine-in', 'Delivery', 'Reservations',
    ];
    return {
      ...this.shapeCard(r),
      category: this.category(r),
      dietProfile: diet ? (DIET_LABEL[diet] ?? diet) : null,
      priceCategory: this.priceCategory(r.priceForTwoInr),
      openNow: this.openNow(r.openHours),
      distanceKm: d.distanceKm, etaMins: d.etaMins,
      menuAvailable: rawMenu.length > 0,
      breakdown: {
        tcScore: this.tcScore(r, d, rawMenu),
        food: Math.round(d.foodQuality * 10) / 10,
        hygiene: Math.round(d.hygiene * 10) / 10,
        value: this.valueScore(r.priceForTwoInr),
        googleRating: r.rating,
      },
      amenities,
      popularDishes,
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

    const orderCode = code();
    // Payment and order in one transaction: a failure between them used to bill
    // the citizen for food no restaurant had been told about.
    await this.financial.paid(
      userId,
      { hub: 'Restaurants', category: 'dining', label: `${r.name} · ${lines.length} item(s)`, amountInr: totalInr, method: dto.method },
      (tx) => tx.diningOrder.create({
        data: {
          userId, restaurantId, restaurantName: r.name, area: r.area, mode: dto.mode,
          itemsJson: JSON.stringify(lines), subtotalInr: subtotal, packingInr, taxInr, totalInr,
          code: orderCode, status: 'confirmed',
        },
      }),
    );
    await this.mail.deliverSystem(userId, orderReceipt({ restaurantName: r.name, area: r.area, mode: dto.mode, items: lines.map((l) => ({ name: l.name, qty: l.qty, lineInr: l.lineInr })), subtotalInr: subtotal, packingInr, taxInr, totalInr, code: orderCode })).catch(swallowed('restaurants.placeOrder', undefined));
    return this.myOrders(userId);
  }

  async myOrders(userId: string) {
    const rows = await this.prisma.diningOrder.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: ORDER_HISTORY_CAP });
    // An order placed just after midnight locally falls on the PREVIOUS day in
    // UTC — the citizen would not recognise the date on their own order.
    const tz = await this.clock.timezoneFor(userId);
    return rows.map((o) => ({
      id: o.id, restaurantId: o.restaurantId, restaurantName: o.restaurantName, area: o.area, mode: o.mode,
      items: (() => { try { return JSON.parse(o.itemsJson) as unknown[]; } catch { return []; } })(),
      subtotalInr: o.subtotalInr, packingInr: o.packingInr, taxInr: o.taxInr, totalInr: o.totalInr,
      code: o.code, status: o.status, placedOn: this.clock.dayIn(tz, o.createdAt),
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
    await this.mail.deliverSystem(userId, tableReceipt({ restaurantName: r.name, area: r.area, date: dto.date, time: dto.time, partySize: dto.partySize, guestName: dto.name, code: resCode })).catch(swallowed('restaurants.reserve', undefined));
    return this.myReservations(userId);
  }

  async myReservations(userId: string) {
    const rows = await this.prisma.reservation.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: ORDER_HISTORY_CAP });
    return rows.map((v) => ({
      id: v.id, restaurantId: v.restaurantId, restaurantName: v.restaurantName, area: v.area,
      date: v.date, time: v.time, partySize: v.partySize, guestName: v.guestName, notes: v.notes,
      code: v.code, status: v.status,
    }));
  }

  private async ensureSeeds(): Promise<void> {
    // RESTAURANT_SEEDS place invented restaurants at real Bengaluru localities,
    // with invented star ratings and priced menus, and `reserve()` hands out a
    // table-booking code for them. A citizen following one turns up at an
    // address where no such restaurant exists.
    if (!demoDataEnabled()) {
      const ids = RESTAURANT_SEEDS.map((s) => s.id);
      const gone = await this.prisma.restaurant.deleteMany({ where: { id: { in: ids } } })
        .catch(swallowed('restaurants.ensureSeeds', null));
      if (gone === null) {
        this.logger.warn(
          `Could not remove seeded restaurants (${ids.join(', ')}) — most likely a real order or reservation references one. Resolve those, then restart.`,
        );
      }
      return;
    }
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
      }).catch(swallowed('restaurants.ensureSeeds', undefined));
    }
  }
}
