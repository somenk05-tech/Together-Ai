import { Controller, Get, HttpCode, ServiceUnavailableException } from '@nestjs/common';
import { readiness } from '../shared/readiness';
import { AiService } from '../ai/ai.service';
import { PrismaService } from '../shared/prisma/prisma.service';
import { RedisService } from '../shared/redis/redis.service';
import { Public } from '../shared/public.decorator';
import { messagingConfigured } from '../mail/messaging-provider';
import { pushConfigured } from '../notifications/web-push.provider';

/** Public health/status endpoint. Exposes only non-sensitive booleans — used to
 *  verify the deployment (e.g. whether AI features are configured). No secrets. */
@Controller('health')
export class HealthController {
  constructor(
    private readonly ai: AiService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * ── THE TWO THINGS THAT CAN BE DOWN WHILE THIS SAYS OK (launch gate, 2 Sep) ──
   *
   * `ok` answered "is the process warm", and nothing here asked whether the
   * process could reach its database or its Redis. A container with a dead
   * pool answered ok:true and was routed to, and the first citizen to arrive
   * found out. These two probes are the difference.
   *
   * BOUNDED, CACHED, AND NEVER A THROW. Bounded: a probe races a timer, so a
   * hung socket answers `false` in PROBE_MS rather than holding this route
   * until the platform's own timeout — a health check that hangs is worse
   * than one that says down. Cached: this route is public and unauthenticated
   * and the platform polls it; one SELECT 1 per PROBE_CACHE_MS per instance
   * is the whole cost, however often it is asked. Never a throw: the rule the
   * comment inside `status` states for the booleans holds for these too — a
   * probe that fails reports false, and the body is still a body.
   *
   * `ok` is unchanged on purpose. It is what the platform routes on, and a
   * database outage takes every instance down at once; pulling them all from
   * routing turns "the API says the database is down" into "the API is
   * gone". These are reported beside it, for the alert that reads them.
   */
  private static readonly PROBE_MS = 1500;
  private static readonly PROBE_CACHE_MS = 5000;
  private probed: { at: number; db: boolean; redis: boolean } | null = null;

  private async probes(): Promise<{ db: boolean; redis: boolean }> {
    const now = Date.now();
    if (this.probed && now - this.probed.at < HealthController.PROBE_CACHE_MS) return this.probed;
    const bounded = async (run: () => Promise<unknown>): Promise<boolean> => {
      let timer: NodeJS.Timeout | undefined;
      const clock = new Promise<false>((resolve) => { timer = setTimeout(() => resolve(false), HealthController.PROBE_MS); });
      try {
        // `Promise.resolve().then(run)` so a probe that throws synchronously
        // — no client at all — lands in the same `false` as one that rejects.
        return await Promise.race([Promise.resolve().then(run).then(() => true, () => false), clock]);
      } finally {
        if (timer) clearTimeout(timer);
      }
    };
    const [db, redis] = await Promise.all([
      bounded(() => this.prisma.$queryRaw`SELECT 1`),
      // `up` is the connection's own flag; a false there is an answer already,
      // and asking a closed client to PING would only wait out the timer.
      this.redis.up ? bounded(() => this.redis.raw.ping()) : Promise.resolve(false),
    ]);
    this.probed = { at: now, db, redis };
    return this.probed;
  }

  /**
   * 200 once this instance can actually serve; 503 while it is still warming.
   *
   * THE 503 IS THE POINT. Render routes traffic the moment this returns 200 and,
   * during a deploy, keeps the OLD instance serving until the new one does — so
   * a truthful answer here is the difference between a citizen waiting on a
   * half-booted process and never knowing a deploy happened.
   */
  @Public()
  @Get()
  @HttpCode(200)
  async status() {
    const r = readiness.state;
    const reach = await this.probes();
    /* NOTHING BELOW MAY THROW (re-audit, 29 Aug). `messagingConfigured` used
       to CONSTRUCT a provider, and the Resend client throws on an empty key —
       so a missing mail secret turned every probe into a 500, which on a host
       that routes on health means an instance that is never routed and a
       deploy that never finishes. It reads env now, and this belt is here
       because a health endpoint that can fail is worse than one that says
       less. */
    const configured = (f: () => boolean): boolean => { try { return f(); } catch { return false; } };
    const body = {
      ok: r.ready,
      warming: r.pending,
      aiEnabled: this.ai.enabled,          // true when an Anthropic key is configured
      photoAnalysis: this.ai.enabled ? 'live' : 'fallback (deterministic)',
      /* THE TWO SILENT OUTAGES (fifth audit, 29 Aug). Both of these subsystems
         disable themselves when their variables are unset, and both do it
         without failing anything: mail falls through to a stub that reports
         `sent`, push returns before it does any work and hands the browser an
         empty key. A deploy missing either one passed this check and looked
         perfectly healthy while no citizen received anything.
         Booleans only, like everything else here — whether a sender is wired,
         never which one or with what. */
      emailConfigured: configured(() => messagingConfigured('email')),
      pushConfigured: configured(pushConfigured),
      /* The two probes above. Booleans, bounded, cached — see `probes`. */
      db: reach.db,
      redis: reach.redis,
    };
    if (!r.ready) throw new ServiceUnavailableException(body);
    return body;
  }
}
