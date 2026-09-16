import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../shared/prisma/prisma.service';
import { cityDay } from './insights-math';

/**
 * ── HOW LONG, AND WHETHER IT BROKE (owner, 16 Sep) ──────────────────────────
 *
 * Two instruments the investor dashboard called "not measured":
 *
 * TIME IN THE APP. While the app is in front of a signed-in member, the web
 * sends a beat every half minute saying how many seconds it was visible since
 * the last one. Each is capped at a minute, beats closer than fifteen seconds
 * apart are dropped, and a day tops out at twenty-four hours, so a tab left
 * open, a script or a clock that jumps cannot report more time than a day
 * has. One UsageDay row per member per city day.
 *
 * CRASH-FREE SESSIONS. Every opening of the app (a page load, signed in or
 * not) sends one row with a random id; if the app then hits an error it cannot
 * recover from, the same id is marked. No account, no address, no message.
 */
export const BEAT = { maxSeconds: 60, minGapMs: 15_000, dayCap: 86_400 } as const;
export const PLATFORMS = ['web', 'ios', 'android'] as const;
export const CRASH_KINDS = ['render', 'uncaught'] as const;
const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const clampBeat = (s: unknown): number => {
  const n = typeof s === 'number' && Number.isFinite(s) ? Math.round(s) : 0;
  return Math.max(0, Math.min(BEAT.maxSeconds, n));
};

@Injectable()
export class PulseService {
  private readonly log = new Logger('Pulse');
  private readonly lastBeat = new Map<string, number>();
  private warned = false;

  constructor(private readonly prisma: PrismaService) {}

  /** One heartbeat. Returns whether it was counted. */
  async beat(userId: string, seconds: unknown, now = new Date()): Promise<boolean> {
    const s = clampBeat(seconds);
    const at = now.getTime();
    const last = this.lastBeat.get(userId);
    if (last !== undefined && at - last < BEAT.minGapMs) return false;
    if (this.lastBeat.size > 100_000) this.lastBeat.clear();
    this.lastBeat.set(userId, at);
    if (s === 0) return false;
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "UsageDay" ("id", "userId", "day", "seconds", "beats", "updatedAt")
       VALUES ($1, $2, $3, $4, 1, CURRENT_TIMESTAMP)
       ON CONFLICT ("userId", "day") DO UPDATE
         SET "seconds" = LEAST(${BEAT.dayCap}, "UsageDay"."seconds" + EXCLUDED."seconds"),
             "beats" = "UsageDay"."beats" + 1,
             "updatedAt" = CURRENT_TIMESTAMP`,
      randomUUID(), userId, cityDay(now), s,
    ).catch((e: unknown) => this.warnOnce(e));
    return true;
  }

  /** A session starting, or — with `crash` — the same session breaking. */
  async session(body: { id?: unknown; platform?: unknown; crash?: unknown }): Promise<void> {
    const id = typeof body.id === 'string' && SESSION_ID.test(body.id) ? body.id.toLowerCase() : null;
    if (!id) return;
    const platform = (PLATFORMS as readonly string[]).includes(String(body.platform)) ? String(body.platform) : 'web';
    const crash = (CRASH_KINDS as readonly string[]).includes(String(body.crash)) ? String(body.crash) : null;
    if (!crash) {
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO "AppSession" ("id", "platform") VALUES ($1, $2) ON CONFLICT ("id") DO NOTHING`, id, platform,
      ).catch((e: unknown) => this.warnOnce(e));
      return;
    }
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "AppSession" ("id", "platform", "crashes", "crashKind", "crashedAt")
       VALUES ($1, $2, 1, $3, CURRENT_TIMESTAMP)
       ON CONFLICT ("id") DO UPDATE
         SET "crashes" = LEAST(100, "AppSession"."crashes" + 1),
             "crashKind" = COALESCE("AppSession"."crashKind", EXCLUDED."crashKind"),
             "crashedAt" = COALESCE("AppSession"."crashedAt", EXCLUDED."crashedAt")`,
      id, platform, crash,
    ).catch((e: unknown) => this.warnOnce(e));
  }

  private warnOnce(e: unknown): void {
    if (this.warned) return;
    this.warned = true;
    this.log.warn(`time-in-app / session counts are not being written: ${String(e)}`);
  }
}
