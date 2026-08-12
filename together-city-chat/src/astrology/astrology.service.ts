import { swallow } from '../shared/swallow';
import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import { MasterProfileService } from '../profile/master-profile.service';
import { FinancialService, type PayMethod } from '../financial/financial.service';
import { AiService } from '../ai/ai.service';
import {
  NatalChart, geocodeApprox, natalChart, scanMonth, tzOffsetMinutes, SIGNS,
} from './astro-engine';
import { composeAnswerBrief, composeDailyBrief, composeMonthlyBrief, type GuidanceBrief } from './astro-content';
import {
  DAILY_WORDS, MONTHLY_WORDS, letterPrompt, letterProblems, letterRules, titleProblems, toLetter, type Letter,
} from './letter';
import { answerProblems, consultationPrompt, consultationRules } from './consultation';
import { PACK_SIZE, priceForNextQuestion, quotaFor, type QuestionQuota } from './question-quota';
import { computeNumerology, vimshottariDasha } from './personal-factors';
import { GEM_DISCLAIMER, buildGemGuidance, buildRemedies } from './gem-remedy-content';
import { designBrief, recommendGems } from './gems/gem-recommend';
import { PENDANT_STYLES, RING_SETTINGS, RING_SIZES, STONE_SHAPES, adviseSetting } from './gems/ring-studio';
import { METAL_NAME, KNOWN_DESIGNS, metalQuotes, type MetalKey } from './gems/metal-pricing';
import { parseGemCart, priceGemCart, type GemCartLine } from './gems/gem-cart';
import { healthFlagsFor } from './health-flags';
import { firstNameOf } from './voice';

export interface SaveAstroProfileDto {
  birthDate: string;          // YYYY-MM-DD
  birthTime?: string | null;  // HH:MM (local at birth place) · null = time unknown
  birthCountry: string;
  birthState?: string | null;
  birthCity: string;
  timeZone: string;    // IANA, auto-detected client-side
}
export interface AskDto { topic: string; question: string; method?: 'wallet' | 'card' }

/**
 * What a consultation costs is no longer a constant — it depends on how many
 * this citizen has already had. Five free, then ₹100 for the next five. The
 * arithmetic lives in question-quota.ts, alone, so the controller, the service,
 * the screen and the tests cannot hold four opinions about it.
 */

/**
 * A letter with the period it was written for.
 *
 * The date is what makes the archive readable and what the cache is keyed to
 * remember; `month` rides along on monthly letters so a client can say
 * "August 2026" without re-deriving it from a key.
 */
export type DatedLetter = Letter & { date: string; month?: string };

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
/** The month a local date falls in, for the one place that needs it without a brief. */
const monthNameOf = (local: Date) => `${MONTH_NAMES[local.getUTCMonth()]} ${local.getUTCFullYear()}`;

interface AstroProfileRow {
  id: string; userId: string; birthDate: Date; birthTime: string | null;
  birthCountry: string; birthState: string | null; birthCity: string;
  timeZone: string; lat: number | null; lng: number | null; updatedAt: Date;
  /**
   * How many consultations this citizen has ever been given. Optional here for
   * the same reason the db accessor below is loose: a generated client from
   * before the column exists returns undefined for it, and the read has to
   * survive that rather than crash the whole hub mid-deploy.
   */
  questionsAsked?: number | null;
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
        update: (a: unknown) => Promise<unknown>;
      };
      astroQuestion: {
        create: (a: unknown) => Promise<AstroQuestionRow>;
        findMany: (a: unknown) => Promise<AstroQuestionRow[]>;
        deleteMany: (a: unknown) => Promise<{ count: number }>;
      };
      astroReading: {
        findUnique: (a: unknown) => Promise<{ readingJson: string } | null>;
        upsert: (a: unknown) => Promise<{ readingJson: string }>;
        findMany: (a: unknown) => Promise<Array<{ period: string; readingJson: string }>>;
        deleteMany: (a: unknown) => Promise<unknown>;
      };
    };
  }

  /**
   * Reading engine version. Bumped whenever the OUTPUT changes shape or voice,
   * because readings are cached per period — without a bump, everyone who has
   * already opened today's reading keeps being served the old one until
   * tomorrow, and this month's until the 1st.
   *
   * v2: the Vedic (sidereal) switch. v3: guidance sections. v4: the voice — no
   * reading may name a planet, sign, number or period any more. v5: the letter —
   * sections, lucky elements, themes and chips are gone entirely, so a cached v4
   * reading is not merely off-voice, it is the wrong shape.
   *
   * v6: the SHORT titled letter. A daily is now 80–150 words and a monthly
   * 120–180, and both carry a title. A cached v5 letter is four times too long
   * and has no title, so it would print into the new composition as the exact
   * page the redesign exists to remove. The bump is the whole migration: the
   * next person to open Today gets one fresh letter written to the new brief,
   * and the archive keeps the old ones as what they were.
   */
  private static readonly READING_VER = 'v6';

  /**
   * One saved letter per user per period — daily flips at the user's own
   * midnight, monthly is fixed from the 1st.
   *
   * A NULL RESULT IS NEVER CACHED, and that is the whole reason this is not the
   * old cachedReading(). Failure here means the letter could not be written
   * properly; storing that would turn one bad minute into a whole day without a
   * letter, and the next request would not even try.
   */
  /**
   * A FAILED LETTER IS NOT A REASON TO WRITE IT AGAIN THIS SECOND.
   *
   * Nothing negative is stored — that stays true, and it is why `pending` can
   * heal on its own. But nothing remembered it either, so every open of Today
   * and every press of "Check again" started a fresh generation: the day the
   * word cap was fighting the brief, the logs show four full attempts inside
   * ten seconds for one citizen. If the writer is having a bad minute, that
   * arrangement turns it into a bad minute with a bill.
   *
   * So a failure is remembered in memory for a few minutes — long enough that
   * pressing the button costs nothing, short enough that a citizen who waits
   * out a provider incident gets their letter without being told to come back
   * tomorrow. It is deliberately NOT in the database: it is a fact about the
   * last few minutes of this process, not about the citizen.
   */
  private static readonly RETRY_AFTER_MS = 5 * 60_000;
  private readonly failedUntil = new Map<string, number>();
  /** One generation per key at a time, so two tabs are one letter, not two. */
  private readonly writing = new Map<string, Promise<DatedLetter | null>>();

  private async cachedLetter(
    userId: string, kind: 'daily' | 'monthly', periodKey: string,
    compute: () => Promise<DatedLetter | null>,
  ): Promise<DatedLetter | null> {
    const period = `${AstrologyService.READING_VER}:${periodKey}`;
    const hit = await swallow(this.db.astroReading.findUnique({
      where: { userId_kind_period: { userId, kind, period } },
    }), 'astro: letter cache read', { userId, kind });
    if (hit) {
      try {
        const cached = JSON.parse(hit.readingJson) as DatedLetter;
        if (cached?.body) return cached;
      } catch { /* unreadable row — write over it below */ }
    }
    const key = `${userId}:${kind}:${period}`;
    const inFlight = this.writing.get(key);
    if (inFlight) return inFlight;
    const holdUntil = this.failedUntil.get(key);
    if (holdUntil && Date.now() < holdUntil) return null;

    const run = this.write(key, kind, compute);
    this.writing.set(key, run);
    let letter: DatedLetter | null;
    try { letter = await run; } finally { this.writing.delete(key); }
    if (!letter) return null;
    await swallow(this.db.astroReading.upsert({
      where: { userId_kind_period: { userId, kind, period } },
      update: { readingJson: JSON.stringify(letter) },
      create: { userId, kind, period, readingJson: JSON.stringify(letter) },
    }), 'astro: letter cache write', { userId, kind }); // table may not exist mid-deploy — the letter still returns
    return letter;
  }

  /** The generation itself, wrapped so one failure holds the next attempt off. */
  private async write(
    key: string, kind: 'daily' | 'monthly', compute: () => Promise<DatedLetter | null>,
  ): Promise<DatedLetter | null> {
    let letter: DatedLetter | null = null;
    try {
      letter = await compute();
    } finally {
      if (letter) {
        this.failedUntil.delete(key);
      } else {
        this.failedUntil.set(key, Date.now() + AstrologyService.RETRY_AFTER_MS);
        this.logger.warn(`No ${kind} letter this time — not trying again for `
          + `${AstrologyService.RETRY_AFTER_MS / 60_000} minutes for this citizen and period.`);
        // One entry per citizen per period per day; swept so a long-lived
        // process cannot accumulate yesterday's disappointments.
        if (this.failedUntil.size > 500) {
          const now = Date.now();
          for (const [k, until] of this.failedUntil) if (until < now) this.failedUntil.delete(k);
        }
      }
    }
    return letter;
  }

  // ───────────────────────── Profile ─────────────────────────

  /** The shared astrology profile. If absent, birth details already given to
   *  the dating hub are auto-migrated in — entered once, reused everywhere. */
  async getProfile(userId: string) {
    let row = await swallow(this.db.astroProfile.findUnique({ where: { userId } }), 'astro: profile read', { userId });
    let source: 'astrology' | 'dating' | 'master' | null = row ? 'astrology' : null;

    if (!row) {
      // Master Profile first (single source of truth): if it already knows the
      // birth details — from ANY hub — materialise the astro row from it.
      const master = await swallow(this.masterProfile.get(userId), 'astro: master read for prefill', { userId });
      if (master?.dateOfBirth && master.birthCity && master.birthCountry) {
        const timeZone = master.timeZone || 'Asia/Kolkata';
        const { lat, lng } = geocodeApprox(master.birthCity, master.birthState ?? null, master.birthCountry, timeZone);
        row = await swallow(this.db.astroProfile.upsert({
          where: { userId }, update: {},
          create: {
            userId, birthDate: new Date(master.dateOfBirth), birthTime: master.timeOfBirth ?? null,
            birthCountry: master.birthCountry, birthState: master.birthState ?? null,
            birthCity: master.birthCity, timeZone, lat, lng,
          },
        }), 'astro: materialise profile from master', { userId });
        if (row) return { complete: true, profile: this.shape(row), prefill: null, source: 'master' as const };
      }
      const dating = await swallow(this.prisma.datingProfile.findUnique({ where: { userId } }), 'astro: dating read for prefill', { userId });
      if (dating?.birthDate) {
        const place = (dating.birthPlace ?? '').split(',').map((s) => s.trim()).filter(Boolean);
        const birthCity = place[0] ?? '';
        const birthCountry = place[place.length - 1] && place.length > 1 ? place[place.length - 1] : 'India';
        if (birthCity) {
          // Complete elsewhere → persist silently so every feature shares it.
          const timeZone = 'Asia/Kolkata';
          const { lat, lng } = geocodeApprox(birthCity, place[1] ?? null, birthCountry, timeZone);
          row = await swallow(this.db.astroProfile.upsert({
            where: { userId },
            update: {},
            create: {
              userId, birthDate: dating.birthDate, birthTime: dating.birthTime ?? null,
              birthCountry, birthState: place.length > 2 ? place[1] : null, birthCity,
              timeZone, lat, lng,
            },
          }), 'astro: materialise profile from dating', { userId });
          source = row ? 'dating' : null;
        } else {
          // Partial → prefill the form, never ask for what we already know.
          return {
            complete: false,
            profile: null,
            prefill: {
              birthDate: dating.birthDate.toISOString().slice(0, 10), // date-only column
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
    /**
     * Birth details changed → the letters for the period the citizen is IN were
     * written from the wrong chart and have to go, so daily/monthly regenerate
     * on the next fetch. If this fails they keep seeing a letter for the old
     * chart, which is the thing saving was supposed to fix.
     *
     * ONLY THOSE. This was `deleteMany({ where: { userId } })` — every row the
     * citizen had — and `dailyHistory()`/`monthlyHistory()` read the archive out
     * of that same table. Correcting a typo in a birth city therefore burned
     * thirty days of letters and two years of monthlies, silently, on a request
     * that reported success. letter-archive.spec's sentence is the rule and it
     * still holds: A LETTER THAT WAS SENT WAS SENT. The chart it was written
     * from has changed. That it was sent has not.
     *
     * Two clauses, because they are two different questions:
     *   · the letters FOR now — today's and this month's, under whatever
     *     version wrote them. A READING_VER bump mid-day can leave a v5 and a
     *     v6 row for one date and both are stale for the same reason, so the
     *     match is on the period key rather than on the whole cache key.
     *   · anything written SINCE the citizen's last midnight — the same set,
     *     except when the time zone is what just changed and today's letter is
     *     filed under a date that is no longer today. Nothing older can be
     *     caught by it: a letter's row is written on the day it is for.
     */
    const now = new Date();
    const offsetMs = tzOffsetMinutes(data.timeZone, now) * 60000;
    const local = new Date(now.getTime() + offsetMs);
    const keys = AstrologyService.periodKeysAt(local);
    const midnight = new Date(
      Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - offsetMs,
    );
    await swallow(this.db.astroReading.deleteMany({
      where: {
        userId,
        OR: [
          { kind: 'daily', period: { endsWith: keys.daily } },
          { kind: 'monthly', period: { endsWith: keys.monthly } },
          { createdAt: { gte: midnight } },
        ],
      },
    }), 'astro: purge the letters for right now', { userId });
    // Master Profile sync — birth details are shared fields used app-wide.
    await swallow(this.masterProfile.syncShared(userId, {
      dateOfBirth: birthDate, timeOfBirth: data.birthTime,
      birthCountry: data.birthCountry, birthState: data.birthState, birthCity: data.birthCity,
      timeZone: data.timeZone,
    }, 'astrology'), 'astro: master-profile sync', { userId });
    return { saved: true, profile: this.shape(row) };
  }

  private shape(row: AstroProfileRow) {
    const chart = this.chartOf(row);
    return {
      birthDate: row.birthDate.toISOString().slice(0, 10), // date-only column
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
    return swallow(this.db.astroProfile.findUnique({ where: { userId } }), 'astro: profile read', { userId }).then((r) => r ?? null);
  }

  /**
   * The two clocks a day has, handed out together so they cannot be confused.
   *
   * `local` is the citizen's WALL CLOCK — a real instant shifted by their
   * offset, so its calendar fields read as their date. It is the right answer
   * to "which day is it for them", and it is what names the letter, seeds it,
   * picks the numerology day and turns the remedy over on their Monday.
   *
   * `at` is the actual instant, which is the only thing the sky can be read at.
   *
   * THEY USED TO BE ONE VALUE, and the shifted one was passed to the ephemeris:
   * `userNow()` returned now + 5h30m for an Indian citizen and the composer
   * computed the day's transits from it. The Moon moves about three degrees in
   * five and a half hours, so a Moon near a boundary was reported in the next
   * sign, or the phase named as the next phase, on a letter dated correctly.
   * Meanwhile `ask()` used the true instant, so two surfaces of the same hub
   * disagreed about where the Moon was.
   *
   * The method returns both and is the only place the shift happens, so
   * choosing wrongly now takes typing the wrong field name rather than
   * reaching for the only value there was.
   */
  private momentFor(row: AstroProfileRow): { at: Date; local: Date } {
    const at = new Date();
    return { at, local: new Date(at.getTime() + tzOffsetMinutes(row.timeZone, at) * 60000) };
  }

  /**
   * The period keys the letters for a moment are filed under: the citizen's own
   * calendar day, and their own calendar month.
   *
   * ONE PLACE, because three call sites have to agree about them and one of
   * those deletes rows. `daily()` and `monthly()` build the cache key with it;
   * `saveProfile()` builds a purge that must hit exactly those rows and nothing
   * else. Two spellings of one key is how an archive gets thrown away.
   */
  private static periodKeysAt(local: Date) {
    return {
      daily: local.toISOString().slice(0, 10),   // the user's OWN calendar day
      monthly: local.toISOString().slice(0, 7),  // one per user per calendar month
    };
  }

  /** The name to address someone by, or '' if we don't have a usable one. */
  private async firstName(userId: string): Promise<string> {
    const u = await swallow(this.prisma.user
      .findUnique({ where: { id: userId }, select: { name: true } }), 'astro: name read', { userId });
    return firstNameOf(u?.name);
  }

  // ───────────────────────── Tab 01 · Today's letter ─────────────────────────

  /**
   * Today's letter, or an honest admission that it is not ready.
   *
   * `pending` is not an error and is not an empty state. It means the letter for
   * this person and this day has not been successfully written — the model is
   * unavailable, or what came back broke one of the rules in letter.ts — and
   * NOTHING IS CACHED when that happens, so the next request tries again.
   *
   * The alternative was a deterministic letter assembled from a fixed skeleton,
   * which is what the old five-section daily fell back to. That was right for
   * labelled panels and is wrong here. A letter is a claim about how it was
   * made: one continuous piece of writing, for you, this morning. A template
   * wearing that claim is the same species of comfortable untruth as an empty
   * state that says you have nothing when nobody asked — and it would be
   * invisible for exactly as long as somebody kept only one day's letter.
   */
  async daily(userId: string) {
    const row = await this.requireProfile(userId);
    if (!row) return { needsProfile: true as const }; // only for stored birth details
    const { at, local } = this.momentFor(row);
    const date = AstrologyService.periodKeysAt(local).daily;
    const letter = await this.cachedLetter(userId, 'daily', date, () => this.writeDailyLetter(row, userId, { at, local }));
    if (!letter) return { needsProfile: false as const, pending: true as const, date };
    return { needsProfile: false as const, pending: false as const, ...letter };
  }

  private async writeDailyLetter(
    row: AstroProfileRow, userId: string, when: { at: Date; local: Date },
  ): Promise<DatedLetter | null> {
    const chart = this.chartOf(row);
    const date = AstrologyService.periodKeysAt(when.local).daily;
    // Calendar things off the wall clock, sky things off the instant.
    const num = computeNumerology(row.birthDate, when.local);
    const dasha = vimshottariDasha(chart.moon.lon, row.birthDate, when.at);
    const brief = composeDailyBrief(chart, userId, { date, at: when.at }, num, dasha);
    const previous = (await this.recentLetters(userId, 'daily', 3)).map((l) => l.body);
    const letter = await this.writeLetter('daily', brief, await this.firstName(userId), previous, 700);
    return letter ? { date, ...letter } : null;
  }

  /** Past letters, newest first — the same letters, on the days they were for. */
  async dailyHistory(userId: string) {
    return this.recentLetters(userId, 'daily', 30);
  }

  /**
   * The letters this person has most recently been sent.
   *
   * Used for two things that look unrelated and are not: rendering the archive,
   * and stopping the next letter from repeating the last one. The second is why
   * this reads the bodies rather than a summary — letterProblems() compares
   * five-word runs, and it can only do that against the real text.
   *
   * IT DOES NOT FILTER BY READING_VER, AND THAT IS THE POINT OF THIS METHOD.
   *
   * It used to: `period: { startsWith: 'v6:' }`. The version prefix is a CACHE
   * key — it exists so a change to the brief does not leave everybody reading
   * yesterday's cached letter until their own midnight. Reading HISTORY through
   * it made every letter written before the last bump vanish, and the effect is
   * total rather than partial: v5 became v6 one evening, and the next morning
   * the archive was empty on an account with a month of letters behind it. That
   * is the one thing an archive must not do.
   *
   * A letter that was sent was sent. It is theirs, in the words it was written
   * in, whatever brief was current that day — which is also why `title` is
   * optional the whole way out to the api type: letters older than titles list
   * as their date and read perfectly well.
   *
   * ORDERED BY createdAt, NOT BY period. Once versions mix, `period` sorts
   * `v6:2026-02-01` above `v5:2026-08-01` — every current-version letter in one
   * block and the older ones underneath, which is not a chronology. The row is
   * written on the day the letter is for, so createdAt IS that day, and it has
   * an index. The final sort is on the letter's own `date`, which is the value
   * the archive prints, so what is shown and what it is ordered by cannot drift
   * apart.
   *
   * AND ONE ROW PER DATE. A bump in the middle of a day leaves `v5:2026-08-10`
   * and `v6:2026-08-10` both on disk, and both are real — one was sent, then
   * the other was. The newest wins, because it is the one that was on screen.
   * The over-fetch is what makes room for the pairs that collapse.
   */
  private async recentLetters(userId: string, kind: 'daily' | 'monthly', take: number): Promise<DatedLetter[]> {
    const rows = (await swallow(this.db.astroReading.findMany({
      where: { userId, kind },
      orderBy: { createdAt: 'desc' }, take: take * 2,
    }), `astro: ${kind} history read`, { userId })) ?? ([] as Array<{ readingJson: string }>);
    const out: DatedLetter[] = [];
    const seen = new Set<string>();
    for (const r of rows) {
      try {
        const parsed = JSON.parse(r.readingJson) as DatedLetter;
        // A row from before letters existed parses fine and has no body. There
        // is nothing in it to show and nothing to keep the writer from
        // repeating, so it is not a letter for either of this method's jobs.
        if (!parsed?.body || !parsed?.date || seen.has(parsed.date)) continue;
        seen.add(parsed.date);
        out.push(parsed);
      } catch { /* a row that will not parse is a row we cannot show */ }
    }
    return out.sort((a, b) => b.date.localeCompare(a.date)).slice(0, take);
  }

  /**
   * Write one letter, or return null having said why in the log.
   *
   * Two attempts, and the second is told exactly what was wrong with the first.
   * That is worth the extra call: the failures in practice are a heading
   * creeping in or a word from the banned list, both of which a writer fixes
   * immediately once named, and the cost of giving up is that somebody opens
   * their letter and there isn't one.
   *
   * There is no third attempt and no relaxing of the rules on the way down. A
   * letter that still names the machinery on the second try is not a letter
   * that should be sent slightly more leniently.
   */
  private async writeLetter(
    kind: 'daily' | 'monthly', brief: GuidanceBrief, firstName: string, previous: string[], maxTokens: number,
  ): Promise<Letter | null> {
    if (!this.ai.enabled) {
      this.logger.warn(`No ${kind} letter written — the writer is not configured, and this hub has no template to fall back on.`);
      return null;
    }
    const range = kind === 'daily' ? DAILY_WORDS : MONTHLY_WORDS;
    /**
     * How many observations are the letter's subject, the rest being optional
     * material (see letterPrompt). Fewer on each retry: if the last draft could
     * not fit, the answer is less to say, not the same amount said faster.
     */
    const leadFor = (attempt: number) => Math.max(1, (kind === 'daily' ? 3 : 6) - (attempt - 1));
    let feedback = '';
    for (let attempt = 1; attempt <= 3; attempt++) {
      // Title and letter in ONE pass, not two. A title written by a second call
      // is a title written about a letter rather than out of it, and the two
      // drift: the reader gets a heading that is nearly what the letter says.
      const out = await this.ai.json<{ title?: string; letter?: string }>(
        letterRules(kind, firstName),
        letterPrompt(brief.observations, firstName, previous, brief.note + feedback, leadFor(attempt)) +
          '\n\nReturn JSON: {"title": "the title, 3-7 words", ' +
          '"letter": "the complete letter, opening line included"}.',
        {},
        maxTokens,
      );
      const candidate = (out.letter ?? '').trim();
      const title = (out.title ?? '').trim();
      const problems = [...letterProblems(candidate, kind, firstName, previous), ...titleProblems(title)];
      if (!problems.length) return toLetter(candidate, firstName, title);
      const said = problems.map((p) => `${p.what} — ${p.why}`).join('; ');
      this.logger.warn(`${kind} letter rejected (attempt ${attempt}): ${said}`);
      /**
       * THE RETRY USED TO MAKE IT WORSE. The feedback was "fix every one of
       * those and keep everything else" — which, when the fault is length, is
       * two instructions that cancel: attempt 2 came back at 187 words after
       * attempt 1 was refused at 155.
       *
       * A draft that is ONLY too long is a good letter with too much in it, so
       * it is handed back to be cut rather than rewritten — the writing was
       * fine and rewriting risks losing it. Anything else (a banned word, a
       * heading, phrasing reused from an earlier letter) needs a different
       * letter, not a shorter one, and handing the draft back would carry the
       * fault into the next attempt.
       */
      const onlyLength = problems.every((p) => /^(longer|shorter) than/.test(p.why));
      feedback = onlyLength && candidate
        ? `\n\nYour previous draft is below. It was rejected for: ${said}. The limit is `
          + `${range.min}–${range.max} words, and it is not negotiable. Return the SAME letter cut to `
          + 'fit by deleting whole sentences — the ones carrying the optional material above go '
          + 'first. Do not rewrite it, do not compress sentences into denser ones, do not summarise. '
          + `Count the words before answering.\n\n--- your draft ---\n${candidate}`
        : `\n\nA previous attempt was rejected for: ${said}. Write a different letter that does not `
          + 'repeat those faults. You do not have to mention everything above — the length rule and '
          + 'the language rules outrank the material.';
    }
    return null;
  }

  // ───────────────────────── Gems & practices ─────────────────────────

  /**
   * Gemstones for the current period.
   *
   * Structured data — stone, metal, finger, day, and the lord it is linked to —
   * beside prose that never explains where it came from, per the zone's voice
   * rule. Needs the birth details, because the period is what chooses the stone.
   */
  async gems(userId: string) {
    const row = await this.requireProfile(userId);
    if (!row) return { needsProfile: true as const };
    const { at } = this.momentFor(row);
    const chart = this.chartOf(row);
    const dasha = vimshottariDasha(chart.moon.lon, row.birthDate, at);
    return { needsProfile: false as const, ...buildGemGuidance({ maha: dasha.maha, antar: dasha.antar }) };
  }

  /**
   * The gem marketplace's opening question: which stones does this chart call
   * for?
   *
   * ONE ENGINE ANSWERS "WHICH STONE", AND IT IS THIS ONE. `gems()` above still
   * exists and still serves the remedies page, but that page no longer shows
   * stones — it kept the practices and handed the stones to the marketplace.
   * Two surfaces prescribing from two different readings was the arrangement
   * before this, and it worked only because one of them had no way in.
   *
   * Everything fed in is already computed elsewhere: the ascendant and moon
   * rashi by the chart engine, the running period by Vimshottari, the life path
   * by numerology. Nothing new is asked of the citizen — the birth details they
   * entered once are the whole input.
   */
  async gemstones(userId: string) {
    const row = await this.requireProfile(userId);
    if (!row) return { needsProfile: true as const };
    const { at, local } = this.momentFor(row);
    const chart = this.chartOf(row);
    const dasha = vimshottariDasha(chart.moon.lon, row.birthDate, at);
    const num = computeNumerology(row.birthDate, local);
    // The carat figure is worked out from body weight, which the citizen has
    // already given the Master Profile. Swallowed rather than awaited hard: a
    // profile read that fails costs the weight figure and nothing else, and the
    // recommender treats a missing weight as "not told" rather than as an error.
    const master = await swallow(this.masterProfile.get(userId), 'astro: master read for gem weight', { userId });
    const bodyKg = typeof master?.weightKg === 'number' ? master.weightKg : null;
    return {
      needsProfile: false as const,
      ...recommendGems({
        bodyKg,
        // Null without a birth time, and the recommender treats that as a
        // different answer rather than a degraded one.
        ascendant: chart.ascendant?.sign ?? null,
        moonSign: chart.moon.sign,
        mahadasha: dasha.maha,
        antardasha: dasha.antar,
        lifePath: num.lifePath,
      }),
      disclaimer: GEM_DISCLAIMER,
    };
  }

  /**
   * The design studio for one stone: what it costs at the weight this person is
   * prescribed, and every shape, setting and size they can choose between —
   * with the settings judged against THIS stone's planet.
   *
   * The judgements travel with the options rather than being re-derived on the
   * page: whether a tension mount will crack this particular stone is not a
   * presentation detail.
   */
  async gemDesign(userId: string, gemId: string) {
    const row = await this.requireProfile(userId);
    if (!row) return { needsProfile: true as const };
    const master = await swallow(this.masterProfile.get(userId), 'astro: master read for gem design', { userId });
    const brief = designBrief(gemId, typeof master?.weightKg === 'number' ? master.weightKg : null);
    if (!brief) throw new NotFoundException('That stone is not in the catalogue.');
    return {
      needsProfile: false as const,
      ...brief,
      shapes: STONE_SHAPES,
      settings: RING_SETTINGS.map((s) => ({ ...s, ...adviseSetting(s.key, brief.gem.planet) })),
      pendantStyles: PENDANT_STYLES,
      sizes: RING_SIZES,
      metals: METAL_NAME,
      disclaimer: GEM_DISCLAIMER,
    };
  }


  /**
   * What the metal costs for one design, at one size.
   *
   * ITS OWN ENDPOINT BECAUSE IT DEPENDS ON THE CHOICES. A cluster in size 22
   * carries nearly twice the gold of a solitaire in size 8, so there is no one
   * number the design payload could have carried — the first version tried to
   * hand the page a FUNCTION, which does not survive JSON and would have
   * arrived as nothing at all.
   *
   * And it stays on the server for the reason every price in this app does: the
   * rate, the weight model and the making charge live in one file, and a copy
   * of them in the browser is a second answer waiting to disagree.
   */
  async gemMetals(userId: string, gemId: string, worn: 'ring' | 'pendant', design: string, size: number) {
    const row = await this.requireProfile(userId);
    if (!row) return { needsProfile: true as const };
    const master = await swallow(this.masterProfile.get(userId), 'astro: master read for metal quote', { userId });
    const brief = designBrief(gemId, typeof master?.weightKg === 'number' ? master.weightKg : null);
    if (!brief) throw new NotFoundException('That stone is not in the catalogue.');
    if (!KNOWN_DESIGNS.has(design)) throw new BadRequestException('That is not a design we make.');
    return {
      needsProfile: false as const,
      metals: metalQuotes(worn, design, size, brief.weight?.carats ?? 0, brief.gem.planet),
    };
  }


  // ───────────────────────── the gem cart ─────────────────────────
  //
  // READ AND WRITTEN WITH RAW SQL, AND THAT IS A DATED EXCEPTION. `gemCartJson`
  // is a new column on AstroProfile; the generated Prisma client in this
  // workspace predates it, and the sandbox this was built in cannot reach
  // Prisma's engine CDN to regenerate. Raw SQL needs no generated types, so the
  // two statements below compile and are covered by tests today rather than
  // waiting for an environment.
  //
  // AFTER THE NEXT `prisma generate` (which the deploy runs anyway, before the
  // build), replace these with `this.db.astroProfile.findUnique/update` on the
  // typed field. Nothing else has to change: everything above and below this
  // pair already speaks in `GemCartLine[]`.

  private async readGemCart(userId: string): Promise<GemCartLine[]> {
    const rows = await swallow(
      this.prisma.$queryRaw<{ gemCartJson: string | null }[]>`
        SELECT "gemCartJson" FROM "AstroProfile" WHERE "userId" = ${userId} LIMIT 1`,
      'astro: gem cart read', { userId },
    );
    return parseGemCart(rows?.[0]?.gemCartJson ?? null);
  }

  private async writeGemCart(userId: string, lines: GemCartLine[]): Promise<void> {
    await swallow(
      this.prisma.$executeRaw`
        UPDATE "AstroProfile" SET "gemCartJson" = ${JSON.stringify(lines)} WHERE "userId" = ${userId}`,
      'astro: gem cart write', { userId },
    );
  }

  /** Everything locked, priced now — never at the price it was locked at. */
  async gemCart(userId: string) {
    const row = await this.requireProfile(userId);
    if (!row) return { needsProfile: true as const };
    const master = await swallow(this.masterProfile.get(userId), 'astro: master read for cart', { userId });
    const bodyKg = typeof master?.weightKg === 'number' ? master.weightKg : null;
    return { needsProfile: false as const, ...priceGemCart(await this.readGemCart(userId), bodyKg), bodyKnown: bodyKg !== null };
  }

  /** Lock one configuration. The studio is the only thing that makes them. */
  async lockGem(userId: string, line: GemCartLine) {
    const row = await this.requireProfile(userId);
    if (!row) throw new BadRequestException('Add your birth details before locking a stone.');
    const cart = await this.readGemCart(userId);
    // ONE LINE PER STONE. Somebody who designs a ruby ring, goes back and
    // designs it again has changed their mind, not ordered two — and two rubies
    // for one Sun is not a thing the tradition would recognise either.
    const next = [...cart.filter((l) => l.gemId !== line.gemId), { ...line, addedAt: new Date().toISOString() }];
    await this.writeGemCart(userId, parseGemCart(next));
    return this.gemCart(userId);
  }

  async unlockGem(userId: string, gemId: string) {
    const cart = await this.readGemCart(userId);
    await this.writeGemCart(userId, cart.filter((l) => l.gemId !== gemId));
    return this.gemCart(userId);
  }

  /**
   * Pay for everything locked, in one charge.
   *
   * THE TOTAL IS RECOMPUTED HERE and the request carries no amount, for the
   * same reason the studio's did not: gold moves daily and this is the dearest
   * thing the city sells.
   */
  async checkoutGemCart(userId: string, method: PayMethod) {
    const row = await this.requireProfile(userId);
    if (!row) throw new BadRequestException('Add your birth details first.');
    const master = await swallow(this.masterProfile.get(userId), 'astro: master read for checkout', { userId });
    const bodyKg = typeof master?.weightKg === 'number' ? master.weightKg : null;
    const cart = priceGemCart(await this.readGemCart(userId), bodyKg);
    if (cart.count === 0) throw new BadRequestException('There is nothing locked to pay for.');

    const label = cart.lines.length === 1
      ? `Gemstone · ${cart.lines[0].spec}`
      : `Gemstones (${cart.lines.length}) · ${cart.lines.map((l) => l.spec).join(' | ')}`;
    await this.financial.paid<void>(
      userId,
      { hub: 'Astrology', category: 'astrology', label, amountInr: cart.totalInr, method },
      async () => undefined,
    );
    // Paid for is out of the cart — the other thing that may empty it is the
    // citizen, and nothing else.
    await this.writeGemCart(userId, []);
    return { paid: true as const, totalInr: cart.totalInr, lines: cart.lines.length, spec: label };
  }

  /**
   * Practices for the current period, filtered by what the citizen has told us
   * about their health.
   *
   * `withheld` is returned rather than the list silently being shorter, so the
   * surface can say that something was held back and why.
   */
  async remedies(userId: string) {
    const row = await this.requireProfile(userId);
    if (!row) return { needsProfile: true as const };
    const { at, local } = this.momentFor(row);
    const chart = this.chartOf(row);
    const dasha = vimshottariDasha(chart.moon.lon, row.birthDate, at);
    const flags = await healthFlagsFor(this.prisma, userId);
    // `local` rather than `new Date()` — the practice turns over on Monday
    // where the citizen is, not on Monday in UTC.
    return { needsProfile: false as const, ...buildRemedies({ maha: dasha.maha, antar: dasha.antar }, flags, local) };
  }

  /**
   * The month ahead as one letter.
   *
   * Longer than the daily and written once per calendar month, but the same
   * object rather than a bigger one: not twelve readings stacked into sections
   * with best-and-caution chips on top, but one person thinking about the weeks
   * ahead for somebody they know. The specific days still appear — they are the
   * most useful thing in it — as days of the month, in prose.
   *
   * `pending` behaves exactly as it does for the daily, and for the same reason.
   */
  async monthly(userId: string) {
    const row = await this.requireProfile(userId);
    if (!row) return { needsProfile: true as const }; // only for stored birth details
    const { at, local } = this.momentFor(row);
    const monthKey = AstrologyService.periodKeysAt(local).monthly;
    const letter = await this.cachedLetter(userId, 'monthly', monthKey, () => this.writeMonthlyLetter(row, userId, { at, local }));
    if (!letter) return { needsProfile: false as const, pending: true as const, date: monthKey, month: monthNameOf(local) };
    return { needsProfile: false as const, pending: false as const, ...letter };
  }

  /**
   * Every month before this one, newest first.
   *
   * TWENTY-FOUR RATHER THAN THE DAILY'S THIRTY, and the two numbers mean the
   * same thing: about as much as a person would think of as "the letters I
   * have been sent". Thirty days is a month of dailies; twenty-four months is
   * two years of monthlies, and a monthly letter is the kind somebody goes
   * back to a year later.
   *
   * The rows carry `month` — "August 2026", written out at the time the letter
   * was — so the archive prints the month the letter was FOR rather than
   * re-deriving one from a key in whatever timezone the browser is in.
   */
  async monthlyHistory(userId: string) {
    return this.recentLetters(userId, 'monthly', 24);
  }

  private async writeMonthlyLetter(
    row: AstroProfileRow, userId: string, when: { at: Date; local: Date },
  ): Promise<DatedLetter | null> {
    const chart = this.chartOf(row);
    // The month is a calendar fact, and scanMonth reads the sky for itself at
    // noon of each of its days — so the wall clock is the right input here and
    // the instant never enters. The running period is elapsed time, so it is
    // measured from the instant.
    const astro = scanMonth(chart, when.local.getUTCFullYear(), when.local.getUTCMonth() + 1);
    const num = computeNumerology(row.birthDate, when.local);
    const dasha = vimshottariDasha(chart.moon.lon, row.birthDate, when.at);
    const brief = composeMonthlyBrief(chart, userId, astro, num, dasha);
    const previous = (await this.recentLetters(userId, 'monthly', 2)).map((l) => l.body);
    const letter = await this.writeLetter('monthly', brief, await this.firstName(userId), previous, 800);
    return letter
      ? { date: AstrologyService.periodKeysAt(when.local).monthly, month: brief.month, ...letter }
      : null;
  }

  // ───────────────────────── Tab 03 · Ask the Astrologer ─────────────────────────

  /**
   * How many consultations this citizen has been given, ever.
   *
   * THE ONE PLACE THE ALLOWANCE IS READ, and it reads a counter rather than
   * counting rows. Consultations are deletable; a quota derived from deletable
   * rows can be reset by deleting them, and would be free for ever to anybody
   * who worked that out. `questionsAsked` only ever goes up.
   *
   * `?? 0` is not defensive noise: a generated client from before the column
   * exists returns undefined here, and free is the right way to be wrong about
   * that — it costs us one consultation, where guessing high bills somebody
   * ₹100 for a deployment detail.
   */
  private async questionsAsked(userId: string): Promise<number> {
    const row = await swallow(this.db.astroProfile.findUnique({ where: { userId } }), 'astro: quota read', { userId });
    return row?.questionsAsked ?? 0;
  }

  /** What the next consultation will cost, and how many are already covered. */
  async askQuota(userId: string): Promise<QuestionQuota> {
    return quotaFor(await this.questionsAsked(userId));
  }

  async ask(userId: string, dto: AskDto) {
    const row = await this.requireProfile(userId);
    if (!row) return { needsProfile: true as const };
    const chart = this.chartOf(row);
    const { local } = this.momentFor(row);
    const astro = scanMonth(chart, local.getUTCFullYear(), local.getUTCMonth() + 1);

    // What this one costs — 0 inside the free five or inside a bought pack,
    // ₹100 on the question that opens the next pack.
    const asked = row.questionsAsked ?? 0;
    const price = priceForNextQuestion(asked);

    // Pre-flight only, and only when there is something to pay: confirm the
    // wallet can cover this BEFORE spending an AI call on it, so someone short
    // of balance is told immediately rather than after a 1,600-token
    // generation. The real charge happens below, once there is an answer.
    if (price > 0) await this.financial.assertCanPay(userId, price, dto.method);

    const firstName = await this.firstName(userId);
    const brief = composeAnswerBrief(chart, userId, dto.topic, dto.question, new Date(), astro);

    // Continuity. The principles ask that a reply draw on everything already
    // known about this person, and what they have asked before is the most
    // directly relevant of that — somebody returning to the same worry a third
    // time should not be answered as a stranger.
    const priorRows = (await swallow(this.db.astroQuestion
      .findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 5 }), 'astro: prior questions read', { userId })) ?? ([] as AstroQuestionRow[]);
    const history = priorRows.map((q) => `(${q.topic}) ${q.question}`);
    // And their last three ANSWERS, which is a different job: the questions are
    // context, the answers are what this one must not sound like.
    const previous = priorRows.slice(0, 3).map((q) => q.answer).filter(Boolean);

    const answer = await this.writeAnswer(dto.topic, dto.question, brief, firstName, history, previous);
    if (!answer) return { needsProfile: false as const, pending: true as const };

    // Charge and save together, AFTER the answer exists. The AI call could not
    // go inside a transaction — it holds a connection open across the network —
    // and charging before it meant a failure anywhere in generation left the
    // citizen billed for a consultation they never received. Ordered this way
    // the worst case is that we absorb the cost of a generation nobody paid
    // for, which is ours to lose rather than theirs.
    //
    // THE COUNTER MOVES ONLY WHEN A ROW IS SAVED, for the same reason. A
    // consultation that could not be written must not spend one of the five.
    /**
     * A FREE CONSULTATION DOES NOT TOUCH THE WALLET AT ALL.
     *
     * Not `paid(..., amountInr: 0)`: assertCanPay would still demand a linked
     * card from anyone whose method is `card`, and charge() would write a ₹0
     * line into the Financial hub for every consultation. A statement full of
     * zero-rupee entries is a worse record than no entry.
     *
     * `payment` is omitted rather than reported as a zero charge, because there
     * was no payment. The field is optional on the response for exactly this.
     */
    if (price === 0) {
      const free = await this.db.astroQuestion.create({
        data: { userId, topic: dto.topic, question: dto.question, answer, priceInr: 0 },
      });
      // Unconditional, because nothing is at stake in losing a race here: two
      // consultations submitted in the same instant would cost the citizen one
      // extra free question, and that is the direction to be wrong in. The paid
      // path below claims conditionally, because there the same race is money.
      await swallow(this.db.astroProfile.update({
        where: { userId }, data: { questionsAsked: { increment: 1 } },
      }), 'astro: free consultation counted', { userId });
      this.logger.log(`Astrology consultation for ${userId} · ${dto.topic} · free (${asked + 1} given)`);
      return {
        needsProfile: false as const,
        id: free.id, topic: free.topic, question: free.question, answer: free.answer,
        priceInr: free.priceInr, createdAt: free.createdAt,
      };
    }

    const { saved, payment } = await this.financial.paid(
      userId,
      {
        hub: 'Astrology', category: 'astrology',
        label: `Ask the Astrologer · ${dto.topic} · ${PACK_SIZE} consultations`,
        amountInr: price, method: dto.method,
      },
      async (tx) => {
        /**
         * CLAIM THE PACK BEFORE SAVING THE ANSWER, AND ONLY IF NOBODY ELSE HAS.
         *
         * `where: { questionsAsked: asked }` is the whole guard. The price was
         * decided from `asked` a couple of network round-trips ago; if a second
         * submission has moved the counter since, this one is no longer the
         * question that opens a pack and must not be charged for opening one.
         * Throwing here rolls the transaction back — including the charge that
         * `paid()` has already written — which is why the claim is in here
         * rather than after.
         *
         * Cast because the generated client may predate the column, exactly as
         * for `this.db` above.
         */
        const claim = await (tx as unknown as {
          astroProfile: { updateMany: (a: unknown) => Promise<{ count: number }> };
        }).astroProfile.updateMany({
          where: { userId, questionsAsked: asked },
          data: { questionsAsked: { increment: 1 } },
        });
        if (!claim?.count) {
          throw new ConflictException('Another consultation was saved a moment ago. Nothing has been charged — please ask again.');
        }
        const row = await tx.astroQuestion.create({
          data: { userId, topic: dto.topic, question: dto.question, answer, priceInr: price },
        });
        const wallet = await tx.cityWallet.findUnique({ where: { userId }, select: { balanceInr: true } });
        return { saved: row, payment: { method: dto.method === 'card' ? 'card' : 'wallet', balanceInr: wallet?.balanceInr ?? 0 } };
      },
    );
    this.logger.log(`Astrology consultation for ${userId} · ${dto.topic} · ₹${price} for ${PACK_SIZE}`);
    return {
      needsProfile: false as const,
      id: saved.id, topic: saved.topic, question: saved.question, answer: saved.answer,
      priceInr: saved.priceInr, createdAt: saved.createdAt,
      payment: { method: payment.method, balanceInr: payment.balanceInr },
    };
  }

  /**
   * Write one answer, or return null having said why in the log.
   *
   * Two attempts, and the second is told exactly what was wrong with the first
   * — the same shape as the letter, for the same reason. The failures in
   * practice are a worn phrase creeping back or an answer that reads like the
   * last one, and both are fixed immediately once named.
   *
   * THERE IS NO TEMPLATE TO FALL BACK ON, AND THAT IS THE POINT OF THE WHOLE
   * CHANGE. A deterministic five-paragraph draft is exactly what produced two
   * identical replies to two unrelated questions. Returning nothing is honest;
   * returning the template is the bug wearing a hat.
   */
  private async writeAnswer(
    topic: string, question: string, brief: GuidanceBrief, firstName: string,
    history: string[], previous: string[],
  ): Promise<string | null> {
    if (!this.ai.enabled) {
      this.logger.warn('No consultation written — the writer is not configured, and this hub has no template to fall back on.');
      return null;
    }
    // A stable seed per question, so re-asking the same thing reads the same
    // way rather than rolling a new voice each time somebody reloads.
    const seed = [...`${topic}:${question}`].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
    let feedback = '';
    for (let attempt = 1; attempt <= 2; attempt++) {
      const out = await this.ai.json<{ answer?: string }>(
        consultationRules(topic, seed, firstName),
        consultationPrompt(topic, question, brief.observations, history, previous)
          + `\n\n${brief.note}${feedback}`
          + '\n\nReturn JSON: {"answer": "the complete reply"}.',
        {},
        1800,
      );
      const candidate = (out.answer ?? '').trim();
      const problems = answerProblems(candidate, previous);
      if (!problems.length) return candidate;
      const said = problems.map((p) => `${p.what} — ${p.why}`).join('; ');
      this.logger.warn(`consultation rejected (attempt ${attempt}) · ${topic}: ${said}`);
      feedback = `\n\nA previous attempt was rejected for: ${said}. Fix every one and keep everything else.`;
    }
    return null;
  }

  /**
   * Delete one consultation, for good.
   *
   * A HARD DELETE, and deliberately. The Settings page tells every citizen
   * "your data is yours — download or delete it any time", and this hub already
   * carries the counter-example the codebase learned from: `thoughts.remove`
   * sets `deletedAt` and nothing anywhere lists a deleted thought, so the row
   * survives a deletion the citizen believes happened. A delete that leaves the
   * text in the database is not a delete, it is a filter with a reassuring
   * name.
   *
   * Scoped by userId in the WHERE clause rather than checked first and deleted
   * after: two statements can be raced, one cannot. deleteMany rather than
   * delete so a second click on the same row is a no-op instead of a 500 — the
   * citizen has already got what they asked for.
   *
   * IT DOES NOT GIVE THE CONSULTATION BACK. The allowance is a counter on the
   * profile and this touches only the row, deliberately: an allowance derived
   * from deletable rows is not an allowance, and five deletes would buy five
   * more free consultations for ever. The screen says so before the citizen
   * confirms, because finding that out afterwards would be a nasty surprise
   * dressed as a feature.
   */
  async deleteQuestion(userId: string, id: string): Promise<{ deleted: boolean }> {
    const res = await this.db.astroQuestion.deleteMany({ where: { id, userId } });
    if (!res?.count) throw new NotFoundException('That consultation is not there to delete.');
    this.logger.log(`Astrology consultation ${id} deleted by its owner`);
    return { deleted: true };
  }

  /** My Questions — every paid consultation, newest first. */
  async questions(userId: string) {
    // [] on failure showed My Questions as empty — paid consultations,
    // reported absent on a read error.
    const rows = (await swallow(this.db.astroQuestion.findMany({
      where: { userId }, orderBy: { createdAt: 'desc' }, take: 100,
    }), 'astro: questions read', { userId })) ?? ([] as AstroQuestionRow[]);
    return rows.map((r) => ({
      id: r.id, topic: r.topic, question: r.question, answer: r.answer,
      priceInr: r.priceInr, createdAt: r.createdAt,
    }));
  }
}
