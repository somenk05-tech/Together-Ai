import { Injectable } from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import { AiService } from './ai.service';
import { flagsFor, ruleFor, type MarkerStatus } from '../nutrition/clinical-engine';

export interface Suggestion { title: string; detail: string; tag?: string }
export interface AiSuggestions {
  aiPowered: boolean;
  intro: string;
  items: Suggestion[];
  note?: string;
}

const HEALTH_NOTE = 'Informational only — not medical advice. Talk to a clinician about your results.';

@Injectable()
export class AiSuggestionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
  ) {}

  // ── Recipes from blood test / food profile ────────────────────────────────
  async recipes(userId: string): Promise<AiSuggestions> {
    const pref = await this.prisma.foodPref.findUnique({ where: { userId } });
    const values = await this.latestBloodValues(userId);
    const flags = flagsFor(values);
    const abnormal = Object.entries(flags).filter(([, s]) => s !== 'normal') as [string, MarkerStatus][];
    const diet = pref?.diet ?? 'everything';
    const goal = pref?.goal ?? 'maintain';

    const flagText = abnormal.length
      ? abnormal.map(([k, s]) => `${ruleFor(k)?.label ?? k}: ${s}`).join(', ')
      : 'no flagged markers';

    const fallback = this.recipeFallback(abnormal, diet, goal);
    const items = await this.ai.json<Suggestion[]>(
      'You are a registered-dietitian assistant for a wellness app. Suggest practical, appetizing meal ideas. Never diagnose; keep it food-focused and safe.',
      `Diet: ${diet}. Goal: ${goal}. Flagged blood markers: ${flagText}.\n` +
        `Suggest 4 meal/recipe ideas that fit the diet and gently help those markers. ` +
        `Return a JSON array of {"title","detail","tag"} where tag is the marker or goal it helps (max ~30 words per detail).`,
      fallback,
    );

    return {
      aiPowered: this.ai.enabled,
      intro: abnormal.length
        ? `Meal ideas tuned to your latest results (${flagText}) and your ${diet} diet.`
        : `Meal ideas for your ${diet} diet and “${goal}” goal.`,
      items: items.length ? items : fallback,
      note: HEALTH_NOTE,
    };
  }

  private recipeFallback(abnormal: [string, MarkerStatus][], diet: string, goal: string): Suggestion[] {
    if (abnormal.length) {
      return abnormal.slice(0, 4).map(([k, s]) => {
        const rule = ruleFor(k);
        const foods = rule?.foods?.slice(0, 4).join(', ') ?? 'a balanced plate';
        return {
          title: `${rule?.label ?? k} is ${s}`,
          detail: `Build meals around ${foods}. ${s === 'low' ? rule?.lowAdvice ?? '' : rule?.highAdvice ?? ''}`.slice(0, 220),
          tag: k,
        };
      });
    }
    const base: Record<string, Suggestion[]> = {
      lose: [
        { title: 'High-protein breakfast', detail: 'Eggs or Greek yogurt with fruit keeps you full and steadies energy.', tag: 'goal' },
        { title: 'Big-volume lunch', detail: 'A large salad bowl with a lean protein and olive oil — filling, lower calorie.', tag: 'goal' },
      ],
      gain: [
        { title: 'Calorie-dense smoothie', detail: 'Oats, nut butter, banana and milk between meals to add easy calories.', tag: 'goal' },
        { title: 'Protein at every meal', detail: 'Aim for a palm of protein plus carbs to support muscle gain.', tag: 'goal' },
      ],
      maintain: [
        { title: 'Balanced plate', detail: 'Half veg, a quarter protein, a quarter whole grains — simple and sustainable.', tag: 'goal' },
        { title: 'Fibre-forward snacks', detail: 'Fruit, nuts or hummus with veg to stay even through the day.', tag: 'goal' },
      ],
    };
    return base[goal] ?? base.maintain;
  }

  // ── Astrology dating compatibility ────────────────────────────────────────
  async astrology(userId: string): Promise<AiSuggestions> {
    const profile = await this.prisma.datingProfile.findUnique({ where: { userId } });
    if (!profile) {
      return { aiPowered: this.ai.enabled, intro: 'Add your birth date to your matchmaking profile to unlock your compatibility guide.', items: [] };
    }
    const sign = sunSign(profile.birthDate);
    const compatible = COMPAT[sign] ?? [];

    /**
     * The pairings are traditional; the percentage was not.
     *
     * These numbers are hand-written in COMPAT above — 92 for Aries/Leo, 84 for
     * Aries/Gemini — and rendering them as "92% match" told citizens a
     * computation had happened. Nothing was computed, and there is nothing to
     * compute: sun-sign compatibility is folk tradition, and a percentage claims
     * a precision it cannot have. Two people deciding whether to meet deserve to
     * know which of those they are reading.
     *
     * The ordering the numbers encode is real and worth keeping, so they still
     * rank the list — they are just shown as strength of tradition rather than
     * as a measurement.
     */
    const strengthOf = (score: number) => score >= 90 ? 'Classic pairing' : score >= 85 ? 'Strong pairing' : 'Easy pairing';

    const fallback: Suggestion[] = [...compatible]
      .sort((a, b) => b.score - a.score)
      .map((c) => ({
        title: `${sign} + ${c.sign}`,
        detail: c.why,
        tag: strengthOf(c.score),
      }));

    const items = await this.ai.json<Suggestion[]>(
      'You write warm, light astrology dating content. Entertainment, never a deterministic claim about anyone.',
      `You are writing to one person, in the second person. They are a ${sign}. Write 4 compatibility notes for their most compatible signs — for each: which sign, and a playful reason they click. ` +
        `Return JSON array of {"title","detail","tag"}. The tag MUST be exactly one of "Classic pairing", "Strong pairing" or "Easy pairing" — ` +
        `never a percentage or any other number, because no percentage is being calculated here.`,
      fallback,
    );

    // A model asked about compatibility will reach for a percentage anyway.
    const TAGS = new Set(['Classic pairing', 'Strong pairing', 'Easy pairing']);
    for (const [i, item] of items.entries()) {
      if (!TAGS.has(item.tag ?? '')) item.tag = fallback[i]?.tag ?? 'Strong pairing';
    }

    return {
      aiPowered: this.ai.enabled,
      intro: `You're a ${sign} ✨. Here's who the stars say you click with.`,
      items: items.length ? items : fallback,
      note: 'Just for fun ✨',
    };
  }

  // ── Beauty product / routine suggestions ──────────────────────────────────
  async beauty(userId: string): Promise<AiSuggestions> {
    const p = await this.prisma.beautyProfile.findUnique({ where: { userId } });
    const skin = p?.skinType ?? 'normal';
    const hair = p?.hairType ?? 'straight';
    const concerns = (p?.concerns ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const concernText = concerns.length ? concerns.join(', ') : 'general care';

    const fallback = this.beautyFallback(skin, concerns);
    const items = await this.ai.json<Suggestion[]>(
      'You are a friendly skincare & beauty advisor. Recommend product TYPES and simple routines, not specific brands. Be gentle and evidence-aware.',
      `Skin type: ${skin}. Hair type: ${hair}. Concerns: ${concernText}. ` +
        `Suggest a simple 4-step routine with the product type for each step and why. ` +
        `Return JSON array of {"title","detail","tag"} (tag = "AM"/"PM"/"Weekly").`,
      fallback,
    );

    return {
      aiPowered: this.ai.enabled,
      intro: `A routine for ${skin} skin${concerns.length ? `, targeting ${concernText}` : ''}.`,
      items: items.length ? items : fallback,
    };
  }

  private beautyFallback(skin: string, concerns: string[]): Suggestion[] {
    const cleanser = skin === 'oily' ? 'gel cleanser' : skin === 'dry' ? 'cream cleanser' : 'gentle foaming cleanser';
    const items: Suggestion[] = [
      { title: 'Cleanse', detail: `A ${cleanser} morning and night to keep skin balanced.`, tag: 'AM/PM' },
      { title: 'Moisturise', detail: skin === 'oily' ? 'A light, oil-free gel moisturiser.' : 'A hydrating cream to lock in moisture.', tag: 'AM/PM' },
      { title: 'Sunscreen', detail: 'Broad-spectrum SPF 30+ every morning — the single best anti-ageing step.', tag: 'AM' },
    ];
    if (concerns.includes('acne')) items.push({ title: 'Target breakouts', detail: 'A salicylic acid or benzoyl peroxide treatment a few nights a week.', tag: 'PM' });
    else if (concerns.includes('aging') || concerns.includes('wrinkles')) items.push({ title: 'Renew', detail: 'A retinol a few nights a week to smooth fine lines (start slow).', tag: 'PM' });
    else items.push({ title: 'Weekly boost', detail: 'A hydrating or exfoliating mask once a week for glow.', tag: 'Weekly' });
    return items;
  }

  // ── Fitness plan suggestions ──────────────────────────────────────────────
  async fitness(userId: string): Promise<AiSuggestions> {
    const p = await this.prisma.fitnessProfile.findUnique({ where: { userId } });
    const level = p?.level ?? 'beginner';
    const goal = p?.goal ?? 'general';
    const mode = p?.mode ?? 'mixed';
    const conditions = (p?.conditions ?? '').split(',').map((s) => s.trim()).filter(Boolean);

    const fallback = this.fitnessFallback(level, goal);
    const items = await this.ai.json<Suggestion[]>(
      'You are a certified fitness coach. Give safe, progressive workout guidance. If health conditions are present, keep advice conservative and add a caution.',
      `Level: ${level}. Goal: ${goal}. Preferred style: ${mode}. Conditions: ${conditions.join(', ') || 'none'}. ` +
        `Suggest a simple weekly plan as 4 items (e.g. days/sessions) with what to do and intensity. ` +
        `Return JSON array of {"title","detail","tag"} (tag = a day or focus).`,
      fallback,
    );

    return {
      aiPowered: this.ai.enabled,
      intro: `A ${level} plan for your “${goal}” goal${mode !== 'mixed' ? ` (${mode})` : ''}.`,
      items: items.length ? items : fallback,
      note: conditions.length ? 'You noted health conditions — start easy and check with your doctor.' : undefined,
    };
  }

  private fitnessFallback(level: string, goal: string): Suggestion[] {
    const intensity = level === 'advanced' || level === 'athlete' ? 'hard' : level === 'intermediate' ? 'moderate' : 'easy';
    return [
      { title: 'Day 1 — Full-body strength', detail: `Squats, push-ups, rows — 3 sets, ${intensity} effort.`, tag: 'Strength' },
      { title: 'Day 2 — Cardio', detail: goal === 'weightLoss' ? '30–40 min brisk walk, jog or cycle.' : '20–30 min steady cardio.', tag: 'Cardio' },
      { title: 'Day 3 — Mobility & core', detail: 'Stretching, planks and light core work to recover.', tag: 'Recovery' },
      { title: 'Day 4 — Repeat & progress', detail: 'Repeat Day 1 adding a little weight or a rep when it feels easy.', tag: 'Progress' },
    ];
  }

  // ── helpers ───────────────────────────────────────────────────────────────
  private async latestBloodValues(userId: string): Promise<Record<string, number>> {
    const test = await this.prisma.medicalBloodTest.findFirst({
      where: { userId },
      orderBy: { takenOn: 'desc' },
      include: { biomarkers: true },
    });
    const values: Record<string, number> = {};
    for (const b of test?.biomarkers ?? []) values[b.key] = b.value;
    return values;
  }
}

// ── Astrology helpers ───────────────────────────────────────────────────────
type Sign =
  | 'Aries' | 'Taurus' | 'Gemini' | 'Cancer' | 'Leo' | 'Virgo'
  | 'Libra' | 'Scorpio' | 'Sagittarius' | 'Capricorn' | 'Aquarius' | 'Pisces';

function sunSign(date: Date): Sign {
  const m = date.getUTCMonth() + 1;
  const d = date.getUTCDate();
  const on = (mo: number, day: number) => m === mo && d >= day;
  const before = (mo: number, day: number) => m === mo && d <= day;
  if (on(3, 21) || before(4, 19)) return 'Aries';
  if (on(4, 20) || before(5, 20)) return 'Taurus';
  if (on(5, 21) || before(6, 20)) return 'Gemini';
  if (on(6, 21) || before(7, 22)) return 'Cancer';
  if (on(7, 23) || before(8, 22)) return 'Leo';
  if (on(8, 23) || before(9, 22)) return 'Virgo';
  if (on(9, 23) || before(10, 22)) return 'Libra';
  if (on(10, 23) || before(11, 21)) return 'Scorpio';
  if (on(11, 22) || before(12, 21)) return 'Sagittarius';
  if (on(12, 22) || before(1, 19)) return 'Capricorn';
  if (on(1, 20) || before(2, 18)) return 'Aquarius';
  return 'Pisces';
}

const COMPAT: Record<Sign, { sign: Sign; score: number; why: string }[]> = {
  Aries: [{ sign: 'Leo', score: 92, why: 'Two fire signs — big energy, adventure and mutual admiration.' }, { sign: 'Sagittarius', score: 90, why: 'Restless and fun; you push each other to explore.' }, { sign: 'Gemini', score: 84, why: 'Quick wit meets bold action — never boring.' }, { sign: 'Aquarius', score: 80, why: 'You give them spark; they give you fresh ideas.' }],
  Taurus: [{ sign: 'Virgo', score: 92, why: 'Grounded, loyal and practical — a steady, sensual match.' }, { sign: 'Capricorn', score: 90, why: 'Shared ambition and a love of the good life.' }, { sign: 'Cancer', score: 85, why: 'Home-loving and nurturing on both sides.' }, { sign: 'Pisces', score: 82, why: 'Your stability soothes their dreamy heart.' }],
  Gemini: [{ sign: 'Libra', score: 91, why: 'Two air signs — endless conversation and social spark.' }, { sign: 'Aquarius', score: 89, why: 'Ideas fly; you keep each other curious.' }, { sign: 'Aries', score: 84, why: 'Playful banter and spontaneous plans.' }, { sign: 'Leo', score: 80, why: 'You charm them; they adore an audience.' }],
  Cancer: [{ sign: 'Scorpio', score: 93, why: 'Deep, intuitive and fiercely devoted water signs.' }, { sign: 'Pisces', score: 90, why: 'Tender, empathetic and emotionally in sync.' }, { sign: 'Taurus', score: 85, why: 'Comfort, loyalty and cosy nights in.' }, { sign: 'Virgo', score: 81, why: 'They look after you the way you look after everyone.' }],
  Leo: [{ sign: 'Aries', score: 92, why: 'Fire and fire — passionate, proud and bold.' }, { sign: 'Sagittarius', score: 89, why: 'Big adventures and even bigger laughs.' }, { sign: 'Gemini', score: 82, why: 'Flirty, fun and full of banter.' }, { sign: 'Libra', score: 85, why: 'They adore your warmth; you adore their charm.' }],
  Virgo: [{ sign: 'Taurus', score: 92, why: 'Practical, loyal and quietly devoted.' }, { sign: 'Capricorn', score: 90, why: 'Ambitious teammates who build things together.' }, { sign: 'Cancer', score: 82, why: 'Caring on both sides — a soft, safe match.' }, { sign: 'Scorpio', score: 84, why: 'Depth and focus you both respect.' }],
  Libra: [{ sign: 'Gemini', score: 91, why: 'Sparkling conversation and shared social ease.' }, { sign: 'Aquarius', score: 88, why: 'Idealistic, fair-minded and endlessly interesting.' }, { sign: 'Leo', score: 85, why: 'Glamour and warmth — a golden couple.' }, { sign: 'Sagittarius', score: 80, why: 'Freedom-loving fun.' }],
  Scorpio: [{ sign: 'Cancer', score: 93, why: 'Intense, loyal and emotionally bonded.' }, { sign: 'Pisces', score: 90, why: 'Soulful and magnetic — you just get each other.' }, { sign: 'Capricorn', score: 84, why: 'Power couple energy with real depth.' }, { sign: 'Virgo', score: 83, why: 'Focused, private and devoted.' }],
  Sagittarius: [{ sign: 'Aries', score: 90, why: 'Adventure buddies who never sit still.' }, { sign: 'Leo', score: 89, why: 'Warm, playful and always up for more.' }, { sign: 'Aquarius', score: 83, why: 'Free spirits with big ideas.' }, { sign: 'Libra', score: 80, why: 'They smooth your edges; you widen their world.' }],
  Capricorn: [{ sign: 'Taurus', score: 91, why: 'Grounded, ambitious and built to last.' }, { sign: 'Virgo', score: 90, why: 'Practical partners who get things done.' }, { sign: 'Scorpio', score: 84, why: 'Loyal, intense and driven.' }, { sign: 'Pisces', score: 79, why: 'They add softness to your structure.' }],
  Aquarius: [{ sign: 'Gemini', score: 90, why: 'Two air signs — inventive and mentally alive.' }, { sign: 'Libra', score: 88, why: 'Idealistic and socially in tune.' }, { sign: 'Sagittarius', score: 82, why: 'Independent explorers.' }, { sign: 'Aries', score: 80, why: 'They bring the spark to your vision.' }],
  Pisces: [{ sign: 'Cancer', score: 92, why: 'Dreamy, caring and deeply intuitive.' }, { sign: 'Scorpio', score: 90, why: 'Magnetic, soulful and all-in.' }, { sign: 'Taurus', score: 83, why: 'They anchor your dreams in something real.' }, { sign: 'Capricorn', score: 78, why: 'Opposites who balance each other.' }],
};
