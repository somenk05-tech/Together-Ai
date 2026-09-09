import { CanActivate, ExecutionContext, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../shared/prisma/prisma.service';
import { swallow } from '../shared/swallow';
import { FLAGS, VISIBILITY_FLAGS, ROOM_FLAGS, flagForPath, roomFlag } from './feature-flags';
import { ROOM_ROUTE } from './room.decorator';

/**
 * THE PART THAT MAKES A KILL SWITCH A KILL SWITCH.
 *
 * Hiding a hub's link turns it off for people who use the menu, which is not
 * the same as turning it off. This runs on every request, works out whether the
 * path belongs to a flagged hub, and refuses with 503 when that hub is off.
 *
 * ── IT FAILS OPEN, DELIBERATELY, IN EVERY DIRECTION ──
 *
 * No row means on. An unreadable database means on. A path that matches no flag
 * means on. The switch exists to cause an outage on purpose; a guard that
 * turned a Postgres hiccup into a site-wide 503 would cause a worse one by
 * accident, and it would do it at the exact moment the database was already
 * struggling.
 *
 * ── IT READS THE TABLE ONCE EVERY FEW SECONDS, NOT ONCE PER REQUEST ──
 *
 * A database round trip in front of every request in the application is a real
 * cost for a value that changes a handful of times a year. The cache is small
 * enough to hold every flag, so the refresh is one query regardless of traffic,
 * and the TTL is the honest answer to "how long after I flip it": a few
 * seconds, not instantly. Ten seconds of a hub still answering is the price of
 * not adding a query to every request in the city.
 *
 * ── 503, NOT 403 OR 404 ──
 *
 * 403 says "you are not allowed", which is wrong and sends a citizen to
 * support asking what they did. 404 says the feature never existed, which
 * breaks a client that has cached routes. 503 with Retry-After is exactly what
 * this is: temporarily switched off, come back.
 */
const TTL_MS = 10_000;

@Injectable()
export class FeatureFlagGuard implements CanActivate {
  private readonly logger = new Logger('FeatureFlags');
  private cache = new Map<string, boolean>();
  private loadedAt = 0;
  private inflight: Promise<void> | null = null;

  constructor(private readonly prisma: PrismaService, private readonly reflector: Reflector) {}

  private async refresh(): Promise<void> {
    // One refresh at a time. Without this, a burst after the TTL expires sends
    // every concurrent request to the database at once — the stampede the cache
    // was added to prevent, at the worst possible moment.
    if (this.inflight) return this.inflight;
    this.inflight = (async () => {
      /* Every key this table can hold is declared in feature-flags.ts — the
         kill switches, the sector doors and the rooms behind them — so the row
         count is a property of the source code, not of traffic or of anything
         a request can write. */
      // unbounded: the code's own declared keys are the only rows
      const rows = await swallow(this.prisma.featureFlag.findMany({
        select: { key: true, enabled: true },
      }), 'feature flag refresh');
      if (rows) {
        const next = new Map<string, boolean>();
        for (const r of rows) next.set(r.key, r.enabled);
        this.cache = next;
        this.loadedAt = Date.now();
      } else {
        // The read failed. Keep whatever we had and try again on the next
        // request rather than clearing to empty — clearing would be correct
        // only if empty meant "off", and it means on.
        this.loadedAt = Date.now() - TTL_MS + 1_000;
      }
      this.inflight = null;
    })();
    return this.inflight;
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    // Anything that is not an HTTP request — a websocket handshake, an RPC —
    // is not a URL this can reason about, so it passes.
    if (ctx.getType() !== 'http') return true;
    const req = ctx.switchToHttp().getRequest<{ url?: string; path?: string }>();
    const path = req.path ?? req.url ?? '';
    const flag = flagForPath(path);
    /**
     * ── THE ROOM THIS HANDLER SAID IT BELONGS TO (owner, 9 Sep) ─────────────
     *
     * Read from the DECORATOR, never from the URL. A room is not a prefix —
     * six Astrology rooms share /api/astrology — so a path match here would
     * close rooms nobody pressed. A handler with no @Room() is not gated by
     * any room, which is the honest default for every shared endpoint.
     */
    const room = ctx.getHandler ? this.reflector.get<string | undefined>(ROOM_ROUTE, ctx.getHandler()) : undefined;
    if (!flag && !room) return true;

    if (Date.now() - this.loadedAt > TTL_MS) await this.refresh();

    const res = ctx.switchToHttp().getResponse<{ setHeader?: (k: string, v: string) => void }>();

    /* THE HUB FIRST, because it is the bigger statement: a citizen whose whole
       hub is off should be told that, not told about one room inside it. */
    if (flag) {
      // ?? true is the whole fail-open rule, in one operator.
      const enabled = this.cache.get(flag.key) ?? true;
      if (!enabled) {
        res.setHeader?.('Retry-After', '3600');
        throw new ServiceUnavailableException(`${flag.label} is temporarily switched off.`);
      }
    }

    if (room) {
      const def = roomFlag(room);
      /* A decorator naming a room that does not exist gates NOTHING. The spec
         beside this fails the build on it, so this is the runtime half of a
         belt-and-braces: an unknown key must never become an accidental
         outage, and it must never be silently ignored either. */
      const open = def ? this.cache.get(def.killKey) ?? true : true;
      if (!open && def) {
        res.setHeader?.('Retry-After', '3600');
        throw new ServiceUnavailableException(`${def.label} is temporarily closed.`);
      }
    }

    return true;
  }

  /** Called by the service after a flip, so a deliberate change is immediate
   *  rather than up to ten seconds late for the person who made it. */
  invalidate(): void { this.loadedAt = 0; }

  /** Every declared flag with its current state — missing rows reported as on,
   *  which is what they mean. */
  async snapshot(): Promise<Array<{ key: string; enabled: boolean }>> {
    await this.refresh();
    return FLAGS.map((f) => ({ key: f.key, enabled: this.cache.get(f.key) ?? true }));
  }

  /**
   * The same for the VISIBILITY switches, which this guard reads and never
   * acts on.
   *
   * One cache, two readers, and the asymmetry is the point: `canActivate`
   * above consults `flagForPath`, which is built from FLAGS alone, so a
   * `show:` row can sit in this map forever without any request being refused
   * because of it. That is what keeps a door-hider from quietly becoming a
   * kill switch — not a comment, but the fact that nothing on the request path
   * ever reads these keys.
   */
  async visibilitySnapshot(): Promise<Array<{ key: string; visible: boolean }>> {
    await this.refresh();
    return VISIBILITY_FLAGS.map((f) => ({ key: f.key, visible: this.cache.get(f.storeKey) ?? true }));
  }

  /**
   * And the same again one level down: the ROOMS inside a sector (owner,
   * 9 Sep). Same cache, same read-only relationship to it, same fail-open
   * default — a room with no row, or a database that did not answer, is a room
   * the city draws.
   */
  async roomSnapshot(): Promise<Array<{ key: string; visible: boolean; open: boolean }>> {
    await this.refresh();
    return ROOM_FLAGS.map((r) => ({
      key: r.key,
      visible: this.cache.get(r.storeKey) ?? true,
      /** Whether the room is CLOSED — a different question from hidden, and
       *  the reason the web can put a card in front of the page rather than
       *  letting the citizen walk into a wall of 503s. */
      open: this.cache.get(r.killKey) ?? true,
    }));
  }
}
