import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import { MasterProfileService } from '../profile/master-profile.service';
import { FinancialService } from '../financial/financial.service';
import { AiService } from '../ai/ai.service';
import {
  NatalChart, geocodeApprox, natalChart, scanMonth, tzOffsetMinutes, SIGNS,
} from './astro-engine';
import { composeAnswer, composeGuidance, composeMonthly, wordCount, type DailyGuidance } from './astro-content';
import { computeNumerology, vimshottariDasha } from './personal-factors';

export interface SaveAstroProfileDto {
  birthDate: string;          // YYYY-MM-DD
  birthTime?: string | null;  // HH:MM (local at birth place) · null = time unknown
  birthCountry: string;
  birthState?: string | null;
  birthCity: string;
  timeZone: string;    // IANA, auto-detected client-side
}
export interface AskDto { topic: string; question: string; method?: 'wallet' | 'card' }

export const ASK_PRICE_INR = 75;

interface AstroProfileRow {
  id: string; userId: string; birthDate: Date; birthTime: string | null;
  birthCountry: string; birthState: string | null; birthCity: string;
  timeZone: string; lat: number | null; lng: number | null; updatedAt: Date;
}
interface AstroQuestionRow {
  id: string; userId: string; topic: string; question: string; answer: string;
  priceInr: number; createdAt: Date;
}

/**
 * Astrology Zone — one shared birth profile powering daily/monthly horoscopes
 * and the paid Ask-the-Astrologer consultations. Birth details entered anywhere
 * else in the app (dating onboarding) are automatically reused, so the user is
 * never asked twice. All readings derive from the deterministic planetary
 * engine; AI (when configured) only polishes prose, never invents positions.
 */
@Injectable()
export class AstrologyService {
  private readonly logger = new Logger('AstrologyService');
  constructor(
    private readonly prisma: PrismaService,
    private readonly masterProfile: MasterProfileService,
    private readonly financial: FinancialService,
    private readonly ai: AiService,
  ) {}

  /** New tables reach the generated client on deploy (`prisma db push` at boot);
   *  the offline local client predates them, hence the loose accessor. */
  private get db() {
    return this.prisma as unknown as {
      astroProfile: {
        findUnique: (a: unknown) => Promise<AstroProfileRow | null>;
        upsert: (a: unknown) => Promise<AstroProfileRow>;
      };
      astroQuestion: {
        create: (a: unknown) => Promise<AstroQuestionRow>;
        findMany: (a: unknown) => Promise<AstroQuestionRow[]>;
      };
      astroReading: {
        findUnique: (a: unknown) => Promise<{ readingJson: string } | null>;
        upsert: (a: unknown) => Promise<{ readingJson: string }>;
        findMany: (a: unknown) => Promise<Array<{ period: string; readingJson: string }>>;
        deleteMany: (a: unknown) => Promise<unknown>;
      };
    };
  }

  /** One saved reading per user per period (daily flips at the user's midnight,
   *  monthly is fixed from the 1st). Deterministic composers mean the lazy
   *  write stores exactly what a scheduled batch would have produced. */
  /** Reading engine version — bumped to v2 with the Vedic (sidereal) switch so
   *  cached tropical readings regenerate instead of being served stale. */
  private static readonly READING_VER = 'v3';

  private async cachedReading<T extends object>(
    userId: string, kind: 'daily' | 'monthly', periodKey: string, compute: () => T | Promise<T>,
  ): Promise<T & { saved: boolean }> {
    const period = `${AstrologyService.READING_VER}:${periodKey}`;
    const hit = await this.db.astroReading.findUnique({
      where: { userId_kind_period: { userId, kind, period } },
    }).catch(() => null);
    if (hit) {
      try { return { ...(JSON.parse(hit.readingJson) as T), saved: true }; }
      catch { /* recompute below */ }
    }
    const reading = await compute();
    await this.db.astroReading.upsert({
      where: { userId_kind_period: { userId, kind, period } },
      update: { readingJson: JSON.stringify(reading) },
      create: { userId, kind, period, readingJson: JSON.stringify(reading) },
    }).catch(() => undefined); // table may not exist mid-deploy — reading still returns
    return { ...reading, saved: true };
  }

  // ───────────────────────── Profile ─────────────────────────

  /** The shared astrology profile. If absent, birth details already given to
   *  the dating hub are auto-migrated in — entered once, reused everywhere. */
  async getProfile(userId: string) {
    let row = await this.db.astroProfile.findUnique({ where: { userId } }).catch(() => null);
    let source: 'astrology' | 'dating' | 'master' | null = row ? 'astrology' : null;

    if (!row) {
      // Master Profile first (single source of truth): if it already knows the
      // birth details — from ANY hub — materialise the astro row from it.
      const master = await this.masterProfile.get(userId).catch(() => null);
      if (master?.dateOfBirth && master.birthCity && master.birthCountry) {
        const timeZone = master.timeZone || 'Asia/Kolkata';
        const { lat, lng } = geocodeApprox(master.birthCity, master.birthState ?? null, master.birthCountry, timeZone);
        row = await this.db.astroProfile.upsert({
          where: { userId }, update: {},
          create: {
            userId, birthDate: new Date(master.dateOfBirth), birthTime: master.timeOfBirth ?? null,
            birthCountry: master.birthCountry, birthState: master.birthState ?? null,
            birthCity: master.birthCity, timeZone, lat, lng,
          },
        }).catch(() => null as never);
        if (row) return { complete: true, profile: this.shape(row), prefill: null, source: 'master' as const };
      }
      const dating = await this.prisma.datingProfile.findUnique({ where: { userId } }).catch(() => null);
      if (dating?.birthDate) {
        const place = (dating.birthPlace ?? '').split(',').map((s) => s.trim()).filter(Boolean);
        const birthCity = place[0] ?? '';
        const birthCountry = place[place.length - 1] && place.length > 1 ? place[place.length - 1] : 'India';
        if (birthCity) {
          // Complete elsewhere → persist silently so every feature shares it.
          const timeZone = 'Asia/Kolkata';
          const { lat, lng } = geocodeApprox(birthCity, place[1] ?? null, birthCountry, timeZone);
          row = await this.db.astroProfile.upsert({
            where: { userId },
            update: {},
            create: {
              userId, birthDate: dating.birthDate, birthTime: dating.birthTime ?? null,
              birthCountry, birthState: place.length > 2 ? place[1] : null, birthCity,
              timeZone, lat, lng,
            },
          }).catch(() => null as never);
          source = row ? 'dating' : null;
        } else {
          // Partial → prefill the form, never ask for what we already know.
          return {
            complete: false,
            profile: null,
            prefill: {
              birthDate: dating.birthDate.toISOString().slice(0, 10),
              birthTime: dating.birthTime ?? '',
              birthCity, birthCountry,
              birthState: place.length > 2 ? place[1] : '',
            },
            source: 'dating' as const,
          };
        }
      }
    }
    if (!row) return { complete: false, profile: null, prefill: null, source: null };
    return { complete: true, profile: this.shape(row), prefill: null, source };
  }

  async saveProfile(userId: string, dto: SaveAstroProfileDto) {
    const birthDate = new Date(`${dto.birthDate}T00:00:00.000Z`);
    if (isNaN(birthDate.getTime())) throw new BadRequestException('Invalid birth date.');
    if (birthDate.getTime() > Date.now()) throw new BadRequestException('Birth date cannot be in the future.');
    // Validate the zone (falls back inside the engine, but reject junk here).
    try { new Intl.DateTimeFormat('en-US', { timeZone: dto.timeZone }); }
    catch { throw new BadRequestException('Unknown time zone.'); }
    const { lat, lng } = geocodeApprox(dto.birthCity, dto.birthState ?? null, dto.birthCountry, dto.timeZone);
    const data = {
      birthDate, birthTime: dto.birthTime || null, birthCountry: dto.birthCountry.trim(),
      birthState: dto.birthState?.trim() || null, birthCity: dto.birthCity.trim(),
      timeZone: dto.timeZone, lat, lng,
    };
    const row = await this.db.astroProfile.upsert({
      where: { userId },
      update: data,
      create: { userId, ...data },
    });
    // Birth details changed → today's cached horoscope + this month's reading are
    // now stale. Drop the user's cached readings so daily/monthly/insights
    // regenerate from the new chart on the next fetch (spec: show the UPDATED
    // horoscope after saving).
    await this.db.astroReading.deleteMany({ where: { userId } }).catch(() => undefined);
    // Master Profile sync — birth details are shared fields used app-wide.
    await this.masterProfile.syncShared(userId, {
      dateOfBirth: birthDate, timeOfBirth: data.birthTime,
      birthCountry: data.birthCountry, birthState: data.birthState, birthCity: data.birthCity,
      timeZone: data.timeZone,
    }, 'astrology').catch(() => undefined);
    return { saved: true, profile: this.shape(row) };
  }

  private shape(row: AstroProfileRow) {
    const chart = this.chartOf(row);
    return {
      birthDate: row.birthDate.toISOString().slice(0, 10),
      birthTime: row.birthTime,
      timeKnown: !!row.birthTime,
      birthCountry: row.birthCountry,
      birthState: row.birthState,
      birthCity: row.birthCity,
      timeZone: row.timeZone,
      updatedAt: row.updatedAt.toISOString(),
      chart: {
        sunSign: chart.sun.sign, moonSign: chart.moon.sign,
        ascendant: chart.ascendant?.sign ?? null,
        signs: SIGNS,
      },
    };
  }

  private chartOf(row: AstroProfileRow): NatalChart {
    return natalChart(row.birthDate, row.birthTime, row.timeZone, row.lat, row.lng);
  }

  private async requireProfile(userId: string): Promise<AstroProfileRow | null> {
    await this.getProfile(userId); // triggers the dating auto-migration if possible
    return this.db.astroProfile.findUnique({ where: { userId } }).catch(() => null);
  }

  /** The user's "now" in their own time zone (so the daily flips at THEIR midnight). */
  private userNow(row: AstroProfileRow): Date {
    const now = new Date();
    return new Date(now.getTime() + tzOffsetMinutes(row.timeZone, now) * 60000);
  }

  // ───────────────────────── Tab 01 · Today's Horoscope ─────────────────────────

  async daily(userId: string) {
    const row = await this.requireProfile(userId);
    if (!row) return { needsProfile: true as const }; // only for stored birth details
    const local = this.userNow(row);
    const dateKey = local.toISOString().slice(0, 10); // the user's OWN calendar day
    const reading = await this.cachedReading(userId, 'daily', dateKey,
      () => this.buildDailyGuidance(row, userId, local));
    return { needsProfile: false as const, ...reading };
  }

  /**
   * Personal Guidance Engine — build structured, emotionally-intelligent daily
   * guidance from the chart + transits + numerology + Dasha, then let the AI
   * warm the wording WITHOUT changing the facts or turning it into prediction.
   * The deterministic composition is the guaranteed floor if AI is off/ fails.
   */
  private async buildDailyGuidance(row: AstroProfileRow, userId: string, local: Date): Promise<DailyGuidance> {
    const chart = this.chartOf(row);
    const num = computeNumerology(row.birthDate, local);
    const dasha = vimshottariDasha(chart.moon.lon, row.birthDate, local);
    const g = composeGuidance(chart, userId, local, num, dasha);

    const facts =
      `Sun ${chart.sun.sign}, Moon ${chart.moon.sign}, Ascendant ${chart.ascendant?.sign ?? 'unknown'}. ` +
      `Moon phase: ${g.moonPhase}. Running Dasha: ${dasha.maha} (${dasha.antar} sub-period). ` +
      `Numerology — Life Path ${num.lifePath}, Personal Year ${num.personalYear}, Personal Month ${num.personalMonth}, Personal Day ${num.personalDay}.`;
    const draft = g.sections.map((s) => `${s.title}: ${s.body}`).join('\n') + `\nReflection: ${g.reflection}`;

    const fallback = {
      career: g.sections[0].body, relationships: g.sections[1].body, health: g.sections[2].body,
      finance: g.sections[3].body, growth: g.sections[4].body, reflection: g.reflection,
    };
    const ai = await this.ai.json<typeof fallback>(
      'You write PERSONAL daily guidance for one person — warm, emotionally intelligent, supportive, practical and honest. ' +
      'Rewrite each section in a natural, encouraging voice. HARD RULES: never predict specific events or guarantee outcomes; ' +
      'frame everything as reflection, possibility and practical suggestion (use "may", "consider", "a good day to…"); ' +
      'use ONLY the facts provided — never invent planets, transits, dates or events; 2–3 sentences per section, no headers inside the text. ' +
      'Return JSON {"career","relationships","health","finance","growth","reflection"}.',
      `Facts (do not contradict these):\n${facts}\n\nDraft to warm up (keep the meaning + all facts):\n${draft}`,
      fallback,
      1400,
    );
    const use = (v: string | undefined, fb: string) => (v && v.trim().length > 40 ? v.trim() : fb);
    g.sections[0].body = use(ai.career, fallback.career);
    g.sections[1].body = use(ai.relationships, fallback.relationships);
    g.sections[2].body = use(ai.health, fallback.health);
    g.sections[3].body = use(ai.finance, fallback.finance);
    g.sections[4].body = use(ai.growth, fallback.growth);
    g.reflection = use(ai.reflection, fallback.reflection);
    g.text = g.sections.map((s) => s.body).join('\n\n');
    g.words = wordCount(g.text);
    return g;
  }

  /** Saved daily predictions on the profile — the archive, newest first. */
  async dailyHistory(userId: string) {
    const rows = await this.db.astroReading.findMany({
      where: { userId, kind: 'daily', period: { startsWith: `${AstrologyService.READING_VER}:` } },
      orderBy: { period: 'desc' }, take: 30,
    }).catch(() => [] as Array<{ period: string; readingJson: string }>);
    return rows.map((r) => {
      try { return JSON.parse(r.readingJson); } catch { return { date: r.period, text: '' }; }
    }).filter((r) => r.text);
  }

  // ───────────────────────── Tab 02 · Monthly Horoscope ─────────────────────────

  async monthly(userId: string) {
    const row = await this.requireProfile(userId);
    if (!row) return { needsProfile: true as const }; // only for stored birth details
    const local = this.userNow(row);
    const monthKey = local.toISOString().slice(0, 7); // one per user per calendar month
    const reading = await this.cachedReading(userId, 'monthly', monthKey, () => {
      const chart = this.chartOf(row);
      const astro = scanMonth(chart, local.getUTCFullYear(), local.getUTCMonth() + 1);
      return composeMonthly(chart, userId, astro);
    });
    return { needsProfile: false as const, ...reading };
  }

  // ───────────────────────── Tab 03 · Ask the Astrologer ─────────────────────────

  async ask(userId: string, dto: AskDto) {
    const row = await this.requireProfile(userId);
    if (!row) return { needsProfile: true as const };
    const chart = this.chartOf(row);
    const local = this.userNow(row);
    const astro = scanMonth(chart, local.getUTCFullYear(), local.getUTCMonth() + 1);

    // Charge FIRST (throws 400 on insufficient balance — nothing is stored).
    const payment = await this.financial.charge(userId, {
      hub: 'Astrology', category: 'astrology', label: `Ask the Astrologer · ${dto.topic}`,
      amountInr: ASK_PRICE_INR, method: dto.method,
    });

    // Deterministic, chart-based answer is the guaranteed floor; AI (when
    // configured) rewrites it with the same facts for a more natural voice.
    const fallback = composeAnswer(chart, userId, dto.topic, dto.question, new Date(), astro);
    const transitFacts = astro.transits.map((t) => `${t.planet} in ${t.sign}${t.retrograde ? ' (retro)' : ''}`).join('; ');
    const ai = await this.ai.json<{ answer?: string }>(
      'You are a warm, experienced Vedic-Western hybrid astrologer writing a paid consultation reply. ' +
      'Use ONLY the chart facts provided — never invent planetary positions. 350-550 words, flowing prose, ' +
      'specific to the question, ending with one concrete next step. Return {"answer": "..."}.',
      `Question (topic: ${dto.topic}): ${dto.question}\n\n` +
      `Natal: Sun ${chart.sun.sign}, Moon ${chart.moon.sign}, Ascendant ${chart.ascendant?.sign ?? 'unknown'}.\n` +
      `Current transits: ${transitFacts}.\nFavourable dates this month: ${astro.bestDates.join(', ') || 'none'}. ` +
      `Caution dates: ${astro.cautionDates.join(', ') || 'none'}.\n\n` +
      `Reference draft (rewrite, keep all facts):\n${fallback}`,
      { answer: fallback },
      1600,
    );
    const answer = (ai.answer && ai.answer.trim().length > 200) ? ai.answer.trim() : fallback;

    const saved = await this.db.astroQuestion.create({
      data: { userId, topic: dto.topic, question: dto.question, answer, priceInr: ASK_PRICE_INR },
    });
    this.logger.log(`Astrology consultation for ${userId} · ${dto.topic} · ₹${ASK_PRICE_INR}`);
    return {
      needsProfile: false as const,
      id: saved.id, topic: saved.topic, question: saved.question, answer: saved.answer,
      priceInr: saved.priceInr, createdAt: saved.createdAt,
      payment: { method: payment.method, balanceInr: payment.balanceInr },
    };
  }

  /** My Questions — every paid consultation, newest first. */
  async questions(userId: string) {
    const rows = await this.db.astroQuestion.findMany({
      where: { userId }, orderBy: { createdAt: 'desc' }, take: 100,
    }).catch(() => [] as AstroQuestionRow[]);
    return rows.map((r) => ({
      id: r.id, topic: r.topic, question: r.question, answer: r.answer,
      priceInr: r.priceInr, createdAt: r.createdAt,
    }));
  }
}
