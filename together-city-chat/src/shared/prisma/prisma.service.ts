import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import type { Pool, PoolConfig } from 'pg';

/**
 * ── THE CONNECTION POOL WAS THE CEILING ─────────────────────────────────────
 *
 * This file used to be one line: `new PrismaPg({ connectionString })`. Every
 * other value came from node-postgres' defaults, and the one that mattered is
 * `max: 10`.
 *
 * Ten. A feed page costs four or five round trips, a heart tap costs about
 * ten, and each one holds a connection for its duration — so somewhere between
 * twenty and forty simultaneous citizens, every connection is busy and the
 * forty-first request joins a queue. The 30 Aug audit measured the wall at
 * "~20–40 concurrent, not 500" and named a dozen suspects. The wall was here.
 *
 * Four defaults were wrong, and each one is a different failure:
 *
 *  · `max: 10` — the ceiling itself. Now DB_POOL_MAX, and the arithmetic that
 *    picks it is written below.
 *
 *  · `connectionTimeoutMillis: 0` — wait forever for a free connection. This
 *    is what turns a busy minute into an outage: requests do not fail, they
 *    accumulate, each holding a socket and an event-loop continuation, until
 *    the process runs out of memory rather than returning a single error. A
 *    pool that says "no" in five seconds stays a pool; one that says nothing
 *    becomes a queue with no exit.
 *
 *  · no `statement_timeout` — one runaway query holds its connection until the
 *    server decides otherwise, which by Postgres default is never. Ten of
 *    those and the pool is gone while the database sits idle.
 *
 *  · `keepAlive: false` — Railway's proxy drops idle TCP connections silently.
 *    The pool hands out a socket that is already dead, the query goes into a
 *    black hole, and the citizen watches a spinner until the OS gives up
 *    minutes later. TCP keepalive is what makes the pool find out first.
 *
 * AND THE ONE THAT KILLS THE PROCESS. node-postgres emits `'error'` on an idle
 * client when the database restarts or the proxy hangs up. An `'error'` event
 * on an EventEmitter with no listener is not an error — it is an uncaught
 * exception, and it takes the whole monolith down. `onPoolError` and
 * `onConnectionError` below are that listener. A dropped connection is a thing
 * the pool is designed to handle; it should cost a log line, not the city.
 *
 * ── SIZING IT ───────────────────────────────────────────────────────────────
 *
 * The number is not "as high as possible". Every connection is a backend
 * process on the Postgres server with its own memory, and
 *
 *     containers × DB_POOL_MAX  +  headroom for migrations and psql
 *                                            ≤ the server's max_connections
 *
 * So the default is deliberately modest — 20, which is five containers against
 * a stock `max_connections = 100` with room to spare — and the value is an
 * environment variable because only the deployment knows how many containers
 * there are.
 *
 * PAST A FEW HUNDRED CONCURRENT CITIZENS THAT ARITHMETIC RUNS OUT, and the
 * answer is not a bigger number here: it is a transaction-mode pooler
 * (pgBouncer, or Postgres' own connection pooling on a managed plan) between
 * these containers and the server, at which point DB_POOL_MAX is a limit on
 * *concurrent queries per container* rather than on server processes, and can
 * go to 50–100 with the pooler holding a couple of dozen real connections for
 * everybody.
 *
 * This adapter is already compatible with that. `@prisma/adapter-pg` caches
 * prepared statements only when a `statementNameGenerator` is supplied, and we
 * supply none — so there are no server-side named statements to survive a
 * transaction boundary, which is the thing that breaks Prisma behind pgBouncer
 * in transaction mode. No `?pgbouncer=true` needed, and nothing to change here
 * when the pooler arrives except the number.
 */

/** An integer from the environment, or the default — never NaN, never negative. */
function envInt(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** The pool settings, exported so a spec can assert them without a database. */
export function poolConfig(): PoolConfig {
  return {
    connectionString: process.env.DATABASE_URL,

    // The ceiling. See the arithmetic above before raising it.
    max: envInt('DB_POOL_MAX', 20, 1, 200),

    // Fail fast rather than queue forever. Five seconds is far longer than a
    // healthy checkout (microseconds) and far shorter than a citizen's
    // patience, so this fires only when the pool is genuinely exhausted —
    // and when it does, the request 500s, the load balancer sees it, and the
    // process stays alive instead of filling with waiters.
    connectionTimeoutMillis: envInt('DB_CONNECT_TIMEOUT_MS', 5_000, 500, 60_000),

    // Give idle connections back. Behind a transaction pooler this matters
    // more, not less: an idle connection held here is one the pooler cannot
    // give to another container.
    idleTimeoutMillis: envInt('DB_IDLE_TIMEOUT_MS', 30_000, 1_000, 600_000),

    // A query that has not finished in fifteen seconds is not going to. The
    // server-side timeout is the one that actually releases the connection;
    // the client-side one covers the case where the server never answers.
    statement_timeout: envInt('DB_STATEMENT_TIMEOUT_MS', 15_000, 1_000, 120_000),
    query_timeout: envInt('DB_QUERY_TIMEOUT_MS', 20_000, 1_000, 120_000),

    // Do not let a connection sit in a transaction forever either — that is
    // the shape that holds locks as well as a connection.
    idle_in_transaction_session_timeout: envInt('DB_IDLE_TX_TIMEOUT_MS', 30_000, 1_000, 300_000),

    // So `SELECT * FROM pg_stat_activity` names the culprit rather than
    // showing twenty rows of "node".
    application_name: process.env.APP_NAME ?? 'together-city-api',

    // The proxy drops idle sockets. Find out from TCP rather than from a
    // citizen watching a spinner.
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
  } as PoolConfig;
}

/** Thin wrapper so Prisma participates in Nest's lifecycle + DI.
 *  Uses the pg driver adapter + WASM query compiler so no native Prisma
 *  engine binary is required (works in restricted/offline environments). */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private static readonly log = new Logger('Prisma');

  constructor() {
    const cfg = poolConfig();
    super({
      adapter: new PrismaPg(cfg, {
        // THE LISTENERS THAT KEEP THE PROCESS ALIVE. See the note above: an
        // unhandled 'error' on a pg client is an uncaught exception, and a
        // database restart would otherwise take down every hub in the
        // monolith. The pool reconnects on its own; this only has to not die.
        onPoolError: (e) => PrismaService.log.error(`pool error (recovering): ${e.message}`),
        onConnectionError: (e) => PrismaService.log.warn(`connection dropped (recovering): ${e.message}`),
      }),
    });
    PrismaService.log.log(
      `pool max=${cfg.max} connectTimeout=${cfg.connectionTimeoutMillis}ms `
      + `statementTimeout=${(cfg as { statement_timeout?: number }).statement_timeout}ms keepAlive=on`,
    );
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /**
   * What the pool is doing right now — for /dev and for a load test to read.
   * `waiting` is the number that matters: anything above zero for more than a
   * moment means DB_POOL_MAX is the bottleneck, and it is the one metric that
   * tells you so directly rather than by inference from latency.
   */
  poolStats(): { total: number; idle: number; waiting: number; max: number } | null {
    const pool = (this as unknown as { $pool?: Pool }).$pool
      ?? (this as unknown as { _engine?: { driverAdapter?: { underlyingDriver?: () => Pool } } })._engine?.driverAdapter?.underlyingDriver?.();
    if (!pool) return null;
    return {
      total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount,
      max: envInt('DB_POOL_MAX', 20, 1, 200),
    };
  }
}
