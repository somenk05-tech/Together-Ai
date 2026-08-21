import { mkdtempSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cityDay, MiraLedger } from './ledger';

/** The ledger writes on a floated promise, so a test has to let the microtask
 *  and the fs callback both land. One tick is not enough; a real await is. */
const settle = () => new Promise((r) => setTimeout(r, 20));

function ledgerIn(dir: string, salt = 'test-salt'): MiraLedger {
  process.env.MIRA_LOG_DIR = dir;
  process.env.MIRA_LOG_SALT = salt;
  return new MiraLedger();
}

/** The default deployment: MIRA_LOG_SALT unset. */
function saltless(dir: string): MiraLedger {
  process.env.MIRA_LOG_DIR = dir;
  delete process.env.MIRA_LOG_SALT;
  return new MiraLedger();
}

const ENTRY = {
  userId: 'usr_abc',
  text: 'whats my balance',
  lane: 'RETRIEVE',
  confidence: 0.8231,
  capability: 'financial GET wallet',
  outcome: 'capability' as const,
  levity: 3,
};

describe('Mira writes down what she was asked', () => {
  const KEEP = { dir: process.env.MIRA_LOG_DIR, salt: process.env.MIRA_LOG_SALT };
  afterAll(() => {
    process.env.MIRA_LOG_DIR = KEEP.dir;
    process.env.MIRA_LOG_SALT = KEEP.salt;
  });

  /**
   * THE DAY IS THE CITY'S, NOT THE SERVER'S.
   *
   * Railway runs in UTC. An Indian evening — 9pm on the 14th — is 15:30 UTC on
   * the 14th, but 1am on the 15th is 19:30 UTC on the FOURTEENTH. A UTC file
   * name splits one evening across two days and joins two evenings into one,
   * which is the specific failure that makes a daily file useless.
   */
  it('files a question under the city’s day, not the server’s', () => {
    // 2026-08-14T19:30:00Z is 2026-08-15T01:00 in Kolkata.
    expect(cityDay(new Date('2026-08-14T19:30:00Z'))).toBe('2026-08-15');
    // …and 2026-08-14T15:30:00Z is 9pm the same evening.
    expect(cityDay(new Date('2026-08-14T15:30:00Z'))).toBe('2026-08-14');
  });

  it('writes one JSON object per line, into the day’s file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mira-'));
    const led = ledgerIn(dir);
    await led.onModuleInit();
    const at = new Date('2026-08-14T15:30:00Z');
    led.record(ENTRY, at);
    await settle();

    const file = join(dir, 'asks-2026-08-14.jsonl');
    expect(existsSync(file)).toBe(true);
    const lines = readFileSync(file, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(1);
    const row = JSON.parse(lines[0]) as Record<string, unknown>;
    expect(row.q).toBe('whats my balance');
    expect(row.lane).toBe('RETRIEVE');
    expect(row.capability).toBe('financial GET wallet');
    expect(row.outcome).toBe('capability');
    expect(row.answered).toBe(true);
    expect(row.v).toBe(2);
    /** Rounded, because fifteen decimal places of a router score is noise in a
     *  file a person is meant to read. */
    expect(row.confidence).toBe(0.82);
  });

  /**
   * THE QUESTION IS IN THE FILE. THE ASKER IS NOT.
   *
   * The point of the hash is that the file is still useful — you can count
   * distinct citizens, and you can see one person asking the same unanswerable
   * thing four times — while not being a list of what a named person asked.
   */
  it('records a stable hash and never the user id', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mira-'));
    const led = ledgerIn(dir);
    await led.onModuleInit();
    led.record(ENTRY, new Date('2026-08-14T15:30:00Z'));
    led.record({ ...ENTRY, text: 'and my last few charges' }, new Date('2026-08-14T15:31:00Z'));
    await settle();

    const body = readFileSync(join(dir, 'asks-2026-08-14.jsonl'), 'utf8');
    expect(body).not.toContain('usr_abc');
    const rows = body.trim().split('\n').map((l) => JSON.parse(l) as { who: string });
    // Same citizen, same hash — otherwise "how many people asked this" is
    // unanswerable and the field is decoration.
    expect(rows[0].who).toBe(rows[1].who);
    expect(rows[0].who).toMatch(/^[0-9a-f]{12}$/);
  });

  it('gives a different hash under a different salt', () => {
    const a = ledgerIn(mkdtempSync(join(tmpdir(), 'mira-')), 'salt-one').who('usr_abc');
    const b = ledgerIn(mkdtempSync(join(tmpdir(), 'mira-')), 'salt-two').who('usr_abc');
    expect(a).not.toBe(b);
  });

  /** A paste is not a question, and a disk is finite. */
  it('cuts a very long ask, and marks that it cut it', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mira-'));
    const led = ledgerIn(dir);
    await led.onModuleInit();
    led.record({ ...ENTRY, text: 'x'.repeat(4000) }, new Date('2026-08-14T15:30:00Z'));
    await settle();

    const row = JSON.parse(readFileSync(join(dir, 'asks-2026-08-14.jsonl'), 'utf8').trim()) as { q: string };
    expect(row.q).toHaveLength(500 + '…[cut]'.length);
    expect(row.q.endsWith('…[cut]')).toBe(true);
  });

  /**
   * RETENTION IS DELETING A FILE.
   *
   * Which is the whole argument for one file per day: expiring a log that is a
   * single growing file means parsing and rewriting it, and nobody does that,
   * so in practice such a log is kept forever.
   */
  it('drops files older than the retention window and keeps the rest', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mira-'));
    writeFileSync(join(dir, 'asks-2020-01-01.jsonl'), '{}\n');
    writeFileSync(join(dir, `asks-${cityDay(new Date())}.jsonl`), '{}\n');
    // Not ours, and not touched.
    writeFileSync(join(dir, 'notes.txt'), 'hello\n');

    await ledgerIn(dir).onModuleInit();

    const left = readdirSync(dir).sort();
    expect(left).toContain('notes.txt');
    expect(left).toContain(`asks-${cityDay(new Date())}.jsonl`);
    expect(left).not.toContain('asks-2020-01-01.jsonl');
  });

  /**
   * AND A BROKEN DISK DOES NOT BREAK AN ANSWER.
   *
   * The whole point of recording on a floated promise. If this ever throws
   * synchronously, one unwritable directory takes down every reply Mira gives.
   */
  it('never throws at the caller, even pointed at a path it cannot use', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mira-'));
    const file = join(dir, 'a-file-not-a-directory');
    writeFileSync(file, 'x');
    const led = ledgerIn(file);
    await expect(led.onModuleInit()).resolves.toBeUndefined();
    expect(() => led.record(ENTRY)).not.toThrow();
    await settle();
  });
});


/**
 * ── THE FILE COULD NOT ANSWER THE QUESTION IT WAS BUILT TO ANSWER ─────────
 *
 * Its own header says the interesting number is what people ask for that is
 * NOT a capability. `answered` was `outcome === 'capability'`, so every
 * successful navigation, every real conversation and every correct crisis
 * hand-off was filed as backlog — and the backlog was therefore mostly her
 * working. Nobody could have caught that by reading the line: the derivation
 * sat directly under a paragraph about capabilities and looked right.
 */
describe('what counts as answered', () => {
  const dir = () => mkdtempSync(join(tmpdir(), 'mira-'));
  const rowFor = async (outcome: string, extra: Record<string, unknown> = {}) => {
    const d = dir();
    const led = ledgerIn(d);
    await led.onModuleInit();
    led.record({ ...ENTRY, ...extra, outcome: outcome as typeof ENTRY.outcome }, new Date('2026-08-14T15:30:00Z'));
    await settle();
    return JSON.parse(readFileSync(join(d, 'asks-2026-08-14.jsonl'), 'utf8').trim()) as Record<string, unknown>;
  };

  it.each(['capability', 'navigate', 'chat', 'relate', 'listen', 'advise', 'forget', 'confide'])(
    '%s is her answering', async (outcome) => {
      expect((await rowFor(outcome)).answered).toBe(true);
    },
  );

  /** The three that genuinely are the backlog: she asked instead of
   *  answering, a decorator had no branch behind it, and the meter spoke. */
  it.each(['clarify', 'gap', 'paywall'])('%s is not', async (outcome) => {
    expect((await rowFor(outcome)).answered).toBe(false);
  });

  it('carries the room, the latency, the source and the session', async () => {
    const row = await rowFor('chat', {
      mode: 'friend', ms: 412, source: 'model', asideDropped: true,
      distress: false, mood: 'wry', session: '90210',
    });
    expect(row).toMatchObject({
      mode: 'friend', ms: 412, source: 'model', asideDropped: true, mood: 'wry', session: '90210',
    });
  });

  /** A clarify at 0.81 against 0.80 is the matcher being honest; one at 0.30
   *  against 0.28 is the matcher having nothing, and the fix for each is the
   *  opposite of the other. Neither was recorded. */
  it('records the two scores that made a clarify a clarify', async () => {
    const row = await rowFor('clarify', { top: 0.75, second: 0.7 });
    expect(row.top).toBe(0.75);
    expect(row.second).toBe(0.7);
  });
});

/**
 * ── "USELESS WITHOUT THE SALT" HAS TO BE TRUE IN PRODUCTION ───────────────
 *
 * The salt fell back to a string hardcoded three lines under the claim, which
 * is the default deployment — so the hash was reversible by anybody holding
 * this file and a list of user ids. It does not throw (an optional feature may
 * never stop the API booting); it withholds the questions instead, and says so
 * once.
 */
describe('with no salt configured', () => {
  const KEEP = process.env.MIRA_LOG_SALT;
  afterAll(() => { if (KEEP === undefined) delete process.env.MIRA_LOG_SALT; else process.env.MIRA_LOG_SALT = KEEP; });

  it('still boots, still records the decision, and withholds the question', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mira-'));
    const led = saltless(dir);
    await expect(led.onModuleInit()).resolves.toBeUndefined();
    led.record(ENTRY, new Date('2026-08-14T15:30:00Z'));
    await settle();

    const body = readFileSync(join(dir, 'asks-2026-08-14.jsonl'), 'utf8');
    expect(body).not.toContain('whats my balance');
    const row = JSON.parse(body.trim()) as Record<string, unknown>;
    expect(row.q).toBeNull();
    // Everything else is still the point of the file, and none of it is personal.
    expect(row.lane).toBe('RETRIEVE');
    expect(row.outcome).toBe('capability');
    expect(row.answered).toBe(true);
  });
});

/**
 * ── A FORGET REACHES THIS FILE TOO, OR "TRULY GONE" IS NOT TRUE ───────────
 *
 * `forget` deleted from MiraTurn and stopped, while the verbatim question sat
 * here for thirty days — and every LISTEN turn, the heaviest thing anybody
 * says to her, lands here.
 */
describe('and she can be told to forget what is in it', () => {
  const day = 'asks-2026-08-14.jsonl';

  const fill = async (led: MiraLedger, dir: string) => {
    await led.onModuleInit();
    const at = new Date('2026-08-14T15:30:00Z');
    led.record({ ...ENTRY, text: 'the loan is keeping me up' }, at);
    led.record({ ...ENTRY, text: 'what is my balance' }, at);
    led.record({ ...ENTRY, userId: 'somebody-else', text: 'the loan on my flat' }, at);
    await settle();
    return readFileSync(join(dir, day), 'utf8').trim().split('\n');
  };

  it('drops only the asker own lines that mention the topic', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mira-'));
    const led = ledgerIn(dir);
    expect(await fill(led, dir)).toHaveLength(3);

    await led.forget('usr_abc', 'the loan');

    const left = readFileSync(join(dir, day), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as { q: string; who: string });
    expect(left.map((r) => r.q)).toEqual(['what is my balance', 'the loan on my flat']);
    // Somebody else's line mentions the same topic and is not hers to delete.
    expect(left[1].who).toBe(led.who('somebody-else'));
  });

  it('"everything" takes all of the asker lines and nobody else\u2019s', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mira-'));
    const led = ledgerIn(dir);
    await fill(led, dir);

    await led.forget('usr_abc');

    const left = readFileSync(join(dir, day), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as { who: string });
    expect(left).toHaveLength(1);
    expect(left[0].who).toBe(led.who('somebody-else'));
  });

  /** A forget that fails here must not turn a confirmed deletion into an
   *  error in front of the citizen — the turns are gone either way. */
  it('never throws at the caller', async () => {
    const led = ledgerIn(join(mkdtempSync(join(tmpdir(), 'mira-')), 'not-a-directory'));
    await expect(led.forget('usr_abc', 'anything')).resolves.toBeUndefined();
  });
});

/**
 * ── AND RETENTION IS NOT A PROPERTY OF HOW OFTEN WE DEPLOY ────────────────
 *
 * `prune()` ran once at `onModuleInit` and never again, so a container up for
 * ninety days pruned on its first day and kept everything after it. The timer
 * is daily, `unref`'d, and cleared on destroy — a retention sweep is not a
 * reason for a process to stay alive, and certainly not for a test run to hang.
 */
describe('the retention sweep keeps sweeping', () => {
  it('schedules itself and lets go on destroy', async () => {
    const led = ledgerIn(mkdtempSync(join(tmpdir(), 'mira-')));
    await led.onModuleInit();
    const timer = (led as unknown as { timer?: NodeJS.Timeout }).timer;
    expect(timer).toBeDefined();
    led.onModuleDestroy();
    expect((led as unknown as { timer?: NodeJS.Timeout }).timer).toBeUndefined();
  });
});
