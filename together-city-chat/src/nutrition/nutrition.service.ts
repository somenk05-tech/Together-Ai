import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../shared/prisma/prisma.service';
import { ConversationsService } from '../conversations/conversations.service';
import { FinancialService } from '../financial/financial.service';
import { AiService } from '../ai/ai.service';
import {
  CITATIONS, MARKER_RULES, criticalAlerts, evaluateMarker, supplementKit,
  flagsFor, planGuidance, rankByModes, planningModes,
  triggeredConditions, type MarkerStatus,
} from './clinical-engine';
import type { BloodInputDto, Diet, FoodPrefDto, PlanMode, Slot } from './dto/nutrition.dto';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const SLOTS: Slot[] = ['b', 'l', 's', 'd'];

/** Diet compatibility — which recipe diets a preference may be served. */
function dietAllows(pref: Diet, recipe: Diet): boolean {
  const map: Record<Diet, Diet[]> = {
    everything: ['everything', 'veg', 'nonveg', 'pesc', 'egg', 'vegan', 'jain'],
    nonveg: ['everything', 'veg', 'nonveg', 'pesc', 'egg', 'vegan', 'jain'],
    pesc: ['veg', 'pesc', 'egg', 'vegan', 'jain'],
    egg: ['veg', 'egg', 'vegan', 'jain'],
    veg: ['veg', 'vegan', 'jain'],
    vegan: ['vegan'],
    jain: ['jain', 'vegan'],
  };
  return map[pref].includes(recipe);
}

export interface RecipeShape {
  id: string; name: string; country: string; kcal: number; protein: number;
  carbs: number; fat: number; fiber: number; minutes: number; gramsPerServing: number; diet: Diet;
}

/** One guided cooking step: its instruction, how long it runs unattended, and
 *  whether it needs constant attention (stir) vs. can run in the background. */
export interface CookStep { text: string; durationSec: number; active: boolean }

/** Extract a timer (seconds) from a step's wording. Ranges take the upper bound;
 *  temperatures and quantities are ignored. */
function secondsFromText(text: string): number {
  const t = text.toLowerCase();
  const U = '(hours?|hrs?|minutes?|mins?|seconds?|secs?)';
  const toSec = (n: number, u: string) => (/hour|hr/.test(u) ? Math.round(n * 3600) : /sec/.test(u) ? Math.round(n) : Math.round(n * 60));
  let m = t.match(new RegExp(`(\\d+)\\s*(?:–|-|to)\\s*(\\d+)\\s*${U}`));
  if (m) return Math.min(2 * 3600, toSec(parseInt(m[2], 10), m[3]));
  m = t.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*${U}`));
  if (m) return Math.min(2 * 3600, toSec(parseFloat(m[1]), m[2]));
  return 0;
}

/** Whether a step needs you at the stove (true) or can run in the background (false). */
function isActiveStep(text: string, durationSec: number): boolean {
  const t = text.toLowerCase();
  if (/\b(simmer|bake|roast|marinat|chill|refrigerat|soak|proof|prove|boil|steam|slow[- ]?cook|pressure[- ]?cook|cover and cook|set aside|cool|freeze|infuse|rest|leave)\b/.test(t)) return false;
  if (/\b(stir|whisk|saut|fry|flip|toss|fold|beat|knead|scrambl|temper|deglaz|brown|sear|caramel|mix)\b/.test(t)) return true;
  if (durationSec === 0) return true;
  return durationSec < 180; // short timers keep you at the stove; long ones you can leave
}

@Injectable()
export class NutritionService implements OnModuleInit {
  private readonly logger = new Logger(NutritionService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly conversations: ConversationsService,
    private readonly financial: FinancialService,
    private readonly ai: AiService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureRecipes();
    await this.ensureDietitians();
  }

  // ─────────────── targets (Mifflin-St Jeor) ───────────────
  async targets(userId: string): Promise<{ kcal: number; protein: number; carb: number; fat: number; fiber: number; waterMl: number }> {
    const pref = await this.prisma.foodPref.findUnique({ where: { userId } });
    const weight = pref?.weightKg ?? 70;
    const height = pref?.heightCm ?? 172;
    const age = pref?.age ?? 30;
    const sex = pref?.sex ?? 'male';
    const activity = pref?.activity ?? 1.4;
    const goal = pref?.goal ?? 'maintain';

    const bmr = 10 * weight + 6.25 * height - 5 * age + (sex === 'male' ? 5 : -161);
    let kcal = Math.round(bmr * activity);
    if (goal === 'lose') kcal -= 400;
    if (goal === 'gain') kcal += 300;

    const protein = Math.round(1.6 * weight);
    const fat = Math.round((kcal * 0.28) / 9);
    const carb = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
    return { kcal, protein, carb, fat, fiber: 32, waterMl: Math.round(weight * 35) };
  }

  async upsertFoodPref(userId: string, dto: FoodPrefDto) {
    // `extras` exists on Railway's freshly-generated client; cast for the local
    // (offline) client which can't be regenerated here.
    const data = dto as Record<string, unknown>;
    return this.prisma.foodPref.upsert({
      where: { userId },
      update: data,
      create: { userId, ...data },
    } as Parameters<typeof this.prisma.foodPref.upsert>[0]);
  }

  /** Current preferences (defaults if never saved) — powers the Preferences form. */
  async foodPref(userId: string) {
    const pref = await this.prisma.foodPref.findUnique({ where: { userId } });
    return {
      diet: pref?.diet ?? 'everything',
      goal: pref?.goal ?? 'maintain',
      heightCm: pref?.heightCm ?? null,
      weightKg: pref?.weightKg ?? null,
      age: pref?.age ?? null,
      sex: pref?.sex ?? null,
      activity: pref?.activity ?? 1.4,
      extras: (pref as { extras?: string | null } | null)?.extras ?? null,
    };
  }

  // ─────────────── weekly plan ───────────────
  async weeklyPlan(userId: string, mode: PlanMode = 'individual') {
    const existing = await this.prisma.mealPlan.findFirst({
      where: { userId, mode },
      orderBy: { createdAt: 'desc' },
    });
    const plan = existing ? await this.shapePlan(existing.key) : await this.generatePlan(userId, mode);
    return { ...plan, guidance: await this.userPlanGuidance(userId) };
  }

  async regenerate(userId: string, mode: PlanMode = 'individual') {
    const plan = await this.generatePlan(userId, mode);
    return { ...plan, guidance: await this.userPlanGuidance(userId) };
  }

  /** Load the user's stored marker values, as a {key: value} map. */
  private async bloodValues(userId: string): Promise<Record<string, number>> {
    const rows = await this.prisma.bloodMarker.findMany({ where: { userId } });
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }

  /** Condition-aware planning rationale for the current markers + goal (or null). */
  private async userPlanGuidance(userId: string) {
    const pref = await this.prisma.foodPref.findUnique({ where: { userId } });
    const flags = flagsFor(await this.bloodValues(userId));
    return planGuidance(flags, pref?.goal ?? 'maintain');
  }

  private async generatePlan(userId: string, mode: PlanMode) {
    const pref = await this.prisma.foodPref.findUnique({ where: { userId } });
    const diet = (pref?.diet ?? 'everything') as Diet;
    const recipes = await this.prisma.recipe.findMany();

    const pool: Record<Slot, RecipeShape[]> = { b: [], l: [], s: [], d: [] };
    for (const r of recipes) {
      const rd = r.diet as Diet;
      if (dietAllows(diet, rd)) pool[r.slot as Slot].push(r as unknown as RecipeShape);
    }
    // Fallback: if a slot has no diet-matching recipe, allow anything for that slot.
    for (const slot of SLOTS) {
      if (pool[slot].length === 0) pool[slot] = recipes.filter((r) => r.slot === slot) as unknown as RecipeShape[];
    }

    // Condition-aware selection: blood flags + goal switch on planning modes that
    // re-rank each slot's candidates toward what the guidelines recommend.
    const modes = planningModes(flagsFor(await this.bloodValues(userId)), pref?.goal ?? 'maintain');
    const ranked: Record<Slot, RecipeShape[]> = {
      b: rankByModes(pool.b, modes), l: rankByModes(pool.l, modes),
      s: rankByModes(pool.s, modes), d: rankByModes(pool.d, modes),
    };

    const offset = Math.floor(Math.random() * 6);
    const key = 'wk_' + this.rand(8);

    await this.prisma.mealPlan.create({
      data: {
        key,
        userId,
        mode,
        days: {
          create: DAYS.map((dayName, dayIndex) => ({
            dayIndex,
            dayName,
            meals: {
              create: SLOTS.map((slot) => {
                // When modes are active, rotate among the top candidates (keeps variety
                // across 7 days while honouring the clinical bias); else the full pool.
                const full = ranked[slot];
                const list = modes.length ? full.slice(0, Math.max(3, Math.ceil(full.length / 2))) : full;
                const recipe = list[(dayIndex + offset) % Math.max(1, list.length)];
                const withSides = slot === 'l' || slot === 'd';
                return {
                  slot,
                  recipeId: recipe.id,
                  skipped: false,
                  sidesRice: withSides ? (slot === 'l' ? 1 : 0) : 0,
                  sidesRoti: withSides ? 2 : 0,
                  sidesCurd: slot === 'l' ? 1 : 0,
                  sidesSalad: withSides ? 1 : 0,
                };
              }),
            },
          })),
        },
      },
    });
    return this.shapePlan(key);
  }

  // ─────────────── day summary ───────────────
  async daySummary(planKey: string, dayIndex: number) {
    const day = await this.prisma.mealPlanDay.findFirst({
      where: { dayIndex, plan: { key: planKey } },
      include: { meals: { include: { recipe: { include: { ingredients: true } } } } },
    });
    if (!day) throw new NotFoundException('plan day not found');

    let kcal = 0, protein = 0, carbs = 0, fat = 0, fiber = 0, cost = 0;
    for (const m of day.meals) {
      if (m.skipped) continue;
      kcal += m.recipe.kcal; protein += m.recipe.protein; carbs += m.recipe.carbs;
      fat += m.recipe.fat; fiber += m.recipe.fiber;
      const ing = m.recipe.ingredients.reduce((sum, i) => sum + i.priceInr, 0);
      cost += ing > 0 ? ing : Math.round(m.recipe.kcal * 0.11);
    }
    const cov = (p: number) => Math.max(15, Math.min(140, Math.round(p)));
    return {
      kcal, protein, carbs, fat, fiber, cost,
      coverage: {
        protein: cov((protein / 130) * 100), fiber: cov((fiber / 32) * 100),
        fe: cov(protein * 0.9 + 20), ca: cov(60 + dayIndex * 3), mg: cov(75),
        zn: cov(58), b12: cov(88), va: cov(72), vc: cov(115), vd: cov(45),
      },
    };
  }

  // ─────────────── swap + sides ───────────────
  async swap(planKey: string, dayIndex: number, slot: Slot) {
    const meal = await this.findMeal(planKey, dayIndex, slot);
    const candidates = await this.prisma.recipe.findMany({ where: { slot } });
    if (candidates.length > 0) {
      const next = candidates.filter((c) => c.id !== meal.recipeId);
      const pick = (next.length ? next : candidates)[Math.floor(Math.random() * (next.length || candidates.length))];
      await this.prisma.meal.update({ where: { id: meal.id }, data: { recipeId: pick.id } });
    }
    return this.shapePlan(planKey);
  }

  async setSides(planKey: string, dayIndex: number, slot: Slot, sides: { rice: number; roti: number; curd: number; salad: number }) {
    const meal = await this.findMeal(planKey, dayIndex, slot);
    await this.prisma.meal.update({
      where: { id: meal.id },
      data: { sidesRice: sides.rice, sidesRoti: sides.roti, sidesCurd: sides.curd, sidesSalad: sides.salad },
    });
    return this.shapePlan(planKey);
  }

  private async findMeal(planKey: string, dayIndex: number, slot: Slot) {
    const meal = await this.prisma.meal.findFirst({
      where: { slot, day: { dayIndex, plan: { key: planKey } } },
    });
    if (!meal) throw new NotFoundException('meal not found');
    return meal;
  }

  // ─────────────── recipes ───────────────
  async recipes(diet?: Diet) {
    const where = diet && diet !== 'everything' ? { diet } : {};
    const rows = await this.prisma.recipe.findMany({ where, orderBy: { name: 'asc' }, take: 200 });
    return rows.map((r) => this.recipeShape(r));
  }

  async recipe(id: string) {
    const r = await this.prisma.recipe.findUnique({ where: { id }, include: { ingredients: true } });
    if (!r) throw new NotFoundException('recipe not found');
    const cookSteps = await this.recipeCookSteps(r);
    return {
      ...this.recipeShape(r),
      ingredients: r.ingredients.map((i) => ({ name: i.name, grams: i.grams, priceInr: i.priceInr })),
      method: cookSteps.map((s) => s.text), // back-compat plain list
      cookSteps,                            // structured: text + timer + attention
    };
  }

  /** Structured cook steps for a recipe — AI-generated on first view and cached.
   *  Each step carries a duration (seconds it runs unattended, 0 = none) and an
   *  `active` flag (needs constant attention like stirring vs. background like a
   *  simmer). A deterministic fallback is used when AI is off. */
  private async recipeCookSteps(r: {
    id: string; name: string; country: string; minutes: number; diet: string;
    cookSteps?: string | null; steps?: string | null; ingredients: Array<{ name: string; grams: number }>;
  }): Promise<CookStep[]> {
    const cached = (r as { cookSteps?: string | null }).cookSteps;
    if (cached) {
      try {
        const s = JSON.parse(cached);
        if (Array.isArray(s) && s.length && typeof s[0]?.text === 'string') return s as CookStep[];
      } catch { /* regenerate */ }
    }
    const ingNames = r.ingredients.map((i) => i.name);
    const ingList = r.ingredients.map((i) => `${i.name} (${i.grams}g)`).join(', ');
    const fallback = this.fallbackCookSteps(r.name, ingNames, r.minutes);
    const ai = await this.ai.json<Array<{ text?: unknown; durationSec?: unknown; active?: unknown }>>(
      'You are a professional chef. Return the cooking method as a JSON array of 4–8 step objects. ' +
        'Each object: {"text": short one-action instruction, "durationSec": integer seconds the step runs unattended (0 if none), ' +
        '"active": true if it needs constant attention (stirring, whisking, flipping, watching closely) or false if it mostly runs on its own (simmer, bake, rest, marinate, boil)}.',
      `Recipe: "${r.name}" (${r.country}, ${r.diet}, ~${r.minutes} min). Ingredients: ${ingList}.\n` +
        `Return ONLY the JSON array.`,
      [],
      900,
    );
    const cleaned: CookStep[] = Array.isArray(ai)
      ? ai
          .filter((s) => s && typeof s.text === 'string' && (s.text as string).trim())
          .slice(0, 10)
          .map((s) => {
            const text = (s.text as string).trim();
            const dur = typeof s.durationSec === 'number' && s.durationSec > 0 ? Math.min(2 * 3600, Math.round(s.durationSec)) : secondsFromText(text);
            const active = typeof s.active === 'boolean' ? s.active : isActiveStep(text, dur);
            return { text, durationSec: dur, active };
          })
      : [];
    const result = cleaned.length ? cleaned : fallback;
    await this.prisma.recipe
      .update({ where: { id: r.id }, data: { cookSteps: JSON.stringify(result) } as never })
      .catch(() => undefined);
    return result;
  }

  private fallbackCookSteps(name: string, ingredients: string[], minutes: number): CookStep[] {
    const list = ingredients.length ? ingredients.join(', ') : 'your ingredients';
    const simmer = Math.max(10, Math.round(minutes * 0.6));
    const texts = [
      `Gather and prep everything: ${list}. Wash, peel and chop as needed.`,
      `Heat a pan with a little oil over medium heat and add the aromatics (onion/garlic/spices) first, stirring for about 2 minutes.`,
      `Add the main ingredients and cook, stirring, until softened and fragrant — about 5 minutes.`,
      `Season to taste, then cover and simmer on low for about ${simmer} minutes.`,
      `Check seasoning, finish, and serve ${name} hot.`,
    ];
    return texts.map((text) => {
      const durationSec = secondsFromText(text);
      return { text, durationSec, active: isActiveStep(text, durationSec) };
    });
  }

  /** Real ingredient search — recipes whose ingredients match the given terms,
   *  ranked by how many of your ingredients they use. */
  async searchByIngredients(terms: string[], diet?: Diet) {
    const clean = terms.map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 12);
    if (!clean.length) return this.recipes(diet);
    const rows = await this.prisma.recipe.findMany({
      where: {
        ...(diet && diet !== 'everything' ? { diet } : {}),
        ingredients: { some: { OR: clean.map((t) => ({ name: { contains: t, mode: 'insensitive' as const } })) } },
      },
      include: { ingredients: { select: { name: true } } },
      take: 120,
    });
    const ranked = rows
      .map((r) => {
        const names = r.ingredients.map((i) => i.name.toLowerCase());
        const matches = clean.filter((t) => names.some((n) => n.includes(t))).length;
        return { r, matches };
      })
      .sort((a, b) => b.matches - a.matches || a.r.name.localeCompare(b.r.name))
      .slice(0, 60);
    return ranked.map(({ r, matches }) => ({ ...this.recipeShape(r), matches }));
  }

  // ─────────────── grocery cart ───────────────
  async getCart(userId: string) {
    const cart = await this.prisma.groceryCart.findFirst({
      where: { userId }, orderBy: { createdAt: 'desc' }, include: { items: true },
    });
    return cart ?? { id: null, items: [] };
  }

  /** Build a grocery cart from a plan's ingredients, split fresh vs pantry. */
  async addPlanToCart(userId: string, planKey: string) {
    const plan = await this.prisma.mealPlan.findUnique({
      where: { key: planKey },
      include: { days: { include: { meals: { include: { recipe: { include: { ingredients: true } } } } } } },
    });
    if (!plan) throw new NotFoundException('plan not found');

    const totals = new Map<string, { grams: number; price: number }>();
    for (const day of plan.days) {
      for (const m of day.meals) {
        if (m.skipped) continue;
        for (const ing of m.recipe.ingredients) {
          const cur = totals.get(ing.name) ?? { grams: 0, price: 0 };
          cur.grams += ing.grams; cur.price += ing.priceInr; totals.set(ing.name, cur);
        }
      }
    }
    const fresh = ['tomato', 'onion', 'spinach', 'paneer', 'chicken', 'fish', 'salmon', 'curd', 'milk', 'egg', 'vegetable', 'fruit', 'avocado'];
    const cart = await this.prisma.groceryCart.create({
      data: {
        userId,
        items: {
          create: [...totals.entries()].map(([name, v]) => ({
            name,
            category: fresh.some((f) => name.toLowerCase().includes(f)) ? 'fresh' : 'pantry',
            qty: Math.max(1, Math.round(v.grams / 200)),
            priceInr: v.price,
          })),
        },
      },
      include: { items: true },
    });
    return cart;
  }

  // ─────────────── wallet ───────────────
  private static readonly WALLET_SEED_INR = 5000;

  /** Balance + ledger. First call seeds a welcome credit so the demo economy works. */
  async wallet(userId: string) {
    let ledger = await this.prisma.walletLedger.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    if (ledger.length === 0) {
      await this.prisma.walletLedger.create({
        data: { userId, amountInr: NutritionService.WALLET_SEED_INR, kind: 'credit', note: 'Welcome credit' },
      });
      ledger = await this.prisma.walletLedger.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
    }
    const balanceInr = ledger.reduce(
      (sum, t) => sum + (t.kind === 'debit' ? -t.amountInr : t.amountInr),
      0,
    );
    return {
      balanceInr,
      transactions: ledger.slice(0, 20).map((t) => ({
        id: t.id, amountInr: t.amountInr, kind: t.kind, note: t.note, createdAt: t.createdAt.toISOString(),
      })),
    };
  }

  // ─────────────── orders ───────────────
  /** Place an order from the latest grocery cart: pantry ships once, fresh splits
   *  into 7 daily deliveries; total is debited from the wallet. */
  async placeOrder(userId: string, method?: 'wallet' | 'card') {
    const cart = await this.prisma.groceryCart.findFirst({
      where: { userId }, orderBy: { createdAt: 'desc' }, include: { items: true },
    });
    if (!cart || cart.items.length === 0) throw new NotFoundException('build a grocery cart first');

    const total = cart.items.reduce((s, i) => s + i.priceInr, 0);
    // Unified payment: charge the one city wallet via the Financial hub.
    await this.financial.charge(userId, { hub: 'Nutrition', category: 'nutrition', label: 'Grocery & meal order', amountInr: total, method });

    const freshTotal = cart.items.filter((i) => i.category === 'fresh').reduce((s, i) => s + i.priceInr, 0);
    const perDay = Math.round(freshTotal / 7);
    const today = new Date();

    const order = await this.prisma.nutritionOrder.create({
      data: {
        userId,
        totalInr: total,
        items: {
          create: cart.items.map((i) => ({ name: i.name, category: i.category, qty: i.qty, priceInr: i.priceInr })),
        },
        deliveries: {
          create: Array.from({ length: 7 }, (_v, dayIndex) => ({
            dayIndex,
            date: new Date(today.getTime() + dayIndex * 86_400_000),
            amountInr: dayIndex === 6 ? freshTotal - perDay * 6 : perDay,
          })),
        },
      },
      include: { items: true, deliveries: { orderBy: { dayIndex: 'asc' } } },
    });
    return this.shapeOrder(order);
  }

  async orders(userId: string) {
    const rows = await this.prisma.nutritionOrder.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { items: true, deliveries: { orderBy: { dayIndex: 'asc' } } },
    });
    return rows.map((o) => this.shapeOrder(o));
  }

  /** Cancel a scheduled fresh delivery — its amount refunds to the wallet. */
  async cancelDelivery(userId: string, orderId: string, deliveryId: string) {
    const delivery = await this.prisma.freshDelivery.findFirst({
      where: { id: deliveryId, orderId, order: { userId } },
    });
    if (!delivery) throw new NotFoundException('delivery not found');
    if (delivery.status !== 'scheduled') throw new NotFoundException('only scheduled deliveries can be cancelled');
    await this.prisma.freshDelivery.update({ where: { id: delivery.id }, data: { status: 'cancelled' } });
    if (delivery.amountInr > 0) {
      await this.prisma.walletLedger.create({
        data: { userId, amountInr: delivery.amountInr, kind: 'refund', note: `Delivery day ${delivery.dayIndex + 1} cancelled` },
      });
    }
    return this.orders(userId);
  }

  private shapeOrder(o: {
    id: string; totalInr: number; status: string; createdAt: Date;
    items: { id: string; name: string; category: string; qty: number; priceInr: number }[];
    deliveries: { id: string; dayIndex: number; date: Date; status: string; amountInr: number }[];
  }) {
    return {
      id: o.id,
      totalInr: o.totalInr,
      status: o.status,
      createdAt: o.createdAt.toISOString(),
      items: o.items.map((i) => ({ id: i.id, name: i.name, category: i.category, qty: i.qty, priceInr: i.priceInr })),
      deliveries: o.deliveries.map((d) => ({
        id: d.id, dayIndex: d.dayIndex, date: d.date.toISOString().slice(0, 10), status: d.status, amountInr: d.amountInr,
      })),
    };
  }

  // ─────────────── blood panel (Medical bridge) ───────────────
  async bloodPanel(userId: string) {
    const rows = await this.prisma.bloodMarker.findMany({ where: { userId } });
    const byKey = new Map(rows.map((r) => [r.key, r.value]));
    const values: Record<string, number> = {};
    for (const [k, v] of byKey) values[k] = v;
    const crp = byKey.get('crp');

    const flags: Record<string, MarkerStatus> = {};
    const markers = MARKER_RULES.filter((rule) => byKey.has(rule.key)).map((rule) => {
      const value = byKey.get(rule.key) as number;
      const { status, advice, caveat, citations } = evaluateMarker(rule, value, crp);
      flags[rule.key] = status;
      return {
        key: rule.key, label: rule.label, unit: rule.unit, value, status, advice, caveat,
        range: `${rule.min}–${rule.max}`,
        citations: citations.map((id) => CITATIONS[id]).filter(Boolean),
      };
    });

    return {
      markers,
      alerts: criticalAlerts(values),                    // "seek medical care" red flags
      conditions: triggeredConditions(flags).map((c) => ({
        key: c.key, name: c.name, principles: c.principles,
        citations: c.citations.map((id) => CITATIONS[id]).filter(Boolean),
      })),
      disclaimer: 'Educational guidance grounded in ESPEN and Krause clinical nutrition sources — not a diagnosis. Always confirm with your doctor or dietitian.',
    };
  }

  async saveBlood(userId: string, dto: BloodInputDto) {
    for (const [key, value] of Object.entries(dto)) {
      if (typeof value !== 'number') continue;
      await this.prisma.bloodMarker.upsert({
        where: { userId_key: { userId, key } },
        update: { value },
        create: { userId, key, value },
      });
    }
    return this.bloodPanel(userId);
  }

  // ─────────────── supplements (goal + biomarker matched) ───────────────
  async supplements(userId: string) {
    const pref = await this.prisma.foodPref.findUnique({ where: { userId } });
    const panel = await this.bloodPanel(userId);
    const flags: Record<string, MarkerStatus> = {};
    for (const m of panel.markers) flags[m.key] = m.status as MarkerStatus;
    const kit = supplementKit(pref?.goal ?? 'maintain', flags);
    return { goal: pref?.goal ?? 'maintain', kit, totalInr: kit.reduce((s, k) => s + k.priceInr, 0) };
  }

  // ─────────────── expert care (dietitians → real chat) ───────────────
  async dietitians() {
    const rows = await this.prisma.dietitian.findMany({
      include: { user: { select: { id: true, handle: true, name: true, profileImage: true } } },
    });
    return rows.map((d) => ({
      id: d.id, name: d.user.name, handle: d.user.handle, specialty: d.specialty,
      languages: d.languages.split(',').filter(Boolean), rating: d.rating, priceInr: d.priceInr,
    }));
  }

  /** Booking creates an ACCEPTED NUTRITIONIST_CLIENT connection and opens the chat. */
  async bookDietitian(userId: string, dietitianId: string) {
    const dietitian = await this.prisma.dietitian.findUnique({ where: { id: dietitianId } });
    if (!dietitian) throw new NotFoundException('dietitian not found');
    const [userOneId, userTwoId] = [userId, dietitian.userId].sort();
    await this.prisma.connection.upsert({
      where: { userOneId_userTwoId_connectionType: { userOneId, userTwoId, connectionType: 'NUTRITIONIST_CLIENT' } },
      update: { status: 'ACCEPTED' },
      create: { userOneId, userTwoId, connectionType: 'NUTRITIONIST_CLIENT', status: 'ACCEPTED', requestedById: userId },
    });
    const conversation = await this.conversations.startDirect(userId, dietitian.userId);
    const booking = await this.prisma.dietitianBooking.create({
      data: { userId, dietitianId, conversationId: conversation.id },
    });
    return { bookingId: booking.id, conversationId: conversation.id };
  }

  private async ensureDietitians(): Promise<void> {
    // Demo dietitians are fake people (real User accounts). Off by default so the
    // Expert Care list is empty until real providers are added. Set SEED_DEMO=true to restore.
    if (process.env.SEED_DEMO !== 'true') return;
    try {
      const count = await this.prisma.dietitian.count();
      if (count > 0) return;
    } catch {
      return; // table not migrated yet — ensureRecipes already logged guidance
    }
    const seed = [
      { handle: 'dr_kavita', name: 'Dr. Kavita Menon', specialty: 'Clinical nutrition · diabetes', languages: 'English,Hindi,Malayalam', rating: 4.9, priceInr: 899 },
      { handle: 'coach_arjun', name: 'Arjun Bedi', specialty: 'Sports nutrition · muscle gain', languages: 'English,Hindi,Punjabi', rating: 4.8, priceInr: 699 },
      { handle: 'dr_sana', name: 'Dr. Sana Qureshi', specialty: 'Gut health · PCOS', languages: 'English,Hindi,Urdu', rating: 4.9, priceInr: 999 },
    ];
    for (const d of seed) {
      const user = await this.prisma.user.upsert({
        where: { handle: d.handle },
        update: {},
        create: { handle: d.handle, name: d.name, passwordHash: randomBytes(24).toString('hex') },
      });
      await this.prisma.dietitian.create({
        data: { userId: user.id, specialty: d.specialty, languages: d.languages, rating: d.rating, priceInr: d.priceInr },
      });
    }
    this.logger.log(`Seeded ${seed.length} dietitians.`);
  }

  // ─────────────── shaping ───────────────
  private recipeShape(r: {
    id: string; name: string; country: string; kcal: number; protein: number; carbs: number;
    fat: number; fiber: number; minutes: number; gramsPerServing: number; diet: string;
  }): RecipeShape {
    return {
      id: r.id, name: r.name, country: r.country, kcal: r.kcal, protein: r.protein,
      carbs: r.carbs, fat: r.fat, fiber: r.fiber, minutes: r.minutes,
      gramsPerServing: r.gramsPerServing, diet: r.diet as Diet,
    };
  }

  private async shapePlan(key: string) {
    const plan = await this.prisma.mealPlan.findUnique({
      where: { key },
      include: {
        days: {
          orderBy: { dayIndex: 'asc' },
          include: { meals: { orderBy: { slot: 'asc' }, include: { recipe: true } } },
        },
      },
    });
    if (!plan) throw new NotFoundException('plan not found');
    const slotOrder: Record<string, number> = { b: 0, l: 1, s: 2, d: 3 };
    return {
      key: plan.key,
      days: plan.days.map((d) => ({
        day: d.dayName,
        meals: [...d.meals]
          .sort((a, b) => slotOrder[a.slot] - slotOrder[b.slot])
          .map((m) => ({
            slot: m.slot,
            recipe: this.recipeShape(m.recipe),
            skipped: m.skipped,
            sides: { rice: m.sidesRice, roti: m.sidesRoti, curd: m.sidesCurd, salad: m.sidesSalad },
          })),
      })),
    };
  }

  private rand(n: number): string {
    const c = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let s = '';
    for (let i = 0; i < n; i++) s += c[Math.floor(Math.random() * c.length)];
    return s;
  }

  // ─────────────── recipe seed (runs once if table empty) ───────────────
  private async ensureRecipes(): Promise<void> {
    try {
      const count = await this.prisma.recipe.count();
      if (count > 0) return;
    } catch {
      this.logger.warn('Recipe table not migrated yet — run `npx prisma migrate dev` then restart.');
      return;
    }
    const R = (
      name: string, country: string, slot: Slot, kcal: number, protein: number, carbs: number,
      fat: number, fiber: number, minutes: number, g: number, diet: Diet,
      ingredients: [string, number, number][],
    ) => ({
      name, country, slot, kcal, protein, carbs, fat, fiber, minutes, gramsPerServing: g, diet,
      ingredients: { create: ingredients.map(([iname, grams, priceInr]) => ({ name: iname, grams, priceInr })) },
    });
    const seed = [
      R('Masala Oats', 'India', 'b', 320, 12, 48, 8, 7, 15, 280, 'veg', [['Oats', 60, 18], ['Mixed vegetables', 80, 20], ['Spices', 5, 5]]),
      R('Poha with Peanuts', 'India', 'b', 300, 8, 52, 7, 5, 20, 250, 'veg', [['Flattened rice', 70, 15], ['Peanuts', 20, 12], ['Onion', 40, 8]]),
      R('Egg Bhurji & Toast', 'India', 'b', 380, 22, 30, 18, 3, 15, 240, 'egg', [['Egg', 100, 24], ['Bread', 60, 15], ['Onion', 30, 6]]),
      R('Avocado Toast', 'USA', 'b', 350, 10, 38, 18, 9, 10, 220, 'vegan', [['Avocado', 80, 60], ['Sourdough', 70, 30]]),
      R('Idli & Sambar', 'India', 'b', 290, 11, 54, 4, 6, 25, 300, 'veg', [['Idli batter', 150, 25], ['Sambar', 120, 20]]),
      R('Moong Dal Chilla', 'India', 'b', 280, 16, 34, 8, 6, 20, 220, 'vegan', [['Moong dal', 80, 22], ['Vegetables', 50, 12]]),
      R('Rajma Chawal', 'India', 'l', 560, 20, 92, 10, 14, 35, 400, 'veg', [['Kidney beans', 120, 30], ['Rice', 150, 25], ['Onion tomato', 80, 15]]),
      R('Grilled Chicken Bowl', 'USA', 'l', 620, 45, 55, 20, 9, 30, 380, 'nonveg', [['Chicken breast', 150, 90], ['Quinoa', 120, 40], ['Greens', 80, 20]]),
      R('Paneer Butter Masala', 'India', 'l', 590, 24, 40, 34, 6, 30, 320, 'veg', [['Paneer', 120, 70], ['Tomato gravy', 120, 25], ['Cream', 20, 15]]),
      R('Kerala Fish Curry', 'India', 'l', 520, 38, 30, 24, 5, 25, 340, 'pesc', [['Fish', 150, 110], ['Coconut', 40, 18], ['Spices', 10, 8]]),
      R('Dal Tadka & Rice', 'India', 'l', 540, 19, 88, 11, 12, 30, 400, 'veg', [['Toor dal', 100, 22], ['Rice', 150, 25]]),
      R('Chole', 'India', 'l', 520, 18, 80, 14, 13, 30, 360, 'vegan', [['Chickpeas', 130, 28], ['Onion tomato', 80, 15]]),
      R('Sprout Chaat', 'India', 's', 180, 11, 26, 3, 8, 10, 150, 'veg', [['Sprouts', 120, 20], ['Onion', 30, 6]]),
      R('Mixed Nuts', 'USA', 's', 200, 6, 8, 17, 4, 5, 40, 'vegan', [['Almonds cashews', 40, 45]]),
      R('Fruit Bowl', 'USA', 's', 150, 2, 36, 1, 6, 5, 200, 'vegan', [['Seasonal fruit', 200, 40]]),
      R('Protein Shake', 'USA', 's', 220, 25, 18, 5, 2, 5, 300, 'veg', [['Whey', 30, 45], ['Milk', 250, 15]]),
      R('Roasted Makhana', 'India', 's', 160, 5, 28, 4, 3, 12, 60, 'jain', [['Makhana', 40, 30]]),
      R('Roti & Mixed Veg', 'India', 'd', 450, 15, 62, 14, 11, 30, 340, 'veg', [['Wheat flour', 90, 15], ['Vegetables', 150, 30]]),
      R('Butter Chicken', 'India', 'd', 610, 42, 24, 38, 4, 30, 320, 'nonveg', [['Chicken', 150, 90], ['Tomato cream gravy', 120, 30]]),
      R('Tofu Stir-Fry', 'China', 'd', 420, 24, 40, 18, 8, 20, 320, 'vegan', [['Tofu', 150, 40], ['Vegetables', 120, 25]]),
      R('Grilled Salmon & Greens', 'USA', 'd', 520, 40, 18, 30, 6, 25, 300, 'pesc', [['Salmon', 150, 160], ['Greens', 100, 25]]),
      R('Moong Khichdi', 'India', 'd', 400, 16, 66, 8, 9, 25, 380, 'jain', [['Rice moong', 140, 28], ['Ghee', 10, 10]]),
      R('Palak Paneer & Roti', 'India', 'd', 520, 25, 44, 28, 9, 30, 340, 'veg', [['Spinach', 150, 20], ['Paneer', 100, 60], ['Roti', 60, 12]]),
    ];
    for (const r of seed) {
      await this.prisma.recipe.create({ data: r });
    }
    this.logger.log(`Seeded ${seed.length} recipes.`);
  }
}
