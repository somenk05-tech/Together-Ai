import { BadRequestException, Injectable } from '@nestjs/common';
import { errorSnapshot } from '../shared/errors/error-log';
import { PrismaService } from '../shared/prisma/prisma.service';
import { AdminAccessService } from '../admin/admin-access.service';
import { swallow } from '../shared/swallow';
import { reportEnv } from './env-manifest';
import { usingDefaultPassword } from './dev-password.guard';
import { FLAGS, isFlagKey, VISIBILITY_FLAGS, visibilityFlag, ROOM_FLAGS, roomFlag } from './feature-flags';
import { RoomRoutesRegistry } from './room-routes.registry';
import { FeatureFlagGuard } from './feature-flag.guard';

/**
 * WHAT THE DEVELOPER PAGE KNOWS.
 *
 * Three things, and the boundary of each is the interesting part.
 *
 * CONFIGURATION: which variables are set, never what they are set to. See
 * env-manifest.ts, where that is enforced rather than intended.
 *
 * THE DEPLOYMENT ITSELF: which commit, how long it has been up, whether the
 * database answers and how many migrations it has. Facts about the machine.
 *
 * COUNTS, AND NOTHING BELOW A COUNT. How many citizens, how many listings, how
 * many are pending. A count is an operational fact; the moment this page shows
 * a name or a row it becomes the citizen browser the admin console deliberately
 * is not, reachable with a shared password instead of a per-person grant. The
 * guard beside this file fails on a findMany here for exactly that reason.
 */
@Injectable()
export class DevService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly flagGuard: FeatureFlagGuard,
    private readonly access: AdminAccessService,
    private readonly roomRoutes: RoomRoutesRegistry,
  ) {}

  private readonly bootedAt = Date.now();

  async diagnostics() {
    const started = Date.now();
    // A trivial query, timed. "Is the database reachable, and is it slow" is
    // two questions people ask together and one round trip answers.
    const ping = await swallow(this.prisma.$queryRaw`SELECT 1`, 'dev db ping');
    const dbMs = Date.now() - started;

    const migrations = await swallow(
      this.prisma.$queryRaw<Array<{ migration_name: string; finished_at: Date | null }>>`
        SELECT migration_name, finished_at FROM _prisma_migrations
        ORDER BY finished_at DESC NULLS FIRST LIMIT 5`,
      'dev migration read',
    );

    const [citizens, suspended, listings, pending] = await Promise.all([
      swallow(this.prisma.user.count({ where: { deletedAt: null } }), 'dev count citizens'),
      swallow(this.prisma.user.count({ where: { suspendedAt: { not: null } } }), 'dev count suspended'),
      swallow(this.prisma.serviceListing.count(), 'dev count listings'),
      swallow(this.prisma.serviceListing.count({ where: { moderation: 'pending' } }), 'dev count pending'),
    ]);

    return {
      build: {
        // Railway and Vercel both publish the commit they built. Reported as
        // whatever is there rather than resolved to one name, because a page
        // that says "unknown" on a platform that told us is worse than a page
        // that shows which platform answered.
        commit: (process.env.RAILWAY_GIT_COMMIT_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA ?? '').slice(0, 12) || null,
        branch: process.env.RAILWAY_GIT_BRANCH ?? process.env.VERCEL_GIT_COMMIT_REF ?? null,
        nodeEnv: process.env.NODE_ENV ?? 'development',
        nodeVersion: process.version,
        upSeconds: Math.floor((Date.now() - this.bootedAt) / 1000),
      },
      database: {
        reachable: ping !== undefined,
        ms: dbMs,
        // Nullable rather than an empty list: "no migrations have run" and "we
        // could not read the migrations table" are different problems and the
        // page must not print one when it means the other.
        recentMigrations: migrations
          ? migrations.map((m) => ({ name: m.migration_name, at: m.finished_at?.toISOString() ?? null }))
          : null,
        /**
         * THE ONE NUMBER THAT SAYS "THE POOL IS THE BOTTLENECK" WITHOUT
         * INFERENCE.
         *
         * Everything else about a saturated connection pool arrives as
         * latency, which looks identical to a slow query, a slow disk or a
         * slow network. `waiting` is requests queued for a connection: above
         * zero for more than a moment and DB_POOL_MAX is the ceiling, full
         * stop. It was ten until the scale pass, which is where the 30 Aug
         * audit's "~20–40 concurrent" came from, and it is the first thing to
         * read during a load test.
         *
         * Null when the adapter does not expose its pool — reported as null
         * rather than as zeros, because "no waiters" and "we could not ask"
         * are different answers and one of them is reassuring.
         */
        pool: this.prisma.poolStats(),
      },
      counts: { citizens, suspended, listings, pendingListings: pending },
      env: reportEnv(),
      /** Every 5xx since boot. Not a Sentry replacement — see error-log.ts —
       *  but the difference between an unread log stream and a number. */
      errors: errorSnapshot(),
      /** The page nagging about itself. */
      usingDefaultPassword: usingDefaultPassword(),
    };
  }

  async flags() {
    const state = await this.flagGuard.snapshot();
    const byKey = new Map(state.map((s) => [s.key, s.enabled]));
    // unbounded: FLAGS is a fixed list of a dozen keys and nothing else can be
    // written, so this table can never hold more rows than the code declares.
    const rows = await swallow(this.prisma.featureFlag.findMany({
      select: { key: true, note: true, updatedAt: true, updatedBy: true },
    }), 'dev flag detail');
    const meta = new Map((rows ?? []).map((r) => [r.key, r]));
    const vis = new Map((await this.flagGuard.visibilitySnapshot()).map((v) => [v.key, v.visible]));
    const rooms = new Map((await this.flagGuard.roomSnapshot()).map((r) => [r.key, r]));
    return {
      // The OTHER kind of switch, sent alongside and never mixed in. These
      // hide a door and refuse nothing; the page draws them in their own
      // section saying exactly that.
      visibility: VISIBILITY_FLAGS.map((f) => {
        const m2 = meta.get(f.storeKey);
        return {
          key: f.key, label: f.label, hides: f.hides,
          visible: vis.get(f.key) ?? true,
          note: m2?.note ?? '',
          updatedAt: m2?.updatedAt?.toISOString() ?? null,
          /* THE ROOMS BEHIND THIS DOOR (owner, 9 Sep). Carried INSIDE the
             sector rather than as a list beside it, because that is the only
             shape in which the page can be read: a hundred and eight switches
             in one grid is a wall, and eight under Astrology is a menu. A
             sector with no rooms of its own sends an empty array and draws no
             fold. */
          rooms: ROOM_FLAGS.filter((r) => r.hub === f.key).map((r) => {
            const m3 = meta.get(r.storeKey);
            const m4 = meta.get(r.killKey);
            const state = rooms.get(r.key);
            /* WHAT THE KILL SWITCH REFUSES, from the live controllers rather
               than from a sentence somebody typed once. An empty list is a
               real answer — the room owns no route of its own — and the page
               prints it as one instead of implying an API that will close. */
            const routes = this.roomRoutes.routesOf(r.key);
            return {
              key: r.key, index: r.index, label: r.label, hides: r.hides,
              visible: state?.visible ?? true,
              note: m3?.note ?? '',
              updatedAt: m3?.updatedAt?.toISOString() ?? null,
              open: state?.open ?? true,
              routes,
              killNote: m4?.note ?? '',
              killedAt: m4?.updatedAt?.toISOString() ?? null,
            };
          }),
        };
      }),
      items: FLAGS.map((f) => {
        const m = meta.get(f.key);
        return {
          key: f.key, label: f.label, turnsOff: f.turnsOff, hubPath: f.hubPath,
          enabled: byKey.get(f.key) ?? true,
          note: m?.note ?? '',
          updatedAt: m?.updatedAt?.toISOString() ?? null,
          updatedBy: m?.updatedBy ?? '',
        };
      }),
    };
  }

  /**
   * Flip a switch.
   *
   * The password gets you the PAGE. It does not get you this: turning a hub off
   * for every citizen is a change to the product, and it goes through the same
   * door every other console action goes through — `ops.flags`, a written
   * reason, an audit row. A shared password can say who typed it to nobody, and
   * "Dating has been off since Tuesday" needs an answer.
   */
  /**
   * Flip a switch — either kind.
   *
   * The two live in one method because the CEREMONY is identical and must stay
   * identical: `ops.flags`, a written reason, an audit row, an immediate cache
   * invalidation. What differs is only the row it writes and the words the
   * audit uses, so that "who hid Mira's door" and "who took Dating off the
   * air" never read as the same event in the log.
   */
  async setFlag(userId: string, key: string, enabled: boolean, reason: string, ip?: string | null,
                kind: 'kill' | 'visibility' | 'page' | 'page-kill' = 'kill') {
    // WHICH KIND IS ASKED FOR, NEVER INFERRED FROM THE KEY. A sector now has
    // both — 'astrology' names a kill switch AND a visibility switch — so
    // guessing from the name would have silently sent every sector's door
    // switch to the gate writer, closing hubs somebody only meant to hide.
    if (kind === 'visibility') {
      const vis = visibilityFlag(key);
      if (!vis) throw new BadRequestException('no such visibility switch');
      return this.setVisibility(userId, vis.key, vis.storeKey, vis.label, enabled, reason, ip);
    }
    /* A ROOM (owner, 9 Sep) takes the same road as its sector: the same
       ceremony, the same row shape, the same guarantee that nothing written
       here can refuse a request. It is a third `kind` rather than a guess at
       the key's shape for the reason written above — a key is asked for, never
       inferred — and because '/astrology/ask' arriving at the gate writer must
       be impossible rather than merely unlikely. */
    if (kind === 'page') {
      const room = roomFlag(key);
      if (!room) throw new BadRequestException('no such room switch');
      return this.setVisibility(userId, room.key, room.storeKey, room.label, enabled, reason, ip);
    }
    /**
     * ── CLOSING A ROOM (owner, 9 Sep: "create kill switches for each tab") ──
     *
     * A fourth kind, and the reason it is a fourth kind rather than a flag on
     * the third is the same reason there are three: the key does not say which
     * switch is meant, and the two a room has do opposite things. Sending a
     * close to the hider would leave a room somebody meant to shut still
     * answering, and the operator would have no way to tell from the page.
     *
     * It writes a `kill:page:` row, which the request gate reads ONLY for a
     * handler carrying that room's @Room() decorator — never by path.
     */
    if (kind === 'page-kill') {
      const room = roomFlag(key);
      if (!room) throw new BadRequestException('no such room switch');
      return this.setRoomOpen(userId, room.key, room.killKey, room.label, enabled, reason, ip);
    }
    if (!isFlagKey(key)) throw new BadRequestException('no such flag');
    const before = await swallow(this.prisma.featureFlag.findUnique({
      where: { key }, select: { enabled: true },
    }), 'dev flag before', { key });

    return this.access.act({
      actorId: userId, need: 'ops.flags',
      action: enabled ? 'flag.on' : 'flag.off',
      entity: 'flag', entityId: key,
      // `?? true` here is the same rule as the guard's: no row means on, so
      // that is what the audit trail should record it as having been.
      before: { enabled: before?.enabled ?? true },
      after: { enabled },
      reason, ip,
    }, async () => {
      await this.prisma.featureFlag.upsert({
        where: { key },
        create: { key, enabled, note: reason.trim().slice(0, 500), updatedBy: userId },
        update: { enabled, note: reason.trim().slice(0, 500), updatedBy: userId },
      });
      // So the person who flipped it does not spend ten seconds wondering
      // whether it worked.
      this.flagGuard.invalidate();
      return { key, enabled };
    });
  }

  /**
   * The door-hider's own write. Same door in, different row, different verb.
   *
   * `visible: false` is stored as `enabled: false` on a `show:`-prefixed key.
   * That row can never gate a request — `flagForPath` is built from FLAGS and
   * FLAGS holds no key with this prefix — so the worst a mistake here can do is
   * hide a link, which is the whole contract of this kind of switch.
   */
  /**
   * THE ROOM CLOSER'S OWN WRITE. Same door in as every other switch — the
   * `ops.flags` grant, a written reason, an audit row — and its own verb, so
   * "who hid Ask the Astrologer" and "who closed it" are two different
   * sentences in the log rather than one ambiguous one.
   */
  private async setRoomOpen(
    userId: string, key: string, storeKey: string, label: string,
    open: boolean, reason: string, ip?: string | null,
  ) {
    const before = await swallow(this.prisma.featureFlag.findUnique({
      where: { key: storeKey }, select: { enabled: true },
    }), 'dev room close before', { key: storeKey });

    return this.access.act({
      actorId: userId, need: 'ops.flags',
      action: open ? 'room.opened' : 'room.closed',
      entity: 'room', entityId: key,
      before: { open: before?.enabled ?? true },
      after: { open },
      reason, ip,
    }, async () => {
      await this.prisma.featureFlag.upsert({
        where: { key: storeKey },
        create: { key: storeKey, enabled: open, note: reason.trim().slice(0, 500), updatedBy: userId },
        update: { enabled: open, note: reason.trim().slice(0, 500), updatedBy: userId },
      });
      this.flagGuard.invalidate();
      return { key, enabled: open, label };
    });
  }

  private async setVisibility(
    userId: string, key: string, storeKey: string, label: string,
    visible: boolean, reason: string, ip?: string | null,
  ) {
    const before = await swallow(this.prisma.featureFlag.findUnique({
      where: { key: storeKey }, select: { enabled: true },
    }), 'dev visibility before', { key: storeKey });

    return this.access.act({
      actorId: userId, need: 'ops.flags',
      // Named apart from flag.on/flag.off on purpose: an audit log where
      // hiding a door and closing a hub read the same is a log that cannot
      // answer the question anybody actually asks it afterwards.
      action: visible ? 'visibility.shown' : 'visibility.hidden',
      entity: 'visibility', entityId: key,
      before: { visible: before?.enabled ?? true },
      after: { visible },
      reason, ip,
    }, async () => {
      await this.prisma.featureFlag.upsert({
        where: { key: storeKey },
        create: { key: storeKey, enabled: visible, note: reason.trim().slice(0, 500), updatedBy: userId },
        update: { enabled: visible, note: reason.trim().slice(0, 500), updatedBy: userId },
      });
      this.flagGuard.invalidate();
      return { key, enabled: visible, label };
    });
  }
}
