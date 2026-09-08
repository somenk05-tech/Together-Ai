/**
 * A PROBE THAT CANNOT HANG, CANNOT THROW, AND IS NOT FREE TO ASK.
 *
 * /api/health answered `ok` from the readiness flag alone (launch gate, 1 and
 * 2 Sep): a warm process with a dead database pool or a closed Redis said
 * ok:true and was routed to. It reports `db` and `redis` now, and this file
 * holds the three properties that make a probe safe to put on a public,
 * platform-polled route:
 *
 *   1. bounded — a hung socket answers false in PROBE_MS, not never;
 *   2. never a throw — a rejecting or synchronously-throwing client is false;
 *   3. cached — a hundred polls in five seconds are one SELECT 1;
 *
 * and the one thing it must NOT do: change `ok`. That is what the platform
 * routes on, and a database outage that pulled every instance from routing
 * would turn a down database into a vanished API.
 */
import { HealthController } from './health.controller';
import { readiness } from '../shared/readiness';

type Probe = () => Promise<unknown>;

function build(opts: { db: Probe; redisUp: boolean; ping?: Probe }) {
  const calls = { db: 0, ping: 0 };
  const prisma = { $queryRaw: () => { calls.db += 1; return opts.db(); } };
  const redis = { up: opts.redisUp, raw: { ping: () => { calls.ping += 1; return (opts.ping ?? (async () => 'PONG'))(); } } };
  const ai = { enabled: false };
  const c = new HealthController(ai as never, prisma as never, redis as never);
  return { c, calls };
}

const never = () => new Promise<never>(() => undefined);

describe('a probe that cannot hang', () => {
  beforeAll(() => { jest.useFakeTimers(); readiness.expect('spec'); readiness.settle('spec'); });
  afterAll(() => { jest.useRealTimers(); });

  it('answers false for a database that never replies, inside the bound', async () => {
    const { c } = build({ db: never, redisUp: true });
    const pending = c.status();
    await jest.advanceTimersByTimeAsync(1600);
    const body = await pending;
    expect(body.db).toBe(false);
    expect(body.redis).toBe(true);
    expect(body.ok).toBe(true);
  });

  it('answers true when both reply', async () => {
    const { c } = build({ db: async () => [{ '?column?': 1 }], redisUp: true });
    const body = await c.status();
    expect(body.db).toBe(true);
    expect(body.redis).toBe(true);
  });
});

describe('a probe that cannot throw', () => {
  beforeAll(() => { readiness.expect('spec'); readiness.settle('spec'); });

  it('a rejecting client is false, and the body is still a body', async () => {
    const { c } = build({ db: async () => { throw new Error('ECONNREFUSED'); }, redisUp: true, ping: async () => { throw new Error('closed'); } });
    const body = await c.status();
    expect(body.db).toBe(false);
    expect(body.redis).toBe(false);
    expect(body.ok).toBe(true);
  });

  it('a client that throws synchronously is false too', async () => {
    const { c } = build({ db: () => { throw new Error('no client'); }, redisUp: true });
    const body = await c.status();
    expect(body.db).toBe(false);
  });

  it('a Redis whose own flag is down is not even asked', async () => {
    const { c, calls } = build({ db: async () => 1, redisUp: false });
    const body = await c.status();
    expect(body.redis).toBe(false);
    expect(calls.ping).toBe(0);
  });
});

describe('a probe that is not free to ask', () => {
  it('a hundred polls inside the cache window are one query', async () => {
    readiness.expect('spec'); readiness.settle('spec');
    const { c, calls } = build({ db: async () => 1, redisUp: true });
    for (let i = 0; i < 100; i++) await c.status();
    expect(calls.db).toBe(1);
    expect(calls.ping).toBe(1);
  });

  it('`ok` is still the readiness flag, whatever the probes say', async () => {
    const { c } = build({ db: async () => { throw new Error('down'); }, redisUp: false });
    readiness.expect('spec'); readiness.settle('spec');
    expect((await c.status()).ok).toBe(true);
  });
});
