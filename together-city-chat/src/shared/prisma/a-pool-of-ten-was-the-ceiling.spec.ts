import { poolConfig } from './prisma.service';

/**
 * ── A POOL OF TEN WAS THE CEILING ───────────────────────────────────────────
 *
 * The 30 Aug audit measured the scale wall at "~20–40 concurrent, not 500" and
 * listed a dozen candidates. It was this: `new PrismaPg({ connectionString })`,
 * which takes node-postgres' `max: 10`. A feed page is four or five round trips
 * and a heart tap about ten, each holding a connection for its duration, so ten
 * connections saturate at somewhere between twenty and forty citizens.
 *
 * These assertions are not style checks. Each names a default that was wrong and
 * says what it costs, because the failure mode of every one of them is a
 * production incident that looks like something else:
 *
 *   · no connection timeout  → requests queue forever and the process runs out
 *     of memory, which reads as "the API crashed" rather than "the pool is full"
 *   · no statement timeout   → one stuck query holds a connection until never
 *   · keepAlive off          → the proxy drops idle sockets and the pool serves
 *     a dead one, which reads as "the database is slow"
 *
 * The numbers themselves are deployment settings and may change. What may not
 * change without a deliberate argument is that each of them HAS a value.
 */
describe('the connection pool has a ceiling somebody chose', () => {
  const clean = () => {
    for (const k of ['DB_POOL_MAX', 'DB_CONNECT_TIMEOUT_MS', 'DB_STATEMENT_TIMEOUT_MS', 'DB_IDLE_TIMEOUT_MS']) delete process.env[k];
  };
  beforeEach(clean);
  afterAll(clean);

  it('is not ten', () => {
    // The whole audit finding, as one line.
    expect(poolConfig().max).toBeGreaterThan(10);
  });

  it('gives every timeout a value, so no failure mode is "wait forever"', () => {
    const c = poolConfig() as Record<string, unknown>;
    expect(c.connectionTimeoutMillis).toBeGreaterThan(0);
    expect(c.statement_timeout).toBeGreaterThan(0);
    expect(c.query_timeout).toBeGreaterThan(0);
    expect(c.idleTimeoutMillis).toBeGreaterThan(0);
    expect(c.idle_in_transaction_session_timeout).toBeGreaterThan(0);
  });

  it('keeps TCP alive, because the platform proxy drops idle sockets', () => {
    expect(poolConfig().keepAlive).toBe(true);
  });

  it('names itself to Postgres, so pg_stat_activity is readable', () => {
    expect(poolConfig().application_name).toBeTruthy();
  });

  it('reads the environment, and clamps rather than trusts it', () => {
    process.env.DB_POOL_MAX = '80';
    expect(poolConfig().max).toBe(80);
    // A typo must not become an unbounded pool that exhausts max_connections
    // and locks everybody — including the migration that would fix it — out.
    process.env.DB_POOL_MAX = '99999';
    expect(poolConfig().max).toBe(200);
    process.env.DB_POOL_MAX = 'twenty';
    expect(poolConfig().max).toBe(20);
    process.env.DB_POOL_MAX = '';
    expect(poolConfig().max).toBe(20);
  });
});
