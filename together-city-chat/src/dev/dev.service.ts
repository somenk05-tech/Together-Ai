import { BadRequestException, Injectable } from '@nestjs/common';
import { errorSnapshot } from '../shared/errors/error-log';
import { PrismaService } from '../shared/prisma/prisma.service';
import { AdminAccessService } from '../admin/admin-access.service';
import { swallow } from '../shared/swallow';
import { reportEnv } from './env-manifest';
import { usingDefaultPassword } from './dev-password.guard';
import { FLAGS, isFlagKey, VISIBILITY_FLAGS, visibilityFlag } from './feature-flags';
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
                kind: 'kill' | 'visibility' = 'kill') {
    // WHICH KIND IS ASKED FOR, NEVER INFERRED FROM THE KEY. A sector now has
    // both — 'astrology' names a kill switch AND a visibility switch — so
    // guessing from the name would have silently sent every sector's door
    // switch to the gate writer, closing hubs somebody only meant to hide.
    if (kind === 'visibility') {
      const vis = visibilityFlag(key);
      if (!vis) throw new BadRequestException('no such visibility switch');
      return this.setVisibility(userId, vis.key, vis.storeKey, vis.label, enabled, reason, ip);
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
