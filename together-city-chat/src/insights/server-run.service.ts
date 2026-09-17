import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../shared/prisma/prisma.service';

/**
 * ── EVERY TIME THE SERVER RAN (owner, 16 Sep: uptime across deploys) ────────
 *
 * One ServerRun row when this process starts, and its `lastBeatAt` moved once a
 * minute while it lives. The dashboard reads the rows back as intervals: time
 * covered by at least one serving process is up, the gaps are down. A process
 * that dies without a word simply stops beating, which is exactly the gap.
 *
 * Never a reason to keep a process (or a test run) alive, and never a reason
 * for anything else to fail: a database that refuses costs a beat, not a boot.
 */
export const BEAT_MS = 60_000;

@Injectable()
export class ServerRunService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('ServerRun');
  readonly id = randomUUID();
  private timer?: ReturnType<typeof setInterval>;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    if ((process.env.NODE_ENV ?? '') === 'test') return;
    const role = process.env.JOBS_ROLE || 'both';
    const commit = (process.env.RAILWAY_GIT_COMMIT_SHA ?? '').slice(0, 12) || null;
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "ServerRun" ("id", "role", "commit") VALUES ($1, $2, $3) ON CONFLICT ("id") DO NOTHING`,
      this.id, role, commit,
    ).catch((e: unknown) => this.log.warn(`uptime is not being recorded: ${String(e)}`));
    this.timer = setInterval(() => { void this.beat(); }, BEAT_MS);
    this.timer.unref?.();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    if ((process.env.NODE_ENV ?? '') !== 'test') await this.beat();
  }

  private async beat(): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `UPDATE "ServerRun" SET "lastBeatAt" = CURRENT_TIMESTAMP WHERE "id" = $1`, this.id,
    ).catch(() => undefined);
  }
}
